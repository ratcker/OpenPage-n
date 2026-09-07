import { useState } from 'react';

import { updateKnowledgeBook } from '../../api/knowledge.js';
import BookMetadataFields from './BookMetadataFields.jsx';
import useImagePreview from './useImagePreview.js';

function formFromBook(book) {
  return {
    title: book.title,
    author: book.author,
    description: book.description || '',
    language: book.language || '',
    year: book.year === null || book.year === undefined ? '' : String(book.year),
    publisher: book.publisher || '',
    cover: null,
  };
}

function editErrorMessage(error) {
  if (error.status === 400) return error.message;
  if (error.status === 403) return 'У вас нет доступа к редактированию этой книги.';
  return 'Не удалось сохранить изменения. Проверьте соединение и попробуйте ещё раз.';
}

export default function BookEditDialog({ book, onClose, onUpdated }) {
  const [form, setForm] = useState(() => formFromBook(book));
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState('');
  const manualCoverPreview = useImagePreview(form.cover);

  function handleChange(event) {
    const { name, value, files } = event.target;
    setForm((current) => ({
      ...current,
      [name]: files ? files[0] || null : value,
    }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (isPending) return;

    const original = formFromBook(book);
    const changes = {};
    for (const field of [
      'title',
      'author',
      'description',
      'language',
      'year',
      'publisher',
    ]) {
      if (form[field] !== original[field]) changes[field] = form[field];
    }
    if (form.cover) changes.cover = form.cover;
    if (Object.keys(changes).length === 0) {
      onClose();
      return;
    }

    setIsPending(true);
    setError('');
    try {
      const updatedBook = await updateKnowledgeBook(book.id, changes);
      await onUpdated(updatedBook);
      onClose();
    } catch (requestError) {
      setError(editErrorMessage(requestError));
      setIsPending(false);
    }
  }

  function handleBackdropClick(event) {
    if (!isPending && event.target === event.currentTarget) onClose();
  }

  return (
    <div className="book-upload-backdrop" onMouseDown={handleBackdropClick}>
      <section
        className="book-upload-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="book-edit-title"
      >
        <div className="book-upload-heading">
          <div>
            <p className="section-kicker">Metadata книги</p>
            <h2 id="book-edit-title">Редактировать книгу</h2>
          </div>
          <button
            className="dialog-close"
            type="button"
            aria-label="Закрыть"
            disabled={isPending}
            onClick={onClose}
          >
            ×
          </button>
        </div>

        <form className="book-upload-form" onSubmit={handleSubmit}>
          <BookMetadataFields
            form={form}
            coverPreview={manualCoverPreview || book.cover_url}
            disabled={isPending}
            onChange={handleChange}
          />

          {error && <p className="book-upload-error" role="alert">{error}</p>}

          <div className="book-upload-actions">
            <button type="button" disabled={isPending} onClick={onClose}>
              Отмена
            </button>
            <button className="primary-button" type="submit" disabled={isPending}>
              {isPending ? 'Сохраняем…' : 'Сохранить'}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
