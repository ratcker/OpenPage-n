import { useRef, useState } from 'react';

import { deleteKnowledgeBook } from '../../api/knowledge.js';
import BookConfirmationDialog from './BookConfirmationDialog.jsx';

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

  return (
    <BookConfirmationDialog
      titleId="book-delete-title"
      descriptionId="book-delete-description"
      kicker="Опасное действие"
      title="Удалить книгу?"
      isPending={isPending}
      error={error}
      confirmLabel="Удалить книгу"
      pendingLabel="Удаляем…"
      confirmClassName="book-delete-confirm"
      onClose={onClose}
      onConfirm={handleDelete}
    >
      <p>Книга «{book.title}» исчезнет у всех читателей.</p>
      <p>Будут удалены записи из личных библиотек и весь прогресс чтения.</p>
    </BookConfirmationDialog>
  );
}
