import { StrictMode } from 'react';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import App from './App.jsx';
import { authorizedRequest, clearSession } from './api/client.js';
import AuthProvider from './auth/AuthProvider.jsx';
import {
  jsonResponse,
  mockSession as session,
  mockUser as user,
} from './test/testData.js';

vi.mock('./pages/knowledge/ReaderPage.jsx', () => ({
  default: () => <main><h1>Публичная читалка</h1></main>,
}));

// Маленький маршрутизатор fetch держит сетевые сценарии тестов короткими.
function mockApi(handlers) {
  const fetchMock = vi.fn((url, options) => {
    const handler = handlers[url];
    if (!handler) throw new Error(`Неожиданный запрос: ${url}`);
    return handler(options);
  });

  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function anonymousRefresh() {
  return Promise.resolve(jsonResponse({ detail: 'Нет refresh cookie' }, 401));
}

function renderApp(route, withAuth = true) {
  const application = <App />;

  return render(
    <StrictMode>
      <MemoryRouter initialEntries={[route]}>
        {withAuth ? <AuthProvider>{application}</AuthProvider> : application}
      </MemoryRouter>
    </StrictMode>,
  );
}

async function fillLoginForm(browser) {
  await browser.type(screen.getByLabelText('Почта'), user.email);
  await browser.type(screen.getByLabelText('Пароль'), 'secret-password');
  await browser.click(screen.getByRole('button', { name: 'Войти' }));
}

afterEach(() => {
  cleanup();
  clearSession();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('авторизация и маршруты', () => {
  it('возвращает на /profile после входа с защищённого маршрута', async () => {
    const loginHandler = vi.fn(() => Promise.resolve(jsonResponse(session)));
    mockApi({
      '/api/auth/refresh/': anonymousRefresh,
      '/api/auth/login/': loginHandler,
    });
    const browser = userEvent.setup();

    renderApp('/profile');

    expect(await screen.findByRole('heading', { name: 'Войти' })).toBeInTheDocument();
    await fillLoginForm(browser);

    expect(await screen.findByRole('heading', { name: 'Профиль' })).toBeInTheDocument();
    expect(screen.getByText(user.name)).toBeInTheDocument();
    expect(screen.getByText(user.email)).toBeInTheDocument();
    expect(loginHandler).toHaveBeenCalledWith(expect.objectContaining({
      method: 'POST',
      credentials: 'include',
      body: JSON.stringify({ email: user.email, password: 'secret-password' }),
    }));
  });

  it('ведёт на /hub после обычного входа', async () => {
    mockApi({
      '/api/auth/refresh/': anonymousRefresh,
      '/api/auth/login/': () => Promise.resolve(jsonResponse(session)),
    });
    const browser = userEvent.setup();

    renderApp('/login');
    await screen.findByRole('heading', { name: 'Войти' });
    await fillLoginForm(browser);

    expect(await screen.findByRole('heading', { name: 'Сервисы рядом' })).toBeInTheDocument();
  });

  it('оставляет ошибку backend видимой и не создаёт сессию', async () => {
    mockApi({
      '/api/auth/refresh/': anonymousRefresh,
      '/api/auth/login/': () => Promise.resolve(jsonResponse({ detail: 'Неверная почта или пароль' }, 400)),
    });
    const browser = userEvent.setup();

    renderApp('/login');
    await screen.findByRole('heading', { name: 'Войти' });
    await fillLoginForm(browser);

    expect(await screen.findByRole('alert')).toHaveTextContent('Неверная почта или пароль');
    expect(screen.getByRole('heading', { name: 'Войти' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Профиль' })).not.toBeInTheDocument();
  });

  it('очищает frontend-сессию, если logout завершился сетевой ошибкой', async () => {
    const logoutHandler = vi.fn(() => Promise.reject(new TypeError('Failed to fetch')));
    const afterLogoutHandler = vi.fn(() => Promise.resolve(jsonResponse({ ok: true })));
    mockApi({
      '/api/auth/refresh/': () => Promise.resolve(jsonResponse(session)),
      '/api/auth/logout/': logoutHandler,
      '/api/auth/after-logout/': afterLogoutHandler,
    });
    const browser = userEvent.setup();

    renderApp('/profile');

    expect(await screen.findByRole('heading', { name: 'Профиль' })).toBeInTheDocument();
    expect(screen.getByText(user.email)).toBeInTheDocument();
    await browser.click(screen.getByRole('button', { name: 'Выйти' }));

    expect(await screen.findByRole('heading', { name: 'Войти' })).toBeInTheDocument();
    expect(screen.queryByText(user.email)).not.toBeInTheDocument();
    await authorizedRequest('/after-logout/');
    expect(afterLogoutHandler.mock.calls[0][0].headers).not.toHaveProperty('Authorization');
    expect(logoutHandler).toHaveBeenCalledWith(expect.objectContaining({
      method: 'POST',
      credentials: 'include',
    }));
  });

  it.each([
    ['/', 'Перейти в хаб'],
    ['/hub', 'Сервисы рядом'],
  ])('оставляет %s публичным', (route, accessibleName) => {
    renderApp(route, false);

    expect(screen.getByRole(route === '/' ? 'link' : 'heading', { name: accessibleName })).toBeInTheDocument();
  });

  it('открывает Базу знаний из каталога, сохраняя карточку будущих сервисов', async () => {
    const emptyPage = {
      count: 0,
      next: null,
      previous: null,
      results: [],
    };
    const fetchMock = mockApi({
      '/api/auth/refresh/': () => Promise.resolve(jsonResponse(session)),
      '/api/knowledge/books/': () => Promise.resolve(jsonResponse(emptyPage)),
      '/api/knowledge/library/': () => Promise.resolve(jsonResponse(emptyPage)),
      '/api/knowledge/profile/': () => Promise.resolve(jsonResponse({ detail: 'Не найдено' }, 404)),
    });
    const browser = userEvent.setup();
    renderApp('/hub');

    expect(screen.getByText('Готовим новые сервисы.')).toBeInTheDocument();
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/auth/refresh/',
        expect.anything(),
      );
    });
    await browser.click(screen.getByRole('link', { name: /База знаний/ }));

    expect(await screen.findByRole('heading', { name: 'База знаний' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Книги' })).toHaveAttribute('aria-selected', 'true');
  });

  it('открывает анонимному читателю публичную Базу знаний', async () => {
    const emptyPage = {
      count: 0,
      next: null,
      previous: null,
      results: [],
    };
    const fetchMock = mockApi({
      '/api/auth/refresh/': anonymousRefresh,
      '/api/knowledge/books/': () => Promise.resolve(jsonResponse(emptyPage)),
    });

    renderApp('/knowledge');

    expect(await screen.findByRole('heading', { name: 'База знаний' })).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: 'Публичный каталог' })).toBeInTheDocument();
    expect(screen.getByRole('heading', {
      name: 'Войдите, чтобы открыть личную библиотеку.',
    })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Войти' })).not.toBeInTheDocument();

    const requestedPaths = fetchMock.mock.calls.map(([path]) => path);
    expect(requestedPaths).toContain('/api/knowledge/books/');
    expect(requestedPaths).not.toContain('/api/knowledge/library/');
    expect(requestedPaths).not.toContain('/api/knowledge/profile/');
  });

  it('оставляет reader route доступным анонимному пользователю', async () => {
    mockApi({
      '/api/auth/refresh/': anonymousRefresh,
    });

    renderApp('/knowledge/books/7da55fa2-b522-4c4c-95fe-18d1c8111480/read');

    expect(await screen.findByRole('heading', { name: 'Публичная читалка' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Войти' })).not.toBeInTheDocument();
  });

  it('оставляет public article route доступным анонимному пользователю', async () => {
    const articleId = 'eb56e24a-6c4c-4dbf-903c-768df56e1ed4';
    mockApi({
      '/api/auth/refresh/': anonymousRefresh,
      [`/api/knowledge/articles/${articleId}/`]: () => Promise.resolve(jsonResponse({
        id: articleId,
        title: 'Публичная статья',
        body: '# Содержимое',
        visibility: 'public',
        author: null,
        can_edit: false,
        created_at: '2026-09-08T12:00:00Z',
        updated_at: '2026-09-08T12:00:00Z',
      })),
    });

    renderApp(`/knowledge/articles/${articleId}`);

    expect(await screen.findByRole('heading', { name: 'Публичная статья' }))
      .toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Содержимое' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Войти' })).not.toBeInTheDocument();
  });

  it('защищает route нового article editor авторизацией', async () => {
    mockApi({ '/api/auth/refresh/': anonymousRefresh });

    renderApp('/knowledge/articles/new');

    expect(await screen.findByRole('heading', { name: 'Войти' })).toBeInTheDocument();
  });

  it('оставляет public author route доступным анонимному пользователю', async () => {
    const publicId = '9a7c27e5-c9d4-428f-bc28-7ebaf83088cf';
    const fetchMock = mockApi({
      '/api/auth/refresh/': anonymousRefresh,
      [`/api/knowledge/authors/${publicId}/`]: () => Promise.resolve(jsonResponse({
        id: publicId,
        display_name: 'Публичный автор',
        bio: '',
        avatar_url: null,
      })),
      [`/api/knowledge/authors/${publicId}/books/`]: () => Promise.resolve(jsonResponse({
        count: 0,
        next: null,
        previous: null,
        results: [],
      })),
      [`/api/knowledge/authors/${publicId}/articles/`]: () => Promise.resolve(jsonResponse({
        count: 0,
        next: null,
        previous: null,
        results: [],
      })),
    });

    renderApp(`/knowledge/authors/${publicId}`);

    expect(await screen.findByRole('heading', { name: 'Публичный автор' }))
      .toBeInTheDocument();
    expect(screen.getByRole('heading', {
      name: 'У автора пока нет публичных книг.',
    })).toBeInTheDocument();
    const requestedPaths = fetchMock.mock.calls.map(([path]) => path);
    expect(requestedPaths).not.toContain('/api/knowledge/profile/');
  });

  it('автоматически входит после подтверждения email', async () => {
    const verifyHandler = vi.fn(() => Promise.resolve(jsonResponse({ detail: 'Email confirmed' })));
    const loginHandler = vi.fn(() => Promise.resolve(jsonResponse(session)));
    mockApi({
      '/api/auth/refresh/': anonymousRefresh,
      '/api/auth/register/': () => Promise.resolve(jsonResponse({ email: user.email }, 201)),
      '/api/auth/verify-email/': verifyHandler,
      '/api/auth/login/': loginHandler,
    });
    const browser = userEvent.setup();

    renderApp('/login');
    await screen.findByRole('heading', { name: 'Войти' });
    await browser.click(screen.getByRole('button', { name: 'Нет аккаунта? Зарегистрироваться' }));
    await browser.type(screen.getByLabelText('Имя'), user.name);
    await browser.type(screen.getByLabelText('Почта'), user.email);
    await browser.type(screen.getByLabelText('Пароль'), 'secret-password');
    await browser.type(screen.getByLabelText('Повторите пароль'), 'secret-password');
    await browser.click(screen.getByRole('button', { name: 'Зарегистрироваться' }));

    expect(await screen.findByRole('dialog', { name: 'Проверьте почту' })).toBeInTheDocument();
    await browser.type(screen.getByLabelText('Код подтверждения'), '123456');
    await browser.click(screen.getByRole('button', { name: 'Подтвердить' }));

    expect(await screen.findByRole('heading', { name: 'Сервисы рядом' })).toBeInTheDocument();
    expect(verifyHandler).toHaveBeenCalledWith(expect.objectContaining({
      body: JSON.stringify({ email: user.email, code: '123456' }),
    }));
    expect(loginHandler).toHaveBeenCalledWith(expect.objectContaining({
      body: JSON.stringify({ email: user.email, password: 'secret-password' }),
    }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });
});
