import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { clearSession, saveSession } from '../../api/client.js';
import { AuthContext } from '../../auth/useAuth.js';
import { jsonResponse, mockUser } from '../../test/testData.js';
import ReaderPage from './ReaderPage.jsx';

const rendererMocks = vi.hoisted(() => ({
  pdf: vi.fn(),
  epub: vi.fn(),
}));

vi.mock('./PdfReader.jsx', () => ({
  default: (props) => {
    rendererMocks.pdf(props);
    return (
      <div data-testid="pdf-renderer">
        <span>PDF URL: {props.contentUrl}</span>
        <span>PDF page: {props.initialLocation?.page || 1}</span>
        <span>PDF scale: {props.scale}</span>
        <button
          type="button"
          onClick={() => props.onPositionChange({
            reading_location: { type: 'pdf', page: 4 },
            reading_percentage: 42.15,
          })}
        >
          Передвинуть PDF
        </button>
        <button type="button" onClick={() => props.onContentError(new Error('expired'))}>
          Ошибка PDF
        </button>
      </div>
    );
  },
}));

vi.mock('./EpubReader.jsx', () => ({
  default: (props) => {
    rendererMocks.epub(props);
    return (
      <div data-testid="epub-renderer">
        <span>EPUB URL: {props.contentUrl}</span>
        <span>EPUB location: {props.initialLocation?.location || 'start'}</span>
        <span>EPUB font: {props.fontSize}</span>
        <button
          type="button"
          onClick={() => props.onPositionChange({
            reading_location: { type: 'epub', location: 'epubcfi(/6/8!/4/2)' },
            reading_percentage: 63.25,
          })}
        >
          Передвинуть EPUB
        </button>
      </div>
    );
  },
}));

const bookId = '7da55fa2-b522-4c4c-95fe-18d1c8111480';
const bookPath = `/api/knowledge/books/${bookId}/`;
const contentPath = `/api/knowledge/books/${bookId}/content/`;
const progressPath = `/api/knowledge/library/${bookId}/progress/`;

function book(format = 'pdf') {
  return {
    id: bookId,
    title: format === 'pdf' ? 'Книга в PDF' : 'Книга в EPUB',
    author: 'Автор книги',
    description: '',
    format,
    visibility: 'public',
    status: 'ready',
  };
}

function page(results) {
  return { count: results.length, next: null, previous: null, results };
}

