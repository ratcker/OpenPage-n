const AUTH_URL = '/api/auth';

let accessToken = '';
let refreshPromise = null;
let sessionListener = null;

function errorMessage(data) {
  if (!data || typeof data !== 'object') return '';

  const fieldError = Object.values(data).find(
    (value) => typeof value === 'string' || Array.isArray(value),
  );

  return data.detail
    || data.non_field_errors?.[0]
    || (Array.isArray(fieldError) ? fieldError[0] : fieldError);
}

// Базовый запрос к API авторизации
export async function request(path, options = {}) {
  let response;

  try {
    response = await fetch(`${AUTH_URL}${path}`, {
      credentials: 'include',
      ...options,
    });
  } catch {
    throw new Error('Сервер недоступен. Попробуйте позже.');
  }

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const error = new Error(errorMessage(data) || 'Не удалось выполнить запрос.');
    error.status = response.status;
    throw error;
  }

  return data;
}

// Сессия сообщает провайдеру только о пользователе, но не раскрывает токен.
export function subscribeToSession(listener) {
  sessionListener = listener;

  return () => {
    if (sessionListener === listener) sessionListener = null;
  };
}

export function saveSession(session) {
  accessToken = session.access;
  sessionListener?.(session.user);
}

export function clearSession() {
  accessToken = '';
  sessionListener?.(null);
}

// Все одновременные обновления используют один Promise.
export function refreshSession() {
  if (!refreshPromise) {
    refreshPromise = request('/refresh/', { method: 'POST' })
      .then((session) => {
        saveSession(session);
        return session;
      })
      .catch((error) => {
        clearSession();
        throw error;
      })
      .finally(() => {
        refreshPromise = null;
      });
  }

  return refreshPromise;
}

// Защищённый запрос обновляет токен и повторяется только один раз.
export async function authorizedRequest(path, options = {}, isRetry = false) {
  try {
    return await request(path, {
      ...options,
      headers: {
        ...options.headers,
        ...(accessToken && { Authorization: `Bearer ${accessToken}` }),
      },
    });
  } catch (error) {
    if (error.status !== 401 || isRetry) {
      if (error.status === 401) clearSession();
      throw error;
    }

    await refreshSession();
    return authorizedRequest(path, options, true);
  }
}
