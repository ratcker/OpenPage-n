import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { clearSession, saveSession } from '../../api/client.js';
import { AuthContext } from '../../auth/useAuth.js';
import { jsonResponse, mockUser } from '../../test/testData.js';
import KnowledgePage from './KnowledgePage.jsx';

const emptyPage = {
  count: 0,
  next: null,
  previous: null,
  results: [],
};

const publicBook = {
  id: '7da55fa2-b522-4c4c-95fe-18d1c8111480',
  title: 'Публичная книга из API',
  author: 'Автор каталога',
  description: 'Описание публичной книги.',
  format: 'epub',
  visibility: 'public',
  status: 'ready',
  created_at: '2026-08-30T12:00:00Z',
  updated_at: '2026-08-30T12:00:00Z',
};

const libraryBook = {
  ...publicBook,
  id: '584faf3f-e601-4c31-b078-7cc174a63457',
  title: 'Книга из личной библиотеки',
  author: 'Автор библиотеки',
  format: 'pdf',
  visibility: 'private',
};

const libraryItem = {
  id: 18,
  book: libraryBook,
  reading_location: { chapter: 'chapter-4' },
  reading_percentage: '37.50',
  added_at: '2026-08-30T13:00:00Z',
  updated_at: '2026-08-30T13:00:00Z',
};

const profile = {
  id: 9,
  display_name: 'Анна Кузнецова',
  bio: 'Собираю материалы о дизайне и разработке.',
  avatar: 'АК',
};

function page(results) {
  return {
    count: results.length,
    next: null,
    previous: null,
    results,
  };
}

function mockKnowledgeApi(overrides = {}, withSession = true) {
  const handlers = {
    '/api/knowledge/books/': () => Promise.resolve(jsonResponse(page([publicBook]))),
    '/api/knowledge/library/': () => Promise.resolve(jsonResponse(page([libraryItem]))),
    '/api/knowledge/profile/': () => Promise.resolve(jsonResponse(profile)),
    ...overrides,
  };
  const fetchMock = vi.fn((url, options) => {
    const handler = handlers[url];
    if (!handler) throw new Error(`Неожиданный запрос: ${url}`);
    return handler(options);
  });

  vi.stubGlobal('fetch', fetchMock);
  if (withSession) saveSession({ access: 'knowledge-token', user: mockUser });
  return fetchMock;
}

function renderPage(authStatus = 'authenticated') {
  return render(
    <MemoryRouter>
      <AuthContext.Provider value={{
        status: authStatus,
        user: authStatus === 'authenticated' ? mockUser : null,
      }}>
        <KnowledgePage />
      </AuthContext.Provider>
    </MemoryRouter>,
  );
}

