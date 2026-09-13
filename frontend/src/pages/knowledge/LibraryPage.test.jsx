import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { clearSession, saveSession } from '../../api/client.js';
import { jsonResponse, mockUser } from '../../test/testData.js';
import LibraryPage from './LibraryPage.jsx';

const book = {
  id: '584faf3f-e601-4c31-b078-7cc174a63457',
  title: 'Книга из библиотеки',
  author: 'Автор книги',
  description: 'Описание остаётся на странице книги.',
  language: 'ru',
  year: 2022,
  publisher: 'Library Press',
  cover_url: null,
  can_edit: true,
  is_in_library: true,
  format: 'epub',
  visibility: 'private',
  status: 'ready',
};

const item = {
  id: 18,
  book,
  reading_location: { type: 'epub', location: 'chapter-4' },
  reading_percentage: '37.50',
  added_at: '2026-08-30T13:00:00Z',
  updated_at: '2026-08-30T13:00:00Z',
};

const emptyPage = { count: 0, next: null, previous: null, results: [] };
const removePath = `/api/knowledge/library/${book.id}/`;

function deferred() {
  let resolve;
  const promise = new Promise((promiseResolve) => { resolve = promiseResolve; });
  return { promise, resolve };
}

function mockApi(handlers) {
  const fetchMock = vi.fn((url, options) => {
    const handler = handlers[url];
    if (!handler) throw new Error(`Неожиданный запрос: ${url}`);
    return handler(options);
  });
  vi.stubGlobal('fetch', fetchMock);
  saveSession({ access: 'library-token', user: mockUser });
  return fetchMock;
}

function renderPage() {
  return render(<MemoryRouter><LibraryPage /></MemoryRouter>);
}

