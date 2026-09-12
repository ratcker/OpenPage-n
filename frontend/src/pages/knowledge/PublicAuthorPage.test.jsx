import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { jsonResponse } from '../../test/testData.js';
import PublicAuthorPage from './PublicAuthorPage.jsx';

const publicId = '9a7c27e5-c9d4-428f-bc28-7ebaf83088cf';
const author = {
  id: publicId,
  display_name: 'Анна Кузнецова',
  bio: 'Собираю материалы о дизайне и разработке.',
  avatar_url: 'https://storage.example.test/avatar.png',
};
const book = {
  id: '7da55fa2-b522-4c4c-95fe-18d1c8111480',
  title: 'Публичная книга автора',
  author: 'Библиографический автор',
  description: 'Описание книги.',
  language: 'ru',
  year: 2025,
  publisher: 'Опенпейч Пресс',
  cover_url: 'https://storage.example.test/cover.png',
  can_edit: false,
  format: 'epub',
  visibility: 'public',
  status: 'ready',
};
const article = {
  id: 'eb56e24a-6c4c-4dbf-903c-768df56e1ed4',
  title: 'Публичная статья автора',
  body: 'Короткий текст статьи.',
  visibility: 'public',
  author,
  can_edit: false,
  created_at: '2026-09-08T12:00:00Z',
  updated_at: '2026-09-08T12:00:00Z',
};

function page(results, overrides = {}) {
  return {
    count: results.length,
    next: null,
    previous: null,
    results,
    ...overrides,
  };
}

