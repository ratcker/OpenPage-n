import { cleanup, render, screen } from '@testing-library/react';
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
});
