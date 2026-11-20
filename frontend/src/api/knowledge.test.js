import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('./client.js', () => ({
  authorizedRequest: vi.fn(),
  request: vi.fn(),
}));

import { authorizedRequest, request } from './client.js';
import {
  addBookToLibrary,
  createArticleUploadSession,
  createKnowledgeArticle,
  createKnowledgeProfile,
  deleteKnowledgeArticle,
  deleteKnowledgeBook,
  deleteKnowledgeProfileAvatar,
  getKnowledgeArticles,
  getKnowledgeAuthor,
  getKnowledgeAuthorArticles,
  getKnowledgeAuthorBooks,
  getKnowledgeBook,
  getKnowledgeBookContent,
  getKnowledgeBookProgress,
  getKnowledgeBooks,
  getKnowledgeLibrary,
  getKnowledgeProfile,
  getMyKnowledgeArticles,
  previewKnowledgeBook,
  removeBookFromLibrary,
  updateKnowledgeArticle,
  updateKnowledgeBook,
  updateKnowledgeProfile,
  updateKnowledgeProgress,
  uploadArticleSessionImage,
  uploadKnowledgeBook,
} from './knowledge.js';

afterEach(() => vi.clearAllMocks());

describe('knowledge API', () => {
  it('добавляет номер страницы только начиная со второй страницы', () => {
    getKnowledgeBooks();
    expect(request).toHaveBeenLastCalledWith('/api/knowledge/books/');

    getKnowledgeBooks(1);
    expect(request).toHaveBeenLastCalledWith('/api/knowledge/books/');

    getKnowledgeBooks(3, true);
    expect(authorizedRequest).toHaveBeenCalledWith('/api/knowledge/books/?page=3');
    getKnowledgeLibrary(2);
    expect(authorizedRequest).toHaveBeenCalledWith('/api/knowledge/library/?page=2');
  });

  it('разделяет публичные и авторизованные операции чтения', () => {
    getKnowledgeBook('book-1');
    getKnowledgeBook('book-2', true);
    getKnowledgeBookContent('book-3');
    getKnowledgeBookContent('book-4', true);
    getKnowledgeBookProgress('book-5');
    getKnowledgeArticle('article-1');
    getKnowledgeArticles(2);
    getMyKnowledgeArticles(4);

    expect(request).toHaveBeenCalledWith('/api/knowledge/books/book-1/');
    expect(authorizedRequest).toHaveBeenCalledWith('/api/knowledge/books/book-2/');
    expect(request).toHaveBeenCalledWith('/api/knowledge/books/book-3/content/');
    expect(authorizedRequest).toHaveBeenCalledWith('/api/knowledge/books/book-4/content/');
    expect(authorizedRequest).toHaveBeenCalledWith('/api/knowledge/books/book-5/progress/');
    expect(request).toHaveBeenCalledWith('/api/knowledge/articles/article-1/');
    expect(request).toHaveBeenCalledWith('/api/knowledge/articles/?page=2');
    expect(authorizedRequest).toHaveBeenCalledWith('/api/knowledge/articles/mine/?page=4');
  });

  it('строит публичные author endpoints с pagination', () => {
    getKnowledgeAuthor('profile-id');
    getKnowledgeAuthorBooks('profile-id', 2);
    getKnowledgeAuthorArticles('profile-id', 5);

    expect(request).toHaveBeenCalledWith('/api/knowledge/authors/profile-id/');
    expect(request).toHaveBeenCalledWith('/api/knowledge/authors/profile-id/books/?page=2');
    expect(request).toHaveBeenCalledWith('/api/knowledge/authors/profile-id/articles/?page=5');
  });

  it('создаёт и обновляет профиль multipart-данными только из переданных полей', () => {
    const avatar = new File(['image'], 'avatar.png', { type: 'image/png' });
    createKnowledgeProfile({ display_name: 'Автор', avatar });
    updateKnowledgeProfile({ bio: 'Описание' });

    const createOptions = authorizedRequest.mock.calls[0][1];
    expect(createOptions.method).toBe('POST');
    expect(createOptions.body).toBeInstanceOf(FormData);
    expect(createOptions.body.get('display_name')).toBe('Автор');
    expect(createOptions.body.get('avatar')).toBe(avatar);
    expect(createOptions.body.has('bio')).toBe(false);

    const updateOptions = authorizedRequest.mock.calls[1][1];
    expect(updateOptions.method).toBe('PATCH');
    expect(updateOptions.body.get('bio')).toBe('Описание');
    expect(updateOptions.body.has('display_name')).toBe(false);
  });

  it('создаёт статьи с JSON и загружает изображения с FormData', () => {
    const article = { title: 'Заметка', content: 'Текст', visibility: 'private' };
    const file = new File(['image'], 'figure.png', { type: 'image/png' });
    createKnowledgeArticle(article);
    createArticleUploadSession();
    uploadArticleSessionImage('session-1', file);
    updateKnowledgeArticle('article-1', { title: 'Новое название' });
    deleteKnowledgeArticle('article-1');

    expect(authorizedRequest).toHaveBeenNthCalledWith(1, '/api/knowledge/articles/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(article),
    });
    expect(authorizedRequest).toHaveBeenNthCalledWith(2, '/api/knowledge/articles/upload-sessions/', {
      method: 'POST',
    });
    const imageOptions = authorizedRequest.mock.calls[2][1];
    expect(authorizedRequest.mock.calls[2][0]).toBe(
      '/api/knowledge/articles/upload-sessions/session-1/images/',
    );
    expect(imageOptions.body.get('image')).toBe(file);
    expect(authorizedRequest.mock.calls[3][1].method).toBe('PATCH');
    expect(authorizedRequest.mock.calls[4][1]).toEqual({ method: 'DELETE' });
  });

  it('загружает приватную книгу без публичного подтверждения прав', () => {
    const file = new File(['epub'], 'book.epub');
    const cover = new File(['cover'], 'cover.jpg', { type: 'image/jpeg' });
    uploadKnowledgeBook({
      file,
      title: 'Книга',
      author: 'Автор',
      description: '',
      format: 'epub',
      visibility: 'private',
      publication_basis: 'author',
      rights_confirmation: true,
      language: 'ru',
      year: 0,
      publisher: '',
      cover,
    });

    const options = authorizedRequest.mock.calls[0][1];
    const body = options.body;
    expect(authorizedRequest.mock.calls[0][0]).toBe('/api/knowledge/books/');
    expect(options.method).toBe('POST');
    expect(body.get('file')).toBe(file);
    expect(body.get('cover')).toBe(cover);
    expect(body.get('year')).toBe('0');
    expect(body.get('language')).toBe('ru');
    expect(body.has('publisher')).toBe(false);
    expect(body.has('publication_basis')).toBe(false);
    expect(body.has('rights_confirmation')).toBe(false);
  });

  it('включает подтверждение прав только при публичной загрузке', () => {
    uploadKnowledgeBook({
      file: new File(['pdf'], 'book.pdf'),
      title: 'Книга',
      author: 'Автор',
      description: '',
      format: 'pdf',
      visibility: 'public',
      publication_basis: 'authorized_distributor',
      rights_confirmation: false,
    });

    const body = authorizedRequest.mock.calls[0][1].body;
    expect(body.get('publication_basis')).toBe('authorized_distributor');
    expect(body.get('rights_confirmation')).toBe('false');
  });

  it('передаёт прогресс и операции с библиотекой на соответствующие методы', () => {
    updateKnowledgeProgress('book-1', { reading_percentage: 30, reading_location: { page: 4 } });
    addBookToLibrary('book-2');
    removeBookFromLibrary('book-3');
    deleteKnowledgeBook('book-4');
    previewKnowledgeBook(new File(['epub'], 'preview.epub'));
    getKnowledgeProfile();
    deleteKnowledgeProfileAvatar();

    expect(authorizedRequest).toHaveBeenCalledWith('/api/knowledge/library/book-1/progress/', expect.objectContaining({ method: 'PATCH' }));
    expect(authorizedRequest).toHaveBeenCalledWith('/api/knowledge/library/book-2/', { method: 'POST' });
    expect(authorizedRequest).toHaveBeenCalledWith('/api/knowledge/library/book-3/', { method: 'DELETE' });
    expect(authorizedRequest).toHaveBeenCalledWith('/api/knowledge/books/book-4/', { method: 'DELETE' });
    expect(authorizedRequest).toHaveBeenCalledWith('/api/knowledge/profile/');
    expect(authorizedRequest).toHaveBeenCalledWith('/api/knowledge/profile/avatar/', { method: 'DELETE' });
  });

  it('отправляет только изменённые поля при PATCH метаданных книги', () => {
    updateKnowledgeBook('book-1', { title: 'Новое название', description: null });

    const [path, options] = authorizedRequest.mock.calls[0];
    expect(path).toBe('/api/knowledge/books/book-1/');
    expect(options.method).toBe('PATCH');
    expect(options.body.get('title')).toBe('Новое название');
    expect(options.body.get('description')).toBe('');
    expect(options.body.has('author')).toBe(false);
  });
});
