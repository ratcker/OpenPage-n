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
