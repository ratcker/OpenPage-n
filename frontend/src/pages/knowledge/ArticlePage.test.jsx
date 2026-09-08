import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { clearSession, saveSession } from '../../api/client.js';
import { AuthContext } from '../../auth/useAuth.js';
import { jsonResponse, mockUser } from '../../test/testData.js';
import ArticlePage from './ArticlePage.jsx';

const articleId = 'eb56e24a-6c4c-4dbf-903c-768df56e1ed4';
const article = {
  id: articleId,
  title: 'Безопасный Markdown',
  body: [
    '## Подзаголовок',
    '',
    'Обычный **жирный** текст и [ссылка](https://example.test).',
    '',
    '- Первый пункт',
    '- Второй пункт',
    '',
    '`const answer = 42`',
    '',
    '![Схема](/api/knowledge/article-images/image-id/)',
    '',
    '<script>window.articleUnsafe = true</script>',
  ].join('\n'),
  visibility: 'public',
  author: {
    id: '9a7c27e5-c9d4-428f-bc28-7ebaf83088cf',
    display_name: 'Анна Кузнецова',
    bio: '',
    avatar_url: 'https://storage.example.test/avatar.png',
  },
  can_edit: false,
  created_at: '2026-09-08T12:00:00Z',
  updated_at: '2026-09-08T12:00:00Z',
};

function mockArticleApi(handler) {
  const fetchMock = vi.fn((url, options) => {
    if (url !== `/api/knowledge/articles/${articleId}/`) {
      throw new Error(`Неожиданный запрос: ${url}`);
    }
    return handler(options);
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function renderPage(authStatus = 'anonymous') {
  return render(
    <MemoryRouter initialEntries={[`/knowledge/articles/${articleId}`]}>
      <AuthContext.Provider value={{
        status: authStatus,
        user: authStatus === 'authenticated' ? mockUser : null,
      }}>
        <Routes>
          <Route path="/knowledge/articles/:id" element={<ArticlePage />} />
          <Route path="/knowledge" element={<h1>Список статей</h1>} />
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
  delete window.articleUnsafe;
});

describe('ArticlePage', () => {
  it('анонимно читает Markdown без выполнения raw HTML', async () => {
    const fetchMock = mockArticleApi(() => Promise.resolve(jsonResponse(article)));

    renderPage();

    expect(await screen.findByRole('heading', { name: article.title })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Подзаголовок' })).toBeInTheDocument();
    expect(screen.getByText('жирный').tagName).toBe('STRONG');
    expect(screen.getByRole('list')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'ссылка' })).toHaveAttribute(
      'href',
      'https://example.test',
    );
    expect(screen.getByRole('img', { name: 'Схема' })).toHaveAttribute(
      'src',
      '/api/knowledge/article-images/image-id/',
    );
    expect(screen.queryByText(/window\.articleUnsafe/)).not.toBeInTheDocument();
    expect(window.articleUnsafe).toBeUndefined();
    expect(screen.queryByRole('link', { name: 'Редактировать' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Удалить статью' })).not.toBeInTheDocument();
    expect(fetchMock.mock.calls[0][1].headers).toBeUndefined();
  });

  it('показывает owner controls только по can_edit и удаляет после подтверждения', async () => {
    saveSession({ access: 'article-token', user: mockUser });
    const fetchMock = mockArticleApi((options) => {
      if (options.method === 'DELETE') return Promise.resolve(new Response(null, { status: 204 }));
      return Promise.resolve(jsonResponse({ ...article, can_edit: true }));
    });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const browser = userEvent.setup();

    renderPage('authenticated');

    expect(await screen.findByRole('link', { name: 'Редактировать' })).toHaveAttribute(
      'href',
      `/knowledge/articles/${articleId}/edit`,
    );
    await browser.click(screen.getByRole('button', { name: 'Удалить статью' }));

    expect(await screen.findByRole('heading', { name: 'Список статей' })).toBeInTheDocument();
    expect(window.confirm).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/knowledge/articles/${articleId}/`,
      expect.objectContaining({
        method: 'DELETE',
        headers: expect.objectContaining({ Authorization: 'Bearer article-token' }),
      }),
    );
  });

  it.each([
    [403, 'Статья недоступна'],
    [404, 'Статья не найдена'],
    [500, 'Не удалось загрузить статью'],
  ])('показывает отдельное состояние ошибки %s', async (statusCode, title) => {
    mockArticleApi(() => Promise.resolve(jsonResponse({ detail: 'Ошибка' }, statusCode)));

    renderPage();

    expect(await screen.findByRole('heading', { name: title })).toBeInTheDocument();
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('оставляет статью на месте при ошибке удаления', async () => {
    saveSession({ access: 'article-token', user: mockUser });
    mockArticleApi((options) => (
      options.method === 'DELETE'
        ? Promise.resolve(jsonResponse({ detail: 'Ошибка' }, 500))
        : Promise.resolve(jsonResponse({ ...article, can_edit: true }))
    ));
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const browser = userEvent.setup();
    renderPage('authenticated');

    await browser.click(await screen.findByRole('button', { name: 'Удалить статью' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Не удалось удалить статью');
    expect(screen.getByRole('heading', { name: article.title })).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Удалить статью' })).toBeEnabled();
    });
  });
});
