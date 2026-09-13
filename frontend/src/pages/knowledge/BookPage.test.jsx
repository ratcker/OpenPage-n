import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  MemoryRouter,
  Route,
  Routes,
  useLocation,
} from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { clearSession, saveSession } from '../../api/client.js';
import { AuthContext } from '../../auth/useAuth.js';
import { jsonResponse, mockUser } from '../../test/testData.js';
import BookPage from './BookPage.jsx';

const book = {
  id: '7da55fa2-b522-4c4c-95fe-18d1c8111480',
  title: 'Большая публичная книга',
  author: 'Анна Авторова',
  description: 'Полное описание книги\nсо второй строкой.',
  language: 'ru',
  year: 2024,
  publisher: 'Опенпейч Пресс',
  cover_url: 'https://storage.example.test/cover.jpg',
  can_edit: false,
  is_in_library: false,
  format: 'epub',
  visibility: 'public',
  publication_basis: 'author',
  rights_confirmed_at: '2026-08-30T12:00:00Z',
  rights_statement_version: '1',
  status: 'ready',
};

const detailPath = `/api/knowledge/books/${book.id}/`;
const progressPath = `/api/knowledge/books/${book.id}/progress/`;
const libraryPath = `/api/knowledge/library/${book.id}/`;
const shareDescriptor = Object.getOwnPropertyDescriptor(navigator, 'share');
const clipboardDescriptor = Object.getOwnPropertyDescriptor(navigator, 'clipboard');

function setNavigatorProperty(name, value) {
  Object.defineProperty(navigator, name, { configurable: true, value });
}

function restoreNavigatorProperty(name, descriptor) {
  if (descriptor) {
    Object.defineProperty(navigator, name, descriptor);
  } else {
    delete navigator[name];
  }
}

function deferred() {
  let resolve;
  const promise = new Promise((promiseResolve) => { resolve = promiseResolve; });
  return { promise, resolve };
}

