import { useState } from 'react';

import { uploadKnowledgeBook } from '../../api/knowledge.js';

const initialForm = {
  file: null,
  title: '',
  author: '',
  description: '',
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
  const [error, setError] = useState('');

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
              onChange={handleChange}
            />
          </label>

          <label>
            <span>Название</span>
            <input name="title" value={form.title} required onChange={handleChange} />
          </label>

          <label>
            <span>Автор</span>
            <input name="author" value={form.author} required onChange={handleChange} />
          </label>

          <label>
            <span>Описание</span>
            <textarea
              name="description"
              rows={4}
              value={form.description}
              onChange={handleChange}
            />
          </label>

          <div className="book-upload-options">
            <label>
              <span>Формат</span>
              <select name="format" value={form.format} onChange={handleChange}>
                <option value="epub">EPUB</option>
                <option value="pdf">PDF</option>
              </select>
            </label>

            <label>
              <span>Видимость</span>
              <select name="visibility" value={form.visibility} onChange={handleChange}>
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
            <button className="primary-button" type="submit" disabled={isPending}>
              {isPending ? 'Загружаем…' : 'Загрузить'}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
