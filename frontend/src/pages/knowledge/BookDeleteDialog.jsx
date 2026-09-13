import { useRef, useState } from 'react';

import { deleteKnowledgeBook } from '../../api/knowledge.js';

function deleteErrorMessage(error) {
  if (error.status === 403) return 'У вас нет права удалять эту книгу.';
  if (error.status === 404) return 'Книга уже удалена или не найдена.';
  return 'Не удалось удалить книгу. Проверьте соединение и попробуйте ещё раз.';
}

export default function BookDeleteDialog({ book, onClose, onDeleted }) {
  const pendingRef = useRef(false);
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState('');

  async function handleDelete() {
    if (pendingRef.current) return;
    pendingRef.current = true;
    setIsPending(true);
    setError('');

    try {
      await deleteKnowledgeBook(book.id);
      onDeleted();
    } catch (requestError) {
      pendingRef.current = false;
      setIsPending(false);
      setError(deleteErrorMessage(requestError));
    }
  }

  function handleBackdropClick(event) {
    if (!isPending && event.target === event.currentTarget) onClose();
  }

  return (
    <div className="book-upload-backdrop" onMouseDown={handleBackdropClick}>
      <section
        className="book-upload-dialog book-delete-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="book-delete-title"
        aria-describedby="book-delete-description"
      >
        <div className="book-upload-heading">
          <div>
            <p className="section-kicker">Опасное действие</p>
            <h2 id="book-delete-title">Удалить книгу?</h2>
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

        <div id="book-delete-description" className="book-delete-copy">
          <p>Книга «{book.title}» исчезнет у всех читателей.</p>
          <p>Будут удалены записи из личных библиотек и весь прогресс чтения.</p>
        </div>

        {error && <p className="book-upload-error" role="alert">{error}</p>}

        <div className="book-upload-actions">
          <button type="button" autoFocus disabled={isPending} onClick={onClose}>Отмена</button>
          <button
            className="book-delete-confirm"
            type="button"
            disabled={isPending}
            onClick={handleDelete}
          >
            {isPending ? 'Удаляем…' : 'Удалить книгу'}
          </button>
        </div>
      </section>
    </div>
  );
}
