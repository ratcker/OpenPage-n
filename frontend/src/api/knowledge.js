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

function readerRequest(path, authenticated) {
  return authenticated ? authorizedRequest(path) : request(path);
}

export function getKnowledgeBook(bookId, authenticated = false) {
  return readerRequest(`${KNOWLEDGE_URL}/books/${bookId}/`, authenticated);
}

export function getKnowledgeBookContent(bookId, authenticated = false) {
  return readerRequest(`${KNOWLEDGE_URL}/books/${bookId}/content/`, authenticated);
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

export function uploadKnowledgeBook(data) {
  const body = new FormData();
  body.append('file', data.file);
  body.append('title', data.title);
  body.append('author', data.author);
  body.append('description', data.description);
  body.append('format', data.format);
  body.append('visibility', data.visibility);

  return authorizedRequest(`${KNOWLEDGE_URL}/books/`, {
    method: 'POST',
    body,
  });
}
