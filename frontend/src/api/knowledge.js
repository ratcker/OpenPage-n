import { authorizedRequest, request } from './client.js';

const KNOWLEDGE_URL = '/api/knowledge';

export function getKnowledgeBooks() {
  return request(`${KNOWLEDGE_URL}/books/`);
}

export function getKnowledgeLibrary() {
  return authorizedRequest(`${KNOWLEDGE_URL}/library/`);
}

export function getKnowledgeProfile() {
  return authorizedRequest(`${KNOWLEDGE_URL}/profile/`);
}

function knowledgeProfileBody(data) {
  const body = new FormData();
  for (const field of ['display_name', 'bio']) {
    if (Object.hasOwn(data, field)) body.append(field, data[field]);
  }
  if (data.avatar) body.append('avatar', data.avatar);
  return body;
}

export function createKnowledgeProfile(data) {
  return authorizedRequest(`${KNOWLEDGE_URL}/profile/`, {
    method: 'POST',
    body: knowledgeProfileBody(data),
  });
}

export function updateKnowledgeProfile(data) {
  return authorizedRequest(`${KNOWLEDGE_URL}/profile/`, {
    method: 'PATCH',
    body: knowledgeProfileBody(data),
  });
}

export function deleteKnowledgeProfileAvatar() {
  return authorizedRequest(`${KNOWLEDGE_URL}/profile/avatar/`, {
    method: 'DELETE',
  });
}

export function getKnowledgeAuthor(publicId) {
  return request(`${KNOWLEDGE_URL}/authors/${publicId}/`);
}

export function getKnowledgeAuthorBooks(publicId, page) {
  const query = page && page > 1 ? `?page=${page}` : '';
  return request(`${KNOWLEDGE_URL}/authors/${publicId}/books/${query}`);
}

export function getKnowledgeArticles(page) {
  const query = page && page > 1 ? `?page=${page}` : '';
  return request(`${KNOWLEDGE_URL}/articles/${query}`);
}

export function getKnowledgeAuthorArticles(publicId, page) {
  const query = page && page > 1 ? `?page=${page}` : '';
  return request(`${KNOWLEDGE_URL}/authors/${publicId}/articles/${query}`);
}

function readerRequest(path, authenticated) {
  return authenticated ? authorizedRequest(path) : request(path);
}

export function getKnowledgeBook(bookId, authenticated = false) {
  return readerRequest(`${KNOWLEDGE_URL}/books/${bookId}/`, authenticated);
}

export function getKnowledgeBookContent(bookId, authenticated = false) {
  return readerRequest(`${KNOWLEDGE_URL}/books/${bookId}/content/`, authenticated);
}

export function getKnowledgeArticle(articleId, authenticated = false) {
  return readerRequest(`${KNOWLEDGE_URL}/articles/${articleId}/`, authenticated);
}

export function createKnowledgeArticle(data) {
  return authorizedRequest(`${KNOWLEDGE_URL}/articles/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

export function updateKnowledgeArticle(articleId, data) {
  return authorizedRequest(`${KNOWLEDGE_URL}/articles/${articleId}/`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

export function deleteKnowledgeArticle(articleId) {
  return authorizedRequest(`${KNOWLEDGE_URL}/articles/${articleId}/`, {
    method: 'DELETE',
  });
}

export function createArticleUploadSession() {
  return authorizedRequest(`${KNOWLEDGE_URL}/articles/upload-sessions/`, {
    method: 'POST',
  });
}

export function uploadArticleSessionImage(sessionId, file) {
  const body = new FormData();
  body.append('image', file);

  return authorizedRequest(
    `${KNOWLEDGE_URL}/articles/upload-sessions/${sessionId}/images/`,
    { method: 'POST', body },
  );
}

export function updateKnowledgeProgress(bookId, data) {
  return authorizedRequest(`${KNOWLEDGE_URL}/library/${bookId}/progress/`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

export function addBookToLibrary(bookId) {
  return authorizedRequest(`${KNOWLEDGE_URL}/library/${bookId}/`, {
    method: 'POST',
  });
}

export function previewKnowledgeBook(file) {
  const body = new FormData();
  body.append('file', file);

  return authorizedRequest(`${KNOWLEDGE_URL}/books/preview/`, {
    method: 'POST',
    body,
  });
}

export function uploadKnowledgeBook(data) {
  const body = new FormData();
  body.append('file', data.file);
  body.append('title', data.title);
  body.append('author', data.author);
  body.append('description', data.description);
  body.append('format', data.format);
  body.append('visibility', data.visibility);
  for (const field of ['language', 'year', 'publisher']) {
    if (data[field] !== '' && data[field] !== null && data[field] !== undefined) {
      body.append(field, data[field]);
    }
  }
  if (data.cover) body.append('cover', data.cover);

  return authorizedRequest(`${KNOWLEDGE_URL}/books/`, {
    method: 'POST',
    body,
  });
}

export function updateKnowledgeBook(bookId, data) {
  const body = new FormData();
  for (const field of [
    'title',
    'author',
    'description',
    'language',
    'year',
    'publisher',
  ]) {
    if (Object.hasOwn(data, field)) body.append(field, data[field] ?? '');
  }
  if (data.cover) body.append('cover', data.cover);

  return authorizedRequest(`${KNOWLEDGE_URL}/books/${bookId}/`, {
    method: 'PATCH',
    body,
  });
}