function mockReaderApi({
  format = 'pdf',
  bookHandler,
  contentHandler,
  library = [],
  progressHandler,
} = {}) {
  const handlers = {
    [bookPath]: bookHandler || (() => Promise.resolve(jsonResponse(book(format)))),
    [contentPath]: contentHandler || (() => Promise.resolve(jsonResponse({
      url: `https://s3.example.test/${format}-book`,
      expires_in: 300,
    }))),
    '/api/knowledge/library/': () => Promise.resolve(jsonResponse(page(library))),
    [progressPath]: progressHandler || (() => Promise.resolve(jsonResponse({ ok: true }))),
  };
  const fetchMock = vi.fn((url, options) => {
    const handler = handlers[url];
    if (!handler) throw new Error(`Неожиданный запрос: ${url}`);
    return handler(options);
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function renderReader(authStatus = 'anonymous') {
  if (authStatus === 'authenticated') {
    saveSession({ access: 'reader-token', user: mockUser });
  }

  return render(
    <MemoryRouter initialEntries={[`/knowledge/books/${bookId}/read`]}>
      <AuthContext.Provider value={{
        status: authStatus,
        user: authStatus === 'authenticated' ? mockUser : null,
      }}>
        <Routes>
          <Route path="/knowledge/books/:id/read" element={<ReaderPage />} />
        </Routes>
      </AuthContext.Provider>
    </MemoryRouter>,
  );
}

afterEach(() => {
  cleanup();
  clearSession();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  rendererMocks.pdf.mockClear();
  rendererMocks.epub.mockClear();
  delete HTMLElement.prototype.requestFullscreen;
  delete document.exitFullscreen;
  delete document.fullscreenElement;
});

describe('ReaderPage', () => {
  it('открывает public PDF анонимно без library и progress запросов', async () => {
    const fetchMock = mockReaderApi();

    renderReader();

    expect(await screen.findByTestId('pdf-renderer')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Книга в PDF' })).toBeInTheDocument();
    expect(screen.getByText('PDF URL: https://s3.example.test/pdf-book')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Во весь экран' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Передвинуть PDF' }));
    expect(screen.getByLabelText('Прогресс чтения')).toHaveTextContent('42%');

    const requestedPaths = fetchMock.mock.calls.map(([path]) => path);
    expect(requestedPaths).toEqual(expect.arrayContaining([bookPath, contentPath]));
    expect(requestedPaths).not.toContain('/api/knowledge/library/');
    expect(requestedPaths).not.toContain(progressPath);
    for (const [path, options] of fetchMock.mock.calls) {
      if ([bookPath, contentPath].includes(path)) {
        expect(options.headers).toBeUndefined();
      }
    }
  });

  it('выбирает EPUB renderer по metadata книги', async () => {
    mockReaderApi({ format: 'epub' });

    renderReader();

    expect(await screen.findByTestId('epub-renderer')).toBeInTheDocument();
    expect(screen.queryByTestId('pdf-renderer')).not.toBeInTheDocument();
  });

  it('показывает error state и повторяет content request', async () => {
    let contentRequests = 0;
    mockReaderApi({
      contentHandler: () => {
        contentRequests += 1;
        return Promise.resolve(contentRequests === 1
          ? jsonResponse({ detail: 'Временная ошибка' }, 500)
          : jsonResponse({ url: 'https://s3.example.test/retry', expires_in: 300 }));
      },
    });
    const browser = userEvent.setup();

    renderReader();

    expect(await screen.findByRole('heading', { name: 'Не удалось открыть книгу.' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Назад' })).toHaveAttribute('href', '/knowledge');
    await browser.click(screen.getByRole('button', { name: 'Повторить' }));

    expect(await screen.findByText('PDF URL: https://s3.example.test/retry')).toBeInTheDocument();
    expect(contentRequests).toBe(2);
  });

  it('показывает отказ backend как нормальную ошибку доступа', async () => {
    mockReaderApi({
      bookHandler: () => Promise.resolve(jsonResponse({ detail: 'Нет доступа' }, 403)),
    });

    renderReader('authenticated');

    expect(await screen.findByRole('heading', {
      name: 'У вас нет доступа к этой книге.',
    })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Повторить' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Назад' })).toBeInTheDocument();
  });

  it('восстанавливает PDF page, обновляет percentage сразу и сохраняет через 5 секунд', async () => {
    const progressHandler = vi.fn(() => Promise.resolve(jsonResponse({ ok: true })));
    const fetchMock = mockReaderApi({
      library: [{
        id: 1,
        book: book('pdf'),
        reading_location: { type: 'pdf', page: 7 },
        reading_percentage: '36.40',
      }],
      progressHandler,
    });

    renderReader('authenticated');

    expect(await screen.findByText('PDF page: 7')).toBeInTheDocument();
    expect(screen.getByLabelText('Прогресс чтения')).toHaveTextContent('36%');
    for (const path of [bookPath, contentPath]) {
      expect(fetchMock).toHaveBeenCalledWith(path, expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer reader-token' }),
      }));
    }

    vi.useFakeTimers();
    fireEvent.click(screen.getByRole('button', { name: 'Передвинуть PDF' }));
    expect(screen.getByLabelText('Прогресс чтения')).toHaveTextContent('42%');
    expect(progressHandler).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });

    expect(progressHandler).toHaveBeenCalledWith(expect.objectContaining({
      method: 'PATCH',
      body: JSON.stringify({
        reading_location: { type: 'pdf', page: 4 },
        reading_percentage: 42.15,
      }),
      headers: expect.objectContaining({
        Authorization: 'Bearer reader-token',
        'Content-Type': 'application/json',
      }),
    }));
  });

  it('меняет PDF scale кнопками без пересоздания документа', async () => {
    mockReaderApi();
    const browser = userEvent.setup();
    renderReader();

    expect(await screen.findByText('PDF scale: 1')).toBeInTheDocument();
    await browser.click(screen.getByRole('button', { name: 'Увеличить масштаб' }));

    expect(screen.getByText('PDF scale: 1.15')).toBeInTheDocument();
    expect(rendererMocks.pdf.mock.calls.at(-1)[0].contentUrl).toBe(
      'https://s3.example.test/pdf-book',
    );
  });

  it('восстанавливает EPUB location, меняет font size и сохраняет CFI', async () => {
    const savedCfi = 'epubcfi(/6/4!/4/2)';
    const progressHandler = vi.fn(() => Promise.resolve(jsonResponse({ ok: true })));
    mockReaderApi({
      format: 'epub',
      library: [{
        id: 2,
        book: book('epub'),
        reading_location: { type: 'epub', location: savedCfi },
        reading_percentage: '22.80',
      }],
      progressHandler,
    });
    const browser = userEvent.setup();

    renderReader('authenticated');

    expect(await screen.findByText(`EPUB location: ${savedCfi}`)).toBeInTheDocument();
    await browser.click(screen.getByRole('button', { name: 'Увеличить размер текста' }));
    expect(screen.getByText('EPUB font: 110')).toBeInTheDocument();

    vi.useFakeTimers();
    fireEvent.click(screen.getByRole('button', { name: 'Передвинуть EPUB' }));
    expect(screen.getByLabelText('Прогресс чтения')).toHaveTextContent('63%');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });

    expect(progressHandler.mock.calls[0][0].body).toBe(JSON.stringify({
      reading_location: { type: 'epub', location: 'epubcfi(/6/8!/4/2)' },
      reading_percentage: 63.25,
    }));
  });

  it('оставляет reader рабочим при ошибке сохранения и пробует снова', async () => {
    let saveAttempts = 0;
    const progressHandler = vi.fn(() => {
      saveAttempts += 1;
      return Promise.resolve(saveAttempts === 1
        ? jsonResponse({ detail: 'Ошибка сохранения' }, 500)
        : jsonResponse({ ok: true }));
    });
    mockReaderApi({ progressHandler });
    renderReader('authenticated');
    await screen.findByTestId('pdf-renderer');

    vi.useFakeTimers();
    fireEvent.click(screen.getByRole('button', { name: 'Передвинуть PDF' }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });

    expect(screen.getByText('Не удалось сохранить прогресс')).toBeInTheDocument();
    expect(screen.getByTestId('pdf-renderer')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Передвинуть PDF' }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(progressHandler).toHaveBeenCalledTimes(2);
  });

  it('обновляет истёкший content URL один раз и сохраняет текущую позицию', async () => {
    let contentRequests = 0;
    mockReaderApi({
      contentHandler: () => {
        contentRequests += 1;
        return Promise.resolve(jsonResponse({
          url: `https://s3.example.test/url-${contentRequests}`,
          expires_in: 300,
        }));
      },
    });
    const browser = userEvent.setup();
    renderReader();

    expect(await screen.findByText('PDF URL: https://s3.example.test/url-1')).toBeInTheDocument();
    await browser.click(screen.getByRole('button', { name: 'Передвинуть PDF' }));
    await browser.click(screen.getByRole('button', { name: 'Ошибка PDF' }));

    expect(await screen.findByText('PDF URL: https://s3.example.test/url-2')).toBeInTheDocument();
    expect(screen.getByText('PDF page: 4')).toBeInTheDocument();

    await browser.click(screen.getByRole('button', { name: 'Ошибка PDF' }));
    expect(await screen.findByRole('heading', {
      name: 'Не удалось загрузить содержимое книги.',
    })).toBeInTheDocument();
    expect(contentRequests).toBe(2);
  });

  it('пытается сохранить последнюю позицию при уходе со страницы', async () => {
    const progressHandler = vi.fn(() => Promise.resolve(jsonResponse({ ok: true })));
    mockReaderApi({ progressHandler });
    const view = renderReader('authenticated');
    await screen.findByTestId('pdf-renderer');

    fireEvent.click(screen.getByRole('button', { name: 'Передвинуть PDF' }));
    view.unmount();

    expect(progressHandler).toHaveBeenCalledTimes(1);
  });

  it('следит за нативным fullscreen состоянием, включая выход по Esc', async () => {
    mockReaderApi();
    let fullscreenElement = null;
    Object.defineProperty(document, 'fullscreenElement', {
      configurable: true,
      get: () => fullscreenElement,
    });
    document.exitFullscreen = vi.fn(async () => {
      fullscreenElement = null;
      document.dispatchEvent(new Event('fullscreenchange'));
    });
    HTMLElement.prototype.requestFullscreen = vi.fn(async function requestFullscreen() {
      fullscreenElement = this;
      document.dispatchEvent(new Event('fullscreenchange'));
    });
    const browser = userEvent.setup();
    renderReader();
    await screen.findByTestId('pdf-renderer');

    await browser.click(screen.getByRole('button', { name: 'Во весь экран' }));
    expect(screen.getByRole('button', { name: 'Выйти из полного экрана' })).toBeInTheDocument();

    fullscreenElement = null;
    await act(async () => {
      document.dispatchEvent(new Event('fullscreenchange'));
    });
    expect(await screen.findByRole('button', { name: 'Во весь экран' })).toBeInTheDocument();
  });
});
