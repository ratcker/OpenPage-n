import { Link } from 'react-router-dom';

export default function BookLibraryAction({
  book,
  authStatus,
  isAdding,
  disabled = false,
  error,
  loginFrom,
  onAdd,
}) {
  if (authStatus === 'anonymous') {
    return (
      <Link
        className="book-library-action book-library-login"
        to="/login"
        state={{ from: loginFrom }}
      >
        Войти, чтобы добавить
      </Link>
    );
  }

  return (
    <div className="book-library-control">
      <button
        className="book-library-action"
        type="button"
        disabled={book.is_in_library || isAdding || disabled}
        onClick={onAdd}
      >
        {book.is_in_library && 'В библиотеке'}
        {isAdding && 'Добавляем…'}
        {!book.is_in_library && !isAdding && 'Добавить в библиотеку'}
      </button>
      {error && <p className="book-library-error" role="alert">{error}</p>}
    </div>
  );
}
