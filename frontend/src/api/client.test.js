import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  authorizedRequest,
  clearSession,
  saveSession,
  subscribeToSession,
} from './client.js';
import { jsonResponse, mockUser as user } from '../test/testData.js';

// Управляемый Promise позволяет проверить ожидание refresh без случайных задержек.
function deferred() {
  let resolve;
  const promise = new Promise((promiseResolve) => {
    resolve = promiseResolve;
  });

  return { promise, resolve };
}

afterEach(() => {
  clearSession();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('authorizedRequest', () => {
  it('добавляет access-токен только в Authorization', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ ok: true }));
    const localStorageMock = { setItem: vi.fn() };
    const sessionStorageMock = { setItem: vi.fn() };
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('localStorage', localStorageMock);
    vi.stubGlobal('sessionStorage', sessionStorageMock);

    saveSession({ access: 'access-token', user });
    await authorizedRequest('/me/');

    expect(fetchMock).toHaveBeenCalledWith('/api/auth/me/', expect.objectContaining({
      credentials: 'include',
      headers: expect.objectContaining({ Authorization: 'Bearer access-token' }),
    }));
    expect(localStorageMock.setItem).not.toHaveBeenCalled();
    expect(sessionStorageMock.setItem).not.toHaveBeenCalled();
  });

  it('объединяет refresh для двух параллельных 401', async () => {
    const refreshResponse = deferred();
    const calls = [];

    // Оба первых запроса успевают получить 401, пока refresh удерживается вручную.
    const fetchMock = vi.fn((url, options) => {
      calls.push({ url, authorization: options.headers?.Authorization });

      if (url === '/api/auth/refresh/') return refreshResponse.promise;
      if (options.headers?.Authorization === 'Bearer old-token') {
        return Promise.resolve(jsonResponse({ detail: 'Токен истёк' }, 401));
      }

      return Promise.resolve(jsonResponse({ ok: true }));
    });
    vi.stubGlobal('fetch', fetchMock);
    saveSession({ access: 'old-token', user });

    const firstRequest = authorizedRequest('/first/');
    const secondRequest = authorizedRequest('/second/');

    // Один незавершённый refresh должен быть общим для обоих запросов.
    await vi.waitFor(() => {
      expect(calls.filter(({ url }) => url === '/api/auth/refresh/')).toHaveLength(1);
    });
    expect(calls.filter(({ url }) => url !== '/api/auth/refresh/')).toHaveLength(2);

    refreshResponse.resolve(jsonResponse({ access: 'new-token', user }));
    await expect(Promise.all([firstRequest, secondRequest])).resolves.toEqual([
      { ok: true },
      { ok: true },
    ]);

    expect(calls.filter(({ url }) => url === '/api/auth/refresh/')).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledWith('/api/auth/refresh/', expect.objectContaining({
      method: 'POST',
      credentials: 'include',
    }));
    expect(calls.filter(({ authorization }) => authorization === 'Bearer new-token')).toEqual([
      { url: '/api/auth/first/', authorization: 'Bearer new-token' },
      { url: '/api/auth/second/', authorization: 'Bearer new-token' },
    ]);
  });

  it('повторяет запрос один раз и очищает сессию после второго 401', async () => {
    const sessionListener = vi.fn();
    const unsubscribe = subscribeToSession(sessionListener);
    const protectedCalls = [];
    let refreshCalls = 0;

    const fetchMock = vi.fn((url, options) => {
      if (url === '/api/auth/refresh/') {
        refreshCalls += 1;
        return Promise.resolve(jsonResponse({ access: 'new-token', user }));
      }

      protectedCalls.push(options.headers?.Authorization);
      return Promise.resolve(jsonResponse({ detail: 'Нет доступа' }, 401));
    });
    vi.stubGlobal('fetch', fetchMock);
    saveSession({ access: 'old-token', user });
    sessionListener.mockClear();

    await expect(authorizedRequest('/me/')).rejects.toMatchObject({ status: 401 });

    expect(protectedCalls).toEqual(['Bearer old-token', 'Bearer new-token']);
    expect(refreshCalls).toBe(1);
    expect(sessionListener).toHaveBeenLastCalledWith(null);

    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: true }));
    await authorizedRequest('/after-session-loss/');
    expect(fetchMock.mock.calls.at(-1)[1].headers).not.toHaveProperty('Authorization');

    unsubscribe();
  });
});