afterEach(() => {
  cleanup();
  clearSession();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('LibraryPage', () => {
  it('показывает loading, затем книги, прогресс и ссылки', async () => {
    mockApi({
      '/api/knowledge/library/': () => Promise.resolve(jsonResponse({
        count: 1,
        next: null,
        previous: null,
        results: [item],
      })),
    });
    renderPage();

    expect(screen.getByRole('status', { name: 'Загружаем вашу библиотеку…' }))
      .toBeInTheDocument();
    const heading = await screen.findByRole('heading', { name: book.title });
    const card = heading.closest('article');
    expect(card).toHaveTextContent('37.50%');
    expect(card).not.toHaveTextContent(book.description);
    expect(screen.getByRole('img', { name: `Обложка книги «${book.title}» отсутствует` }))
      .toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Читать' }))
      .toHaveAttribute('href', `/knowledge/books/${book.id}/read`);
    expect(screen.getByRole('link', { name: 'Открыть книгу' }))
      .toHaveAttribute('href', `/knowledge/books/${book.id}`);
    expect(screen.getByRole('button', { name: 'Убрать из библиотеки' }))
      .toBeInTheDocument();
  });

  it('отменяет удаление после предупреждения о книге и прогрессе', async () => {
    const removeHandler = vi.fn();
    mockApi({
      '/api/knowledge/library/': () => Promise.resolve(jsonResponse({
        count: 1,
        next: null,
        previous: null,
        results: [item],
      })),
      [removePath]: removeHandler,
    });
    const browser = userEvent.setup();
    renderPage();

    await browser.click(await screen.findByRole('button', { name: 'Убрать из библиотеки' }));
    const dialog = screen.getByRole('dialog', { name: 'Убрать из библиотеки?' });
    expect(dialog).toHaveTextContent(`Книга «${book.title}» останется в каталоге`);
    expect(dialog).toHaveTextContent('сохранённый прогресс чтения будет сброшен');
    await browser.click(within(dialog).getByRole('button', { name: 'Отмена' }));

    expect(screen.queryByRole('dialog', { name: 'Убрать из библиотеки?' }))
      .not.toBeInTheDocument();
    expect(removeHandler).not.toHaveBeenCalled();
  });

  it('отправляет один авторизованный DELETE и локально показывает empty state', async () => {
    const pending = deferred();
    const removeHandler = vi.fn(() => pending.promise);
    const fetchMock = mockApi({
      '/api/knowledge/library/': () => Promise.resolve(jsonResponse({
        count: 1,
        next: null,
        previous: null,
        results: [item],
      })),
      [removePath]: removeHandler,
    });
    const browser = userEvent.setup();
    renderPage();

    await browser.click(await screen.findByRole('button', { name: 'Убрать из библиотеки' }));
    const dialog = screen.getByRole('dialog', { name: 'Убрать из библиотеки?' });
    await browser.click(within(dialog).getByRole('button', { name: 'Убрать из библиотеки' }));
    const pendingButton = screen.getByRole('button', { name: 'Убираем…' });
    expect(pendingButton).toBeDisabled();
    await browser.click(pendingButton);
    expect(removeHandler).toHaveBeenCalledTimes(1);

    pending.resolve(new Response(null, { status: 204 }));

    expect(await screen.findByRole('heading', {
      name: 'В вашей библиотеке пока нет книг.',
    })).toBeInTheDocument();
    expect(screen.getByText('0 книг')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: book.title })).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(removePath, expect.objectContaining({
      method: 'DELETE',
      credentials: 'include',
      headers: expect.objectContaining({ Authorization: 'Bearer library-token' }),
    }));
  });

  it('оставляет карточку при ошибке и разрешает повторить удаление', async () => {
    const removeHandler = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ detail: 'Ошибка' }, 500))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    mockApi({
      '/api/knowledge/library/': () => Promise.resolve(jsonResponse({
        count: 1,
        next: null,
        previous: null,
        results: [item],
      })),
      [removePath]: removeHandler,
    });
    const browser = userEvent.setup();
    renderPage();

    await browser.click(await screen.findByRole('button', { name: 'Убрать из библиотеки' }));
    await browser.click(screen.getByRole('button', { name: 'Убрать из библиотеки' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Не удалось убрать книгу из библиотеки',
    );
    expect(screen.getByText(book.title)).toBeInTheDocument();
    expect(screen.getByText('37.50%')).toBeInTheDocument();
    await browser.click(screen.getByRole('button', { name: 'Убрать из библиотеки' }));
    expect(removeHandler).toHaveBeenCalledTimes(2);
    expect(await screen.findByRole('heading', {
      name: 'В вашей библиотеке пока нет книг.',
    })).toBeInTheDocument();
  });

  it('показывает empty и error состояния', async () => {
    const view = mockApi({
      '/api/knowledge/library/': () => Promise.resolve(jsonResponse(emptyPage)),
    });
    const rendered = renderPage();
    expect(await screen.findByRole('heading', {
      name: 'В вашей библиотеке пока нет книг.',
    })).toBeInTheDocument();

    rendered.unmount();
    view.mockImplementation(() => Promise.resolve(jsonResponse({ detail: 'Ошибка' }, 500)));
    renderPage();
    expect(await screen.findByRole('heading', { name: 'Не удалось загрузить библиотеку.' }))
      .toBeInTheDocument();
  });

  it('переключает страницы библиотеки', async () => {
    const secondBook = { ...book, id: '711965a3-d329-479e-9758-cf5b8f8d66db', title: 'Вторая книга' };
    const fetchMock = mockApi({
      '/api/knowledge/library/': () => Promise.resolve(jsonResponse({
        count: 21,
        next: '/api/knowledge/library/?page=2',
        previous: null,
        results: [item],
      })),
      '/api/knowledge/library/?page=2': () => Promise.resolve(jsonResponse({
        count: 21,
        next: null,
        previous: '/api/knowledge/library/',
        results: [{ ...item, id: 19, book: secondBook }],
      })),
    });
    const browser = userEvent.setup();
    renderPage();

    await browser.click(await screen.findByRole('button', { name: 'Далее' }));

    expect(await screen.findByRole('heading', { name: secondBook.title })).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith('/api/knowledge/library/?page=2', expect.objectContaining({
      headers: expect.objectContaining({ Authorization: 'Bearer library-token' }),
    }));
  });

  it('после удаления единственной карточки непервой страницы загружает предыдущую', async () => {
    const secondBook = {
      ...book,
      id: '711965a3-d329-479e-9758-cf5b8f8d66db',
      title: 'Последняя книга второй страницы',
    };
    const firstPageHandler = vi.fn(() => Promise.resolve(jsonResponse(
      firstPageHandler.mock.calls.length === 1
        ? {
          count: 21,
          next: '/api/knowledge/library/?page=2',
          previous: null,
          results: [item],
        }
        : {
          count: 20,
          next: null,
          previous: null,
          results: [item],
        },
    )));
    const fetchMock = mockApi({
      '/api/knowledge/library/': firstPageHandler,
      '/api/knowledge/library/?page=2': () => Promise.resolve(jsonResponse({
        count: 21,
        next: null,
        previous: '/api/knowledge/library/',
        results: [{ ...item, id: 19, book: secondBook }],
      })),
      [`/api/knowledge/library/${secondBook.id}/`]: () => (
        Promise.resolve(new Response(null, { status: 204 }))
      ),
    });
    const browser = userEvent.setup();
    renderPage();
    await browser.click(await screen.findByRole('button', { name: 'Далее' }));
    await screen.findByRole('heading', { name: secondBook.title });

    await browser.click(screen.getByRole('button', { name: 'Убрать из библиотеки' }));
    await browser.click(screen.getByRole('button', { name: 'Убрать из библиотеки' }));

    expect(await screen.findByRole('heading', { name: book.title })).toBeInTheDocument();
    await waitFor(() => expect(firstPageHandler).toHaveBeenCalledTimes(2));
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/knowledge/library/${secondBook.id}/`,
      expect.objectContaining({ method: 'DELETE' }),
    );
    expect(screen.queryByText('Страница 2')).not.toBeInTheDocument();
  });
});
