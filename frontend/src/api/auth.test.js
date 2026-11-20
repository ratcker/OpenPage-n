import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('./client.js', () => ({
  authorizedRequest: vi.fn(),
  refreshSession: vi.fn(),
  request: vi.fn(),
}));

import { authorizedRequest, refreshSession, request } from './client.js';
import {
  login,
  logout,
  me,
  refresh,
  register,
  verifyEmail,
} from './auth.js';

afterEach(() => vi.clearAllMocks());

describe('auth API', () => {
  it('отправляет логин и подтверждение почты как JSON POST', () => {
    login('reader@example.test', 'secret');
    expect(request).toHaveBeenLastCalledWith('/login/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'reader@example.test', password: 'secret' }),
    });

    verifyEmail('reader@example.test', '123456');
    expect(request).toHaveBeenLastCalledWith('/verify-email/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'reader@example.test', code: '123456' }),
    });
  });

  it('передаёт registration payload без изменения', () => {
    const data = {
      name: 'Reader',
      email: 'reader@example.test',
      password: 'secret',
      password_confirm: 'secret',
    };

    register(data);

    expect(request).toHaveBeenCalledWith('/register/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
  });

  it('делегирует refresh и запрос профиля правильным клиентам', () => {
    refresh();
    me();

    expect(refreshSession).toHaveBeenCalledOnce();
    expect(authorizedRequest).toHaveBeenCalledWith('/me/');
  });

  it('завершает сессию публичным POST без JSON тела', () => {
    logout();

    expect(request).toHaveBeenCalledWith('/logout/', { method: 'POST' });
  });
});
