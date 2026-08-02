const AUTH_URL = '/api/auth';

// Общий POST для сценариев авторизации
async function post(path, body) {
  let response;

  try {
    response = await fetch(`${AUTH_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error('Сервер недоступен. Попробуйте позже.');
  }

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const fieldError = Object.values(data).find(Array.isArray)?.[0];
    const message = data.detail || data.non_field_errors?.[0] || fieldError;
    throw new Error(message || 'Не удалось выполнить запрос.');
  }

  return data;
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
