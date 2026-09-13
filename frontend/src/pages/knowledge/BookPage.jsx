import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';

import {
  addBookToLibrary,
  getKnowledgeBook,
  getKnowledgeBookProgress,
} from '../../api/knowledge.js';
import useAuth from '../../auth/useAuth.js';
import SiteLayout from '../../components/SiteLayout.jsx';
import BookCover from './BookCover.jsx';
import BookDeleteDialog from './BookDeleteDialog.jsx';
import BookEditDialog from './BookEditDialog.jsx';
import BookLibraryAction from './BookLibraryAction.jsx';
import {
  BookPublicationBadge,
  BookPublicationNotice,
} from './BookPublicationInfo.jsx';
import { bookDetailMetadata, formatBookProgress } from './bookPresentation.js';

const initialState = { status: 'loading', book: null };

export default function BookPage() {
  const { id: bookId } = useParams();
  const navigate = useNavigate();
  const { status: authStatus } = useAuth();
  const addPendingRef = useRef(false);
  const [state, setState] = useState(initialState);
  const [progress, setProgress] = useState(null);
  const [isAdding, setIsAdding] = useState(false);
  const [addError, setAddError] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    if (authStatus === 'loading') return undefined;

    let isActive = true;
    setState(initialState);
    setProgress(null);

    getKnowledgeBook(bookId, authStatus === 'authenticated')
      .then(async (book) => {
        if (!isActive) return;
        setState({ status: 'success', book });
        if (authStatus === 'authenticated' && book.is_in_library) {
          try {
            const savedProgress = await getKnowledgeBookProgress(bookId);
            if (isActive) setProgress(savedProgress.reading_percentage);
          } catch {
            // Сведения о книге остаются доступны, даже если прогресс временно недоступен.
          }
        }
      })
      .catch((error) => {
        if (!isActive) return;
        let status = 'error';
        if (error.status === 403) status = 'forbidden';
        if (error.status === 404) status = 'not-found';
        setState({ status, book: null });
      });

    return () => {
      isActive = false;
    };
  }, [authStatus, bookId]);

  async function handleAdd() {
    if (addPendingRef.current) return;
    addPendingRef.current = true;
    setIsAdding(true);
    setAddError('');

    try {
      const entry = await addBookToLibrary(bookId);
      setState((current) => ({
        ...current,
        book: { ...current.book, is_in_library: true },
      }));
      setProgress(entry.reading_percentage);
    } catch {
      setAddError('Не удалось добавить книгу. Попробуйте ещё раз.');
    } finally {
      addPendingRef.current = false;
      setIsAdding(false);
    }
  }

  function handleUpdated(book) {
    setState((current) => ({
      ...current,
      book: { ...book, is_in_library: current.book.is_in_library },
    }));
  }

  let content;
  if (authStatus === 'loading' || state.status === 'loading') {
    content = (
      <div className="book-page-state" role="status" aria-busy="true">
        Загружаем книгу…
      </div>
    );
  } else if (state.status !== 'success') {
    const messages = {
      forbidden: ['Нет доступа к книге', 'Эта приватная книга доступна только её владельцу.'],
      'not-found': ['Книга не найдена', 'Возможно, она была удалена или адрес указан неверно.'],
      error: ['Не удалось загрузить книгу', 'Попробуйте открыть страницу немного позже.'],
    };
    const [title, description] = messages[state.status];
    content = (
      <div className="book-page-state" role="alert">
        <h1>{title}</h1>
        <p>{description}</p>
        <Link className="knowledge-login-link" to="/knowledge">← К каталогу</Link>
      </div>
    );
  } else {
    const { book } = state;
    content = (
      <article className="book-detail">
        <div className="book-detail-cover"><BookCover book={book} eager /></div>
        <div className="book-detail-content">
          <div className="book-detail-heading">
            <p className="section-kicker">Книга</p>
            <h1>{book.title}</h1>
            <BookPublicationBadge book={book} />
          </div>

          <dl className="book-detail-metadata">
            {bookDetailMetadata(book).map(([label, value]) => (
              <div key={label}><dt>{label}</dt><dd>{value}</dd></div>
            ))}
          </dl>

          <section className="book-detail-description" aria-labelledby="book-description-title">
            <h2 id="book-description-title">Описание</h2>
            <p>{book.description || 'Описание книги пока не добавлено.'}</p>
          </section>

          <BookPublicationNotice book={book} />

          {progress !== null && progress !== undefined && (
            <div className="book-progress book-detail-progress">
              <span>Прочитано</span>
              <strong>{formatBookProgress(progress)}</strong>
            </div>
          )}

          <div className="book-detail-actions">
            <Link className="book-read-action" to={`/knowledge/books/${book.id}/read`}>
              Читать
            </Link>
            <BookLibraryAction
              book={book}
              authStatus={authStatus}
              isAdding={isAdding}
              error={addError}
              loginFrom={`/knowledge/books/${book.id}`}
              onAdd={handleAdd}
            />
            {book.can_edit === true && (
              <div className="book-owner-actions">
                <button type="button" onClick={() => setIsEditing(true)}>
                  Редактировать
                </button>
                <button
                  className="book-delete-action"
                  type="button"
                  onClick={() => setIsDeleting(true)}
                >
                  Удалить книгу
                </button>
              </div>
            )}
          </div>
        </div>
      </article>
    );
  }

  return (
    <SiteLayout>
      <div
        className="knowledge-page book-page"
        aria-hidden={isEditing || isDeleting ? 'true' : undefined}
        inert={isEditing || isDeleting}
      >
        <div className="container book-page-content">
          <Link className="public-author-back" to="/knowledge">← База знаний</Link>
          {content}
        </div>
      </div>

      {isEditing && state.book && (
        <BookEditDialog
          book={state.book}
          onClose={() => setIsEditing(false)}
          onUpdated={handleUpdated}
        />
      )}
      {isDeleting && state.book && (
        <BookDeleteDialog
          book={state.book}
          onClose={() => setIsDeleting(false)}
          onDeleted={() => navigate('/knowledge', { replace: true })}
        />
      )}
    </SiteLayout>
  );
}
