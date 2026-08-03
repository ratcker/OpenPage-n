import {
  authorizedRequest,
  refreshSession,
  request,
} from './client.js';

// Общий POST для сценариев авторизации
function post(path, body) {
  return request(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export function login(email, password) {
  return post('/login/', { email, password });
}

export function register(data) {
  return post('/register/', data);
}

export function verifyEmail(email, code) {
  return post('/verify-email/', { email, code });
}

export function refresh() {
  return refreshSession();
}

export function me() {
  return authorizedRequest('/me/');
}

export function logout() {
  return request('/logout/', { method: 'POST' });
}
