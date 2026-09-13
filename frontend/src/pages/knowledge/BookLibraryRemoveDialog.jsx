import { useRef, useState } from 'react';

import { removeBookFromLibrary } from '../../api/knowledge.js';
import BookConfirmationDialog from './BookConfirmationDialog.jsx';

function removeErrorMessage(error) {
  if (error.status === 404) return 'Книга уже убрана из библиотеки.';
  return 'Не удалось убрать книгу из библиотеки. Попробуйте ещё раз.';
}

export default function BookLibraryRemoveDialog({ book, onClose, onRemoved }) {
  const pendingRef = useRef(false);
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState('');

  async function handleRemove() {
    if (pendingRef.current) return;
    pendingRef.current = true;
    setIsPending(true);
    setError('');

    try {
      await removeBookFromLibrary(book.id);
      onRemoved(book.id);
    } catch (requestError) {
      pendingRef.current = false;
      setIsPending(false);
      setError(removeErrorMessage(requestError));
    }
  }

  return (
    <BookConfirmationDialog
      titleId="library-remove-title"
      descriptionId="library-remove-description"
      kicker="Личная библиотека"
      title="Убрать из библиотеки?"
      isPending={isPending}
      error={error}
      confirmLabel="Убрать из библиотеки"
      pendingLabel="Убираем…"
      confirmClassName="primary-button"
      onClose={onClose}
      onConfirm={handleRemove}
    >
      <p>Книга «{book.title}» останется в каталоге и у других читателей.</p>
      <p>Ваш сохранённый прогресс чтения будет сброшен.</p>
    </BookConfirmationDialog>
  );
}