function mockApi(overrides = {}) {
  const handlers = {
    [detailPath]: () => Promise.resolve(jsonResponse(book)),
    ...overrides,
  };
  const fetchMock = vi.fn((url, options) => {
    const handler = handlers[url];
    if (!handler) throw new Error(`Неожиданный запрос: ${url}`);
    return handler(options);
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function LoginProbe() {
  const location = useLocation();
  return <p>После входа: {location.state?.from || 'нет'}</p>;
}

function renderPage(authStatus = 'anonymous') {
  if (authStatus === 'authenticated') {
    saveSession({ access: 'book-token', user: mockUser });
  }
  return render(
    <MemoryRouter initialEntries={[`/knowledge/books/${book.id}`]}>
      <AuthContext.Provider value={{
        status: authStatus,
        user: authStatus === 'authenticated' ? mockUser : null,
      }}>
        <Routes>
          <Route path="/knowledge/books/:id" element={<BookPage />} />
          <Route path="/knowledge" element={<h1>Каталог после удаления</h1>} />
          <Route path="/login" element={<LoginProbe />} />
        </Routes>
      </AuthContext.Provider>
    </MemoryRouter>,
  );
}

afterEach(() => {
  cleanup();
  clearSession();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
  restoreNavigatorProperty('share', shareDescriptor);
  restoreNavigatorProperty('clipboard', clipboardDescriptor);
});

describe('BookPage', () => {
  it('показывает loading до завершения запроса', () => {
    mockApi({ [detailPath]: () => new Promise(() => {}) });
    renderPage();

    expect(screen.getByRole('status')).toHaveTextContent('Загружаем книгу…');
  });

  it('ждёт определения auth-состояния перед запросом приватной книги', async () => {
    const fetchMock = mockApi({
      [detailPath]: () => Promise.resolve(jsonResponse({
        ...book,
        visibility: 'private',
        can_edit: true,
        is_in_library: true,
      })),
      [progressPath]: () => Promise.resolve(jsonResponse({
        reading_location: { type: 'epub', location: 'chapter-2' },
        reading_percentage: '18.50',
        updated_at: '2026-09-01T10:00:00Z',
      })),
    });
    const view = renderPage('loading');

    expect(fetchMock).not.toHaveBeenCalled();
    saveSession({ access: 'book-token', user: mockUser });
    view.rerender(
      <MemoryRouter initialEntries={[`/knowledge/books/${book.id}`]}>
        <AuthContext.Provider value={{ status: 'authenticated', user: mockUser }}>
          <Routes><Route path="/knowledge/books/:id" element={<BookPage />} /></Routes>
        </AuthContext.Provider>
      </MemoryRouter>,
    );

    expect(await screen.findByRole('heading', { name: book.title })).toBeInTheDocument();
    expect(screen.getByText('18.50%')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(detailPath, expect.objectContaining({
      headers: expect.objectContaining({ Authorization: 'Bearer book-token' }),
    }));
  });

  it('показывает публичную книгу анонимно со всеми сведениями и действиями', async () => {
    mockApi();
    renderPage();

    expect(await screen.findByRole('heading', { name: book.title })).toBeInTheDocument();
    expect(screen.getByText(/Полное описание книги/)).toBeInTheDocument();
    for (const value of [book.author, String(book.year), book.publisher, 'RU', 'EPUB', 'Публичная']) {
      expect(screen.getByText(value)).toBeInTheDocument();
    }
    expect(screen.getByText('От автора')).toBeInTheDocument();
    expect(screen.getByText('О публикации')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: `Обложка книги «${book.title}»` }))
      .toHaveAttribute('src', book.cover_url);
    expect(screen.getByRole('link', { name: 'Читать' }))
      .toHaveAttribute('href', `/knowledge/books/${book.id}/read`);
    expect(screen.getByRole('button', { name: 'Поделиться' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: 'Редактировать' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Удалить книгу' })).not.toBeInTheDocument();
  });

  it('отправляет через Web Share только постоянную ссылку на публичную книгу', async () => {
    const pending = deferred();
    const share = vi.fn(() => pending.promise);
    const writeText = vi.fn();
    mockApi();
    const browser = userEvent.setup();
    setNavigatorProperty('share', share);
    setNavigatorProperty('clipboard', { writeText });
    renderPage();

    const shareButton = await screen.findByRole('button', { name: 'Поделиться' });
    await browser.click(shareButton);
    await browser.click(shareButton);

    const permalink = new URL(`/knowledge/books/${book.id}`, window.location.origin).toString();
    expect(share).toHaveBeenCalledTimes(1);
    expect(share).toHaveBeenCalledWith({
      title: book.title,
      text: `${book.title} — ${book.author}`,
      url: permalink,
    });
    expect(share.mock.calls[0][0].url).not.toContain('storage.example.test');
    expect(share.mock.calls[0][0].url).not.toMatch(/[?&]X-Amz-/i);
    expect(writeText).not.toHaveBeenCalled();

    pending.resolve();
    await waitFor(() => expect(shareButton).toBeEnabled());
  });

  it('копирует постоянную ссылку и показывает успешное состояние без Web Share', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    mockApi();
    const browser = userEvent.setup();
    setNavigatorProperty('share', undefined);
    setNavigatorProperty('clipboard', { writeText });
    renderPage();

    await browser.click(await screen.findByRole('button', { name: 'Поделиться' }));

    const permalink = new URL(`/knowledge/books/${book.id}`, window.location.origin).toString();
    expect(writeText).toHaveBeenCalledWith(permalink);
    expect(await screen.findByText('Ссылка скопирована')).toBeInTheDocument();
  });

  it('не показывает ошибку и не копирует ссылку после AbortError', async () => {
    const abortError = Object.assign(new Error('Пользователь закрыл меню'), {
      name: 'AbortError',
    });
    const share = vi.fn().mockRejectedValue(abortError);
    const writeText = vi.fn();
    mockApi();
    const browser = userEvent.setup();
    setNavigatorProperty('share', share);
    setNavigatorProperty('clipboard', { writeText });
    renderPage();

    const shareButton = await screen.findByRole('button', { name: 'Поделиться' });
    await browser.click(shareButton);

    await waitFor(() => expect(shareButton).toBeEnabled());
    expect(writeText).not.toHaveBeenCalled();
    expect(screen.queryByText('Ссылка скопирована')).not.toBeInTheDocument();
    expect(screen.queryByText(/Не удалось поделиться/)).not.toBeInTheDocument();
  });

  it('после ошибки Web Share использует Clipboard API', async () => {
    const share = vi.fn().mockRejectedValue(new Error('Web Share недоступен'));
    const writeText = vi.fn().mockResolvedValue(undefined);
    mockApi();
    const browser = userEvent.setup();
    setNavigatorProperty('share', share);
    setNavigatorProperty('clipboard', { writeText });
    renderPage();

    await browser.click(await screen.findByRole('button', { name: 'Поделиться' }));

    const permalink = new URL(`/knowledge/books/${book.id}`, window.location.origin).toString();
    expect(share).toHaveBeenCalledOnce();
    expect(writeText).toHaveBeenCalledWith(permalink);
    expect(await screen.findByText('Ссылка скопирована')).toBeInTheDocument();
  });

  it('при двух ошибках показывает постоянную ссылку для ручного копирования', async () => {
    mockApi();
    const browser = userEvent.setup();
    setNavigatorProperty('share', vi.fn().mockRejectedValue(new Error('Share error')));
    setNavigatorProperty('clipboard', {
      writeText: vi.fn().mockRejectedValue(new Error('Clipboard error')),
    });
    renderPage();

    await browser.click(await screen.findByRole('button', { name: 'Поделиться' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Не удалось поделиться автоматически');
    expect(within(alert).getByRole('textbox')).toHaveValue(
      new URL(`/knowledge/books/${book.id}`, window.location.origin).toString(),
    );
  });

  it('не позволяет поделиться приватной книгой и объясняет причину', async () => {
    const share = vi.fn();
    const writeText = vi.fn();
    setNavigatorProperty('share', share);
    setNavigatorProperty('clipboard', { writeText });
    mockApi({
      [detailPath]: () => Promise.resolve(jsonResponse({
        ...book,
        visibility: 'private',
        can_edit: true,
      })),
    });
    renderPage('authenticated');

    const shareButton = await screen.findByRole('button', {
      name: 'Пока нельзя поделиться',
    });
    expect(shareButton).toBeDisabled();
    const descriptionId = shareButton.getAttribute('aria-describedby');
    expect(descriptionId).toBeTruthy();
    expect(document.getElementById(descriptionId))
      .toHaveTextContent('Приватная книга недоступна другим пользователям.');

    fireEvent.click(shareButton);
    expect(share).not.toHaveBeenCalled();
    expect(writeText).not.toHaveBeenCalled();
  });

  it('очищает timeout успешного копирования при размонтировании', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    setNavigatorProperty('share', undefined);
    setNavigatorProperty('clipboard', { writeText });
    mockApi();
    const view = renderPage();
    const shareButton = await screen.findByRole('button', { name: 'Поделиться' });
    vi.useFakeTimers();

    fireEvent.click(shareButton);
    await act(async () => {});

    expect(screen.getByText('Ссылка скопирована')).toBeInTheDocument();
    expect(vi.getTimerCount()).toBe(1);
    view.unmount();
    expect(vi.getTimerCount()).toBe(0);
    await vi.runAllTimersAsync();
  });

  it('возвращает анонимного пользователя после входа на страницу книги', async () => {
    mockApi();
    const browser = userEvent.setup();
    renderPage();

    await browser.click(await screen.findByRole('link', { name: 'Войти, чтобы добавить' }));

    expect(screen.getByText(`После входа: /knowledge/books/${book.id}`)).toBeInTheDocument();
  });

  it('добавляет книгу один раз и локально показывает новый статус', async () => {
    const pending = deferred();
    const addHandler = vi.fn(() => pending.promise);
    mockApi({ [libraryPath]: addHandler });
    const browser = userEvent.setup();
    renderPage('authenticated');

    const addButton = await screen.findByRole('button', { name: 'Добавить в библиотеку' });
    await browser.click(addButton);
    expect(screen.getByRole('button', { name: 'Добавляем…' })).toBeDisabled();
    await browser.click(screen.getByRole('button', { name: 'Добавляем…' }));
    pending.resolve(jsonResponse({
      id: 10,
      book: { ...book, is_in_library: true },
      reading_percentage: '0.00',
    }, 201));

    expect(await screen.findByRole('button', { name: 'В библиотеке' })).toBeDisabled();
    expect(addHandler).toHaveBeenCalledTimes(1);
    expect(screen.getByText('0.00%')).toBeInTheDocument();
  });

  it('редактирует metadata владельца и сразу обновляет страницу', async () => {
    const ownBook = { ...book, can_edit: true, is_in_library: true };
    const updatedBook = { ...ownBook, title: 'Обновлённое название' };
    let patchOptions;
    mockApi({
      [detailPath]: (options) => {
        if (options?.method === 'PATCH') {
          patchOptions = options;
          return Promise.resolve(jsonResponse(updatedBook));
        }
        return Promise.resolve(jsonResponse(ownBook));
      },
      [progressPath]: () => Promise.resolve(jsonResponse({
        reading_location: null,
        reading_percentage: '12.00',
        updated_at: null,
      })),
    });
    const browser = userEvent.setup();
    renderPage('authenticated');

    await browser.click(await screen.findByRole('button', { name: 'Редактировать' }));
    await browser.clear(screen.getByLabelText('Название'));
    await browser.type(screen.getByLabelText('Название'), updatedBook.title);
    await browser.click(screen.getByRole('button', { name: 'Сохранить' }));

    expect(await screen.findByRole('heading', { name: updatedBook.title })).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'Редактировать книгу' })).not.toBeInTheDocument();
    expect(patchOptions.method).toBe('PATCH');
    expect(patchOptions.body).toBeInstanceOf(FormData);
  });

  it.each([
    [403, 'Нет доступа к книге'],
    [404, 'Книга не найдена'],
    [500, 'Не удалось загрузить книгу'],
  ])('показывает состояние ошибки %s и путь к каталогу', async (status, title) => {
    mockApi({
      [detailPath]: () => Promise.resolve(jsonResponse({ detail: 'Ошибка' }, status)),
    });
    renderPage();

    expect(await screen.findByRole('heading', { name: title })).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: /каталог|База знаний/i })[0])
      .toHaveAttribute('href', '/knowledge');
  });

  it('отменяет подтверждение без DELETE', async () => {
    const deleteHandler = vi.fn();
    mockApi({
      [detailPath]: (options) => (
        options?.method === 'DELETE'
          ? deleteHandler(options)
          : Promise.resolve(jsonResponse({ ...book, can_edit: true }))
      ),
    });
    const browser = userEvent.setup();
    renderPage('authenticated');

    await browser.click(await screen.findByRole('button', { name: 'Удалить книгу' }));
    expect(screen.getByRole('dialog', { name: 'Удалить книгу?' }))
      .toHaveTextContent(`Книга «${book.title}» исчезнет у всех читателей.`);
    expect(screen.getByRole('dialog', { name: 'Удалить книгу?' }))
      .toHaveTextContent('весь прогресс чтения');
    await browser.click(screen.getByRole('button', { name: 'Отмена' }));

    expect(screen.queryByRole('dialog', { name: 'Удалить книгу?' })).not.toBeInTheDocument();
    expect(deleteHandler).not.toHaveBeenCalled();
  });

  it('блокирует повторный DELETE и после 204 заменяет маршрут каталогом', async () => {
    const pending = deferred();
    const deleteHandler = vi.fn(() => pending.promise);
    mockApi({
      [detailPath]: (options) => (
        options?.method === 'DELETE'
          ? deleteHandler()
          : Promise.resolve(jsonResponse({ ...book, can_edit: true }))
      ),
    });
    const browser = userEvent.setup();
    renderPage('authenticated');

    await browser.click(await screen.findByRole('button', { name: 'Удалить книгу' }));
    const dialog = screen.getByRole('dialog', { name: 'Удалить книгу?' });
    await browser.click(within(dialog).getByRole('button', { name: 'Удалить книгу' }));
    expect(screen.getByRole('button', { name: 'Удаляем…' })).toBeDisabled();
    await browser.click(screen.getByRole('button', { name: 'Удаляем…' }));
    expect(deleteHandler).toHaveBeenCalledTimes(1);
    pending.resolve(new Response(null, { status: 204 }));

    expect(await screen.findByRole('heading', { name: 'Каталог после удаления' }))
      .toBeInTheDocument();
  });

  it('показывает ошибку DELETE внутри открытого диалога', async () => {
    mockApi({
      [detailPath]: (options) => (
        options?.method === 'DELETE'
          ? Promise.resolve(jsonResponse({ detail: 'Ошибка' }, 500))
          : Promise.resolve(jsonResponse({ ...book, can_edit: true }))
      ),
    });
    const browser = userEvent.setup();
    renderPage('authenticated');

    await browser.click(await screen.findByRole('button', { name: 'Удалить книгу' }));
    const dialog = screen.getByRole('dialog', { name: 'Удалить книгу?' });
    await browser.click(within(dialog).getByRole('button', { name: 'Удалить книгу' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Не удалось удалить книгу');
    expect(screen.getByRole('dialog', { name: 'Удалить книгу?' })).toBeInTheDocument();
    await browser.click(screen.getByRole('button', { name: 'Отмена' }));
    expect(screen.getByRole('heading', { name: book.title })).toBeInTheDocument();
  });
});
