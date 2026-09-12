import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { clearSession, saveSession } from '../../api/client.js';
import { jsonResponse, mockUser } from '../../test/testData.js';
import ArticleEditorPage from './ArticleEditorPage.jsx';

const articleId = 'eb56e24a-6c4c-4dbf-903c-768df56e1ed4';
const profile = {
  id: '9a7c27e5-c9d4-428f-bc28-7ebaf83088cf',
  display_name: 'Анна Кузнецова',
  bio: '',
  avatar_url: null,
};
const article = {
  id: articleId,
  title: 'Существующая статья',
  body: '# Исходный Markdown',
  visibility: 'private',
  author: profile,
  can_edit: true,
  created_at: '2026-09-08T12:00:00Z',
  updated_at: '2026-09-08T12:00:00Z',
};

function mockEditorApi(overrides = {}) {
  const handlers = {
    '/api/knowledge/profile/': () => Promise.resolve(jsonResponse(profile)),
    ...overrides,
  };
  const fetchMock = vi.fn((url, options) => {
    const handler = handlers[url];
    if (!handler) throw new Error(`Неожиданный запрос: ${url}`);
    return handler(options);
  });
  vi.stubGlobal('fetch', fetchMock);
  saveSession({ access: 'article-token', user: mockUser });
  return fetchMock;
}

function renderEditor(mode = 'create') {
  const path = mode === 'edit'
    ? `/knowledge/articles/${articleId}/edit`
    : '/knowledge/articles/new';
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/knowledge/articles/new" element={<ArticleEditorPage mode="create" />} />
        <Route path="/knowledge/articles/:id/edit" element={<ArticleEditorPage mode="edit" />} />
        <Route path="/knowledge/articles/:id" element={<h1>Статья сохранена</h1>} />
      </Routes>
    </MemoryRouter>,
  );
}

