import { StrictMode } from 'react';
import {
  cleanup,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { authorizedRequest, clearSession } from '../api/client.js';
import { jsonResponse, mockUser as user } from '../test/testData.js';
import AuthProvider from './AuthProvider.jsx';
import useAuth from './useAuth.js';

function SessionState() {
  const auth = useAuth();
  const { status, user: currentUser } = auth;

  return (
    <div>
      <output data-testid="status">{status}</output>
      <output data-testid="has-access">{String('access' in auth)}</output>
      {currentUser && <p>{currentUser.name} — {currentUser.email}</p>}
    </div>
  );
}

function renderProvider() {
  return render(
    <StrictMode>
      <AuthProvider>
        <SessionState />
      </AuthProvider>
    </StrictMode>,
  );
}

afterEach(() => {
  cleanup();
  clearSession();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('AuthProvider', () => {
  it('восстанавливает пользователя и access-токен одним refresh', async () => {
    const fetchMock = vi.fn((url) => {
      if (url === '/api/auth/refresh/') {
        return Promise.resolve(jsonResponse({ access: 'restored-token', user }));
      }
      if (url === '/api/auth/token-check/') {
        return Promise.resolve(jsonResponse({ ok: true }));
      }

      throw new Error(`Неожиданный запрос: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    renderProvider();

    expect(screen.getByTestId('status')).toHaveTextContent('loading');
    await waitFor(() => {
      expect(screen.getByTestId('status')).toHaveTextContent('authenticated');
    });
    expect(screen.getByText('Анна — anna@example.ru')).toBeInTheDocument();
    expect(screen.getByTestId('has-access')).toHaveTextContent('false');
    expect(screen.queryByText('restored-token')).not.toBeInTheDocument();
    expect(fetchMock.mock.calls.filter(([url]) => url === '/api/auth/refresh/')).toHaveLength(1);
    expect(fetchMock).not.toHaveBeenCalledWith('/api/auth/me/', expect.anything());

    await authorizedRequest('/token-check/');
    expect(fetchMock).toHaveBeenLastCalledWith('/api/auth/token-check/', expect.objectContaining({
      headers: expect.objectContaining({ Authorization: 'Bearer restored-token' }),
    }));
  });

  it.each([
    ['401', () => Promise.resolve(jsonResponse({ detail: 'Нет refresh cookie' }, 401))],
    ['сетевой ошибке', () => Promise.reject(new TypeError('Failed to fetch'))],
  ])('завершает загрузку анонимной сессией при %s', async (_reason, refreshResult) => {
    const fetchMock = vi.fn(refreshResult);
    vi.stubGlobal('fetch', fetchMock);

    renderProvider();

    await waitFor(() => {
      expect(screen.getByTestId('status')).toHaveTextContent('anonymous');
    });
    expect(screen.queryByText(/anna@example\.ru/)).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