function mockAuthorApi(overrides = {}) {
  const handlers = {
    [`/api/knowledge/authors/${publicId}/`]: () => Promise.resolve(
      jsonResponse(author),
    ),
    [`/api/knowledge/authors/${publicId}/books/`]: () => Promise.resolve(
      jsonResponse(page([book])),
    ),
    [`/api/knowledge/authors/${publicId}/articles/`]: () => Promise.resolve(
      jsonResponse(page([article])),
    ),
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

function renderPage() {
  return render(
    <MemoryRouter initialEntries={[`/knowledge/authors/${publicId}`]}>
      <Routes>
        <Route
          path="/knowledge/authors/:publicId"
          element={<PublicAuthorPage />}
        />
      </Routes>
    </MemoryRouter>,
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('PublicAuthorPage', () => {
  it('анонимно показывает публичный профиль и существующую BookCard', async () => {
    const fetchMock = mockAuthorApi();
    renderPage();

    expect(await screen.findByRole('heading', { name: author.display_name }))
      .toBeInTheDocument();
    expect(screen.getByText(author.bio)).toBeInTheDocument();
    expect(screen.getByRole('img', { name: `Аватар автора ${author.display_name}` }))
      .toHaveAttribute('src', author.avatar_url);

    const card = (await screen.findByRole('heading', { name: book.title }))
      .closest('article');
    expect(within(card).getByRole('img', { name: `Обложка книги «${book.title}»` }))
      .toHaveAttribute('src', book.cover_url);
    expect(within(card).getByText('Библиографический автор · 2025'))
      .toBeInTheDocument();
    expect(within(card).getByText(book.publisher)).toBeInTheDocument();
    expect(within(card).getByRole('link', { name: 'Читать' }))
      .toHaveAttribute('href', `/knowledge/books/${book.id}/read`);
    expect(screen.getByRole('heading', { name: article.title })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: `Читать «${article.title}»` }))
      .toHaveAttribute('href', `/knowledge/articles/${article.id}`);
    expect(screen.queryByRole('button', { name: 'Редактировать профиль' }))
      .not.toBeInTheDocument();

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    for (const [, options] of fetchMock.mock.calls) {
      expect(options.headers).toBeUndefined();
    }
  });

  it('показывает простой fallback и скрывает пустое bio', async () => {
    mockAuthorApi({
      [`/api/knowledge/authors/${publicId}/`]: () => Promise.resolve(
        jsonResponse({ ...author, bio: '', avatar_url: null }),
      ),
    });
    renderPage();

    expect(await screen.findByText('АК')).toBeInTheDocument();
    expect(screen.queryByText(author.bio)).not.toBeInTheDocument();
    expect(screen.queryByText('null')).not.toBeInTheDocument();
  });

  it.each([
    [404, 'Автор не найден'],
    [500, 'Не удалось загрузить профиль'],
  ])('показывает отдельное состояние profile error %s', async (responseStatus, title) => {
    mockAuthorApi({
      [`/api/knowledge/authors/${publicId}/`]: () => Promise.resolve(
        jsonResponse({ detail: 'Ошибка' }, responseStatus),
      ),
    });
    renderPage();

    expect(await screen.findByRole('heading', { name: title })).toBeInTheDocument();
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Публичные книги' }))
      .not.toBeInTheDocument();
  });

  it('показывает независимые empty и books error states', async () => {
    const booksPath = `/api/knowledge/authors/${publicId}/books/`;
    mockAuthorApi({
      [booksPath]: () => Promise.resolve(jsonResponse(page([]))),
    });
    const firstRender = renderPage();

    expect(await screen.findByRole('heading', {
      name: 'У автора пока нет публичных книг.',
    })).toBeInTheDocument();

    firstRender.unmount();
    mockAuthorApi({
      [booksPath]: () => Promise.resolve(jsonResponse({ detail: 'Ошибка' }, 500)),
    });
    renderPage();

    expect(await screen.findByRole('heading', {
      name: 'Не удалось загрузить книги автора.',
    })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: author.display_name })).toBeInTheDocument();
  });

  it('показывает независимые empty и error states статей автора', async () => {
    const articlesPath = `/api/knowledge/authors/${publicId}/articles/`;
    mockAuthorApi({
      [articlesPath]: () => Promise.resolve(jsonResponse(page([]))),
    });
    const emptyRender = renderPage();

    expect(await screen.findByRole('heading', {
      name: 'У автора пока нет публичных статей.',
    })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: book.title })).toBeInTheDocument();

    emptyRender.unmount();
    mockAuthorApi({
      [articlesPath]: () => Promise.resolve(jsonResponse({ detail: 'Ошибка' }, 500)),
    });
    renderPage();

    expect(await screen.findByRole('heading', {
      name: 'Не удалось загрузить статьи автора.',
    })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: book.title })).toBeInTheDocument();
  });

  it('переключает страницы кнопками Назад и Далее', async () => {
    const firstPath = `/api/knowledge/authors/${publicId}/books/`;
    const secondPath = `${firstPath}?page=2`;
    const secondBook = { ...book, id: 'ec8ea9b7-c444-456f-989b-84f80dd5a814', title: 'Вторая страница' };
    const firstHandler = vi.fn(() => Promise.resolve(jsonResponse(page([book], {
      count: 2,
      next: `https://example.test${secondPath}`,
    }))));
    const secondHandler = vi.fn(() => Promise.resolve(jsonResponse(page([secondBook], {
      count: 2,
      previous: `https://example.test${firstPath}`,
    }))));
    mockAuthorApi({ [firstPath]: firstHandler, [secondPath]: secondHandler });
    const browser = userEvent.setup();
    renderPage();

    await browser.click(await screen.findByRole('button', { name: 'Далее' }));
    expect(await screen.findByRole('heading', { name: secondBook.title }))
      .toBeInTheDocument();
    expect(screen.getByText('Страница 2')).toBeInTheDocument();

    await browser.click(screen.getByRole('button', { name: 'Назад' }));
    expect(await screen.findByRole('heading', { name: book.title })).toBeInTheDocument();
    expect(firstHandler).toHaveBeenCalledTimes(2);
    expect(secondHandler).toHaveBeenCalledTimes(1);
  });

  it('переключает pagination статей независимо от книг', async () => {
    const firstPath = `/api/knowledge/authors/${publicId}/articles/`;
    const secondPath = `${firstPath}?page=2`;
    const secondArticle = {
      ...article,
      id: '2472e136-d016-472a-95bc-0e0bff970cc7',
      title: 'Вторая страница статей',
    };
    const firstHandler = vi.fn(() => Promise.resolve(jsonResponse(page([article], {
      count: 2,
      next: `https://example.test${secondPath}`,
    }))));
    const secondHandler = vi.fn(() => Promise.resolve(jsonResponse(page([secondArticle], {
      count: 2,
      previous: `https://example.test${firstPath}`,
    }))));
    mockAuthorApi({ [firstPath]: firstHandler, [secondPath]: secondHandler });
    const browser = userEvent.setup();
    renderPage();

    const articleNavigation = await screen.findByRole('navigation', {
      name: 'Страницы статей автора',
    });
    await browser.click(within(articleNavigation).getByRole('button', { name: 'Далее' }));

    expect(await screen.findByRole('heading', { name: secondArticle.title }))
      .toBeInTheDocument();
    expect(firstHandler).toHaveBeenCalledTimes(1);
    expect(secondHandler).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('heading', { name: book.title })).toBeInTheDocument();
  });

  it('не ломается от can_edit=true без owner controls на публичной странице', async () => {
    mockAuthorApi({
      [`/api/knowledge/authors/${publicId}/books/`]: () => Promise.resolve(
        jsonResponse(page([{ ...book, can_edit: true }])),
      ),
    });
    renderPage();

    expect(await screen.findByRole('heading', { name: book.title })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Редактировать' }))
      .not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Читать' })).toBeInTheDocument();
  });
});