afterEach(() => {
  cleanup();
  clearSession();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('KnowledgePage', () => {
  it('запрашивает и показывает каталог, библиотеку, progress и профиль', async () => {
    const fetchMock = mockKnowledgeApi();

    renderPage();

    expect(await screen.findByRole('heading', { name: publicBook.title })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: libraryBook.title })).toBeInTheDocument();
    expect(screen.getByText('37.50%')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: profile.display_name })).toBeInTheDocument();
    expect(screen.getByText(profile.bio)).toBeInTheDocument();
    expect(screen.getByText('АК')).toBeInTheDocument();

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/knowledge/books/',
      expect.objectContaining({ credentials: 'include' }),
    );
    expect(fetchMock.mock.calls.find(([path]) => (
      path === '/api/knowledge/books/'
    ))[1].headers).toBeUndefined();

    for (const path of [
      '/api/knowledge/library/',
      '/api/knowledge/profile/',
    ]) {
      expect(fetchMock).toHaveBeenCalledWith(path, expect.objectContaining({
        credentials: 'include',
        headers: expect.objectContaining({ Authorization: 'Bearer knowledge-token' }),
      }));
    }
  });

  it('показывает anonymous пользователю только публичный каталог', async () => {
    const fetchMock = mockKnowledgeApi({}, false);

    renderPage('anonymous');

    expect(await screen.findByRole('heading', { name: publicBook.title })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Публичный каталог' })).toBeInTheDocument();
    expect(screen.getByRole('heading', {
      name: 'Войдите, чтобы открыть личную библиотеку.',
    })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Войти' })).toHaveAttribute('href', '/login');

    const requestedPaths = fetchMock.mock.calls.map(([path]) => path);
    expect(requestedPaths).toEqual(['/api/knowledge/books/']);
  });

  it('показывает независимые loading states без изменения макета', () => {
    const pendingRequest = new Promise(() => {});
    mockKnowledgeApi({
      '/api/knowledge/books/': () => pendingRequest,
      '/api/knowledge/library/': () => pendingRequest,
      '/api/knowledge/profile/': () => pendingRequest,
    });

    renderPage();

    expect(screen.getByRole('status', { name: 'Загружаем публичные книги…' })).toBeInTheDocument();
    expect(screen.getByRole('status', { name: 'Загружаем вашу библиотеку…' })).toBeInTheDocument();
    expect(screen.getByText('Загружаем профиль…')).toBeInTheDocument();
  });

  it('показывает отдельные empty states каталога и библиотеки', async () => {
    mockKnowledgeApi({
      '/api/knowledge/books/': () => Promise.resolve(jsonResponse(emptyPage)),
      '/api/knowledge/library/': () => Promise.resolve(jsonResponse(emptyPage)),
    });

    renderPage();

    expect(await screen.findByRole('heading', { name: 'Публичных книг пока нет.' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'В вашей библиотеке пока нет книг.' })).toBeInTheDocument();
  });

  it('не ломает библиотеку и профиль при ошибке каталога', async () => {
    mockKnowledgeApi({
      '/api/knowledge/books/': () => Promise.resolve(
        jsonResponse({ detail: 'Ошибка каталога' }, 500),
      ),
    });

    renderPage();

    expect(await screen.findByRole('heading', { name: 'Не удалось загрузить каталог.' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: libraryBook.title })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: profile.display_name })).toBeInTheDocument();
  });

  it('не ломает каталог и профиль при ошибке библиотеки', async () => {
    mockKnowledgeApi({
      '/api/knowledge/library/': () => Promise.resolve(
        jsonResponse({ detail: 'Ошибка библиотеки' }, 500),
      ),
    });

    renderPage();

    expect(await screen.findByRole('heading', { name: 'Не удалось загрузить библиотеку.' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: publicBook.title })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: profile.display_name })).toBeInTheDocument();
  });

  it('считает отсутствие профиля нормальным состоянием читателя', async () => {
    mockKnowledgeApi({
      '/api/knowledge/profile/': () => Promise.resolve(
        jsonResponse({ detail: 'Профиль не найден' }, 404),
      ),
    });

    renderPage();

    expect(await screen.findByRole('heading', { name: 'Профиль автора не создан' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: publicBook.title })).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('отличает серверную ошибку профиля от missing state', async () => {
    mockKnowledgeApi({
      '/api/knowledge/profile/': () => Promise.resolve(
        jsonResponse({ detail: 'Ошибка профиля' }, 503),
      ),
    });

    renderPage();

    expect(await screen.findByRole('heading', { name: 'Не удалось загрузить профиль.' })).toBeInTheDocument();
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.queryByText('Профиль автора не создан')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: publicBook.title })).toBeInTheDocument();
  });

  it('сохраняет локальное переключение на визуальный раздел статей', async () => {
    mockKnowledgeApi();
    const browser = userEvent.setup();
    renderPage();

    await screen.findByRole('heading', { name: publicBook.title });
    await browser.click(screen.getByRole('tab', { name: 'Статьи' }));

    expect(screen.getByRole('heading', { name: 'Статьи' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Ваши книги' })).not.toBeInTheDocument();
  });
});
