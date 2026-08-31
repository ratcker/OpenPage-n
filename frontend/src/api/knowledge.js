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
