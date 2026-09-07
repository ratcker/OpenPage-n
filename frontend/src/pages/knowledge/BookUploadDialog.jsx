import { useEffect, useRef, useState } from 'react';

import {
  previewKnowledgeBook,
  uploadKnowledgeBook,
} from '../../api/knowledge.js';
import BookMetadataFields from './BookMetadataFields.jsx';
import useImagePreview from './useImagePreview.js';

const initialForm = {
  file: null,
  title: '',
  author: '',
  description: '',
  language: '',
  year: '',
  publisher: '',
  cover: null,
  format: 'epub',
  visibility: 'private',
};

function uploadErrorMessage(error) {
  if (error.status === 400) return error.message;
  if (error.status === 403) {
    return 'Загрузка доступна только пользователям с профилем автора.';
  }
  return 'Не удалось загрузить книгу. Проверьте соединение и попробуйте ещё раз.';
}

export default function BookUploadDialog({ onClose, onUploaded }) {
  const [form, setForm] = useState(initialForm);
  const [isPending, setIsPending] = useState(false);
  const [previewStatus, setPreviewStatus] = useState('idle');
  const [epubCover, setEpubCover] = useState('');
  const previewRequestRef = useRef(0);
  const [error, setError] = useState('');
  const manualCoverPreview = useImagePreview(form.cover);

  useEffect(() => () => {
    previewRequestRef.current += 1;
  }, []);

  async function extractEpubMetadata(file) {
    const requestId = previewRequestRef.current + 1;
    previewRequestRef.current = requestId;
    setPreviewStatus('loading');

    try {
      const preview = await previewKnowledgeBook(file);
      if (previewRequestRef.current !== requestId) return;

      setForm((current) => {
        if (current.file !== file) return current;
        const next = { ...current };
        for (const field of ['title', 'author', 'language', 'year', 'publisher']) {
          if (
            next[field] === ''
            && preview[field] !== null
            && preview[field] !== undefined
          ) {
            next[field] = String(preview[field]);
          }
        }
        return next;
      });
      setEpubCover(preview.cover || '');
      setPreviewStatus('success');
    } catch {
      if (previewRequestRef.current === requestId) setPreviewStatus('error');
    }
  }

  function handleBookFile(file) {
    previewRequestRef.current += 1;
    setPreviewStatus('idle');
    setEpubCover('');

    const name = file?.name.toLowerCase() || '';
    const format = name.endsWith('.pdf') || file?.type === 'application/pdf'
      ? 'pdf'
      : 'epub';
    setForm((current) => ({ ...current, file, format }));
    if (file && format === 'epub') extractEpubMetadata(file);
  }

  function handleChange(event) {
    const { name, value, files } = event.target;
    if (name === 'file') {
      handleBookFile(files[0] || null);
      return;
    }
    setForm((current) => ({
      ...current,
      [name]: files ? files[0] || null : value,
    }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (isPending || previewStatus === 'loading') return;
    if (!form.file) {
      setError('Выберите файл EPUB или PDF.');
      return;
    }

    setIsPending(true);
    setError('');

    try {
      const book = await uploadKnowledgeBook(form);
      await onUploaded(book);
      setForm(initialForm);
      setIsPending(false);
      onClose();
    } catch (requestError) {
      setError(uploadErrorMessage(requestError));
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
        aria-labelledby="book-upload-title"
      >
        <div className="book-upload-heading">
          <div>
            <p className="section-kicker">Новый материал</p>
            <h2 id="book-upload-title">Загрузить книгу</h2>
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
          <label>
            <span>Файл</span>
            <input
              name="file"
              type="file"
              accept=".epub,.pdf"
              disabled={isPending || previewStatus === 'loading'}
              onChange={handleChange}
            />
          </label>

          {previewStatus === 'loading' && (
            <p className="book-preview-status" role="status">Извлекаем данные…</p>
          )}
          {previewStatus === 'error' && (
            <p className="book-preview-note">
              Не удалось извлечь данные автоматически. Заполните поля вручную.
            </p>
          )}

          <BookMetadataFields
            form={form}
            coverPreview={manualCoverPreview || epubCover}
            disabled={isPending || previewStatus === 'loading'}
            onChange={handleChange}
          />

          <div className="book-upload-options">
            <label>
              <span>Формат</span>
              <select
                name="format"
                value={form.format}
                disabled={isPending || previewStatus === 'loading'}
                onChange={handleChange}
              >
                <option value="epub">EPUB</option>
                <option value="pdf">PDF</option>
              </select>
            </label>

            <label>
              <span>Видимость</span>
              <select
                name="visibility"
                value={form.visibility}
                disabled={isPending || previewStatus === 'loading'}
                onChange={handleChange}
              >
                <option value="private">Личная</option>
                <option value="public">Публичная</option>
              </select>
            </label>
          </div>

          {error && <p className="book-upload-error" role="alert">{error}</p>}

          <div className="book-upload-actions">
            <button type="button" disabled={isPending} onClick={onClose}>
              Отмена
            </button>
            <button
              className="primary-button"
              type="submit"
              disabled={isPending || previewStatus === 'loading'}
            >
              {isPending ? 'Загружаем…' : 'Загрузить'}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