afterEach(() => {
  cleanup();
  clearSession();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('ArticleEditorPage', () => {
  it('создаёт статью без upload session и показывает локальный preview', async () => {
    let createOptions;
    const createdArticle = { ...article, title: 'Новая статья', visibility: 'public' };
    const fetchMock = mockEditorApi({
      '/api/knowledge/articles/': (options) => {
        createOptions = options;
        return Promise.resolve(jsonResponse(createdArticle, 201));
      },
    });
    const browser = userEvent.setup();
    renderEditor();

    await browser.type(await screen.findByLabelText('Название'), 'Новая статья');
    await browser.type(screen.getByLabelText('Текст в Markdown'), '## Предпросмотр\n\n**Текст**');
    await browser.selectOptions(screen.getByLabelText('Видимость'), 'public');
    await browser.click(screen.getByRole('tab', { name: 'Предпросмотр' }));

    expect(screen.getByRole('heading', { name: 'Предпросмотр' })).toBeInTheDocument();
    expect(screen.getByText('Текст')).toBeInTheDocument();
    await browser.click(screen.getByRole('button', { name: 'Сохранить статью' }));

    expect(await screen.findByRole('heading', { name: 'Статья сохранена' })).toBeInTheDocument();
    const payload = JSON.parse(createOptions.body);
    expect(payload).toEqual({
      title: 'Новая статья',
      body: '## Предпросмотр\n\n**Текст**',
      visibility: 'public',
    });
    expect(createOptions.headers).toEqual(expect.objectContaining({
      Authorization: 'Bearer article-token',
      'Content-Type': 'application/json',
    }));
    expect(fetchMock.mock.calls.map(([path]) => path)).not.toContain(
      '/api/knowledge/articles/upload-sessions/',
    );
    expect(screen.queryByLabelText('Описание')).not.toBeInTheDocument();
  });

  it('лениво создаёт одну session, загружает FormData и вставляет stable URL', async () => {
    const sessionId = '319f0f2e-ff95-4214-9863-427901bc2397';
    const sessionHandler = vi.fn(() => Promise.resolve(jsonResponse({
      id: sessionId,
      expires_at: '2026-09-09T12:00:00Z',
    }, 201)));
    const imageHandler = vi.fn(() => Promise.resolve(jsonResponse({
      id: '4a393183-34b5-4d75-af1e-625237256096',
      url: '/api/knowledge/article-images/4a393183-34b5-4d75-af1e-625237256096/',
      content_type: 'image/png',
      created_at: '2026-09-08T12:00:00Z',
    }, 201)));
    let createOptions;
    mockEditorApi({
      '/api/knowledge/articles/upload-sessions/': sessionHandler,
      [`/api/knowledge/articles/upload-sessions/${sessionId}/images/`]: imageHandler,
      '/api/knowledge/articles/': (options) => {
        createOptions = options;
        return Promise.resolve(jsonResponse(article, 201));
      },
    });
    const browser = userEvent.setup();
    renderEditor();

    await browser.type(await screen.findByLabelText('Название'), article.title);
    const firstImage = new File(['image-one'], 'Первая схема.png', { type: 'image/png' });
    const secondImage = new File(['image-two'], 'Вторая схема.png', { type: 'image/png' });
    const imageInput = screen.getByLabelText(/Добавить изображение/);
    await browser.upload(imageInput, firstImage);
    await waitFor(() => expect(screen.getByLabelText('Текст в Markdown')).toHaveValue(
      '![Первая схема](/api/knowledge/article-images/4a393183-34b5-4d75-af1e-625237256096/)',
    ));
    await browser.upload(screen.getByLabelText(/Добавить изображение/), secondImage);
    await waitFor(() => expect(imageHandler).toHaveBeenCalledTimes(2));

    expect(sessionHandler).toHaveBeenCalledTimes(1);
    for (const [options] of imageHandler.mock.calls) {
      expect(options.body).toBeInstanceOf(FormData);
      expect(options.body.get('image')).toBeInstanceOf(File);
      expect(options.headers).not.toHaveProperty('Content-Type');
    }

    await browser.click(screen.getByRole('button', { name: 'Сохранить статью' }));
    await screen.findByRole('heading', { name: 'Статья сохранена' });
    expect(JSON.parse(createOptions.body).upload_session_id).toBe(sessionId);
  });

  it('не меняет Markdown при ошибке image upload', async () => {
    const sessionId = '319f0f2e-ff95-4214-9863-427901bc2397';
    mockEditorApi({
      '/api/knowledge/articles/upload-sessions/': () => Promise.resolve(
        jsonResponse({ id: sessionId, expires_at: '2026-09-09T12:00:00Z' }, 201),
      ),
      [`/api/knowledge/articles/upload-sessions/${sessionId}/images/`]: () => (
        Promise.resolve(jsonResponse({ image: ['Неверный формат.'] }, 400))
      ),
    });
    const browser = userEvent.setup();
    renderEditor();

    await browser.type(await screen.findByLabelText('Текст в Markdown'), 'Сохранённый текст');
    const input = screen.getByLabelText(/Добавить изображение/);
    expect(input).toHaveAttribute(
      'accept',
      'image/jpeg,image/png,image/gif,image/webp',
    );
    await browser.upload(
      input,
      new File(['bad'], 'wrong.png', { type: 'image/png' }),
    );

    expect(await screen.findByRole('alert')).toHaveTextContent('Неверный формат.');
    expect(screen.getByLabelText('Текст в Markdown')).toHaveValue('Сохранённый текст');
  });

  it.each([
    [400, { title: ['Название обязательно.'] }, 'Название обязательно.'],
    [403, { detail: 'Нет прав.' }, 'Сохранение доступно только автору статьи.'],
    [500, { detail: 'Ошибка сервера.' }, 'Не удалось сохранить статью. Текст остался в редакторе.'],
  ])('сохраняет Markdown после ошибки сохранения %s', async (
    responseStatus,
    responseBody,
    expectedMessage,
  ) => {
    mockEditorApi({
      '/api/knowledge/articles/': () => Promise.resolve(
        jsonResponse(responseBody, responseStatus),
      ),
    });
    const browser = userEvent.setup();
    renderEditor();

    await browser.type(await screen.findByLabelText('Название'), 'Черновик');
    await browser.type(screen.getByLabelText('Текст в Markdown'), 'Текст не должен исчезнуть');
    await browser.click(screen.getByRole('button', { name: 'Сохранить статью' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(expectedMessage);
    expect(screen.getByLabelText('Название')).toHaveValue('Черновик');
    expect(screen.getByLabelText('Текст в Markdown')).toHaveValue('Текст не должен исчезнуть');
  });

  it('загружает существующую статью и отправляет PATCH с новой session', async () => {
    const sessionId = '319f0f2e-ff95-4214-9863-427901bc2397';
    let patchOptions;
    mockEditorApi({
      [`/api/knowledge/articles/${articleId}/`]: (options) => {
        if (options.method === 'PATCH') {
          patchOptions = options;
          return Promise.resolve(jsonResponse({ ...article, title: 'Обновлённая' }));
        }
        return Promise.resolve(jsonResponse(article));
      },
      '/api/knowledge/articles/upload-sessions/': () => Promise.resolve(
        jsonResponse({ id: sessionId, expires_at: '2026-09-09T12:00:00Z' }, 201),
      ),
      [`/api/knowledge/articles/upload-sessions/${sessionId}/images/`]: () => (
        Promise.resolve(jsonResponse({
          id: '4a393183-34b5-4d75-af1e-625237256096',
          url: '/api/knowledge/article-images/image-id/',
          content_type: 'image/webp',
          created_at: '2026-09-08T12:00:00Z',
        }, 201))
      ),
    });
    const browser = userEvent.setup();
    renderEditor('edit');

    expect(await screen.findByLabelText('Название')).toHaveValue(article.title);
    expect(screen.getByLabelText('Текст в Markdown')).toHaveValue(article.body);
    expect(screen.getByLabelText('Видимость')).toHaveValue('private');
    await browser.clear(screen.getByLabelText('Название'));
    await browser.type(screen.getByLabelText('Название'), 'Обновлённая');
    await browser.upload(
      screen.getByLabelText(/Добавить изображение/),
      new File(['webp'], 'Новая.webp', { type: 'image/webp' }),
    );
    await waitFor(() => expect(screen.getByLabelText('Текст в Markdown')).toHaveValue(
      `${article.body}\n\n![Новая](/api/knowledge/article-images/image-id/)`,
    ));
    await browser.click(screen.getByRole('button', { name: 'Сохранить статью' }));

    expect(await screen.findByRole('heading', { name: 'Статья сохранена' })).toBeInTheDocument();
    expect(patchOptions.method).toBe('PATCH');
    expect(JSON.parse(patchOptions.body)).toEqual({
      title: 'Обновлённая',
      body: `${article.body}\n\n![Новая](/api/knowledge/article-images/image-id/)`,
      visibility: 'private',
      upload_session_id: sessionId,
    });
  });

  it('не открывает editor без профиля или backend can_edit', async () => {
    mockEditorApi({
      '/api/knowledge/profile/': () => Promise.resolve(
        jsonResponse({ detail: 'Не найдено' }, 404),
      ),
    });
    const missingProfile = renderEditor();
    expect(await screen.findByRole('heading', { name: 'Нужен профиль автора' }))
      .toBeInTheDocument();

    missingProfile.unmount();
    mockEditorApi({
      [`/api/knowledge/articles/${articleId}/`]: () => Promise.resolve(
        jsonResponse({ ...article, can_edit: false }),
      ),
    });
    renderEditor('edit');
    expect(await screen.findByRole('heading', { name: 'Редактирование недоступно' }))
      .toBeInTheDocument();
  });
});
