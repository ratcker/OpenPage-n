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

function resolveApiUrl(path) {
  return path.startsWith('/api/') ? path : `${AUTH_URL}${path}`;
}

async function fetchResponse(path, options = {}) {
  try {
    return await fetch(resolveApiUrl(path), {
      credentials: 'include',
      ...options,
    });
  } catch {
    throw new Error('Сервер недоступен. Попробуйте позже.');
  }
}

async function readResponse(response) {
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const error = new Error(errorMessage(data) || 'Не удалось выполнить запрос.');
    error.status = response.status;
    throw error;
  }

  return data;
}

// Базовый запрос к API
export async function request(path, options = {}) {
  return readResponse(await fetchResponse(path, options));
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

async function authorizedResponse(path, options = {}, isRetry = false) {
  const response = await fetchResponse(path, {
    ...options,
    headers: {
      ...options.headers,
      ...(accessToken && { Authorization: `Bearer ${accessToken}` }),
    },
  });

  if (response.status !== 401) return response;
  if (isRetry) {
    clearSession();
    return response;
  }

  await refreshSession();
  return authorizedResponse(path, options, true);
}

// Защищённый запрос обновляет токен и повторяется только один раз.
export async function authorizedRequest(path, options = {}) {
  return readResponse(await authorizedResponse(path, options));
}

// Изображение получает тот же Bearer-токен, но возвращается как Blob, а не JSON.
export async function authorizedBlobRequest(path) {
  const response = await authorizedResponse(path);
  if (!response.ok) await readResponse(response);
  return response.blob();
}
