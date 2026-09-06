import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import {
  addBookToLibrary,
  getKnowledgeBooks,
  getKnowledgeLibrary,
  getKnowledgeProfile,
} from '../../api/knowledge.js';
import useAuth from '../../auth/useAuth.js';
import SiteLayout from '../../components/SiteLayout.jsx';
import AuthorProfile from './AuthorProfile.jsx';
import BookUploadDialog from './BookUploadDialog.jsx';

const articleCards = ['Рабочие заметки', 'Полезная подборка', 'Новая идея'];

const initialCollectionState = {
  status: 'loading',
  items: [],
};

function formatProgress(value) {
  const progress = Number(value);
  return Number.isFinite(progress) ? `${value}%` : '0%';
}

function BookCard({ book, readingPercentage, action }) {
  return (
    <article className="book-card">
      <div className="book-cover" aria-hidden="true">
        <span>{book.format.toUpperCase()}</span>
        <i />
      </div>
      <div className="book-card-copy">
        <p>{book.author}</p>
        <h3>{book.title}</h3>
        {book.description && <span className="book-description">{book.description}</span>}
        {readingPercentage !== undefined && (
          <div className="book-progress">
            <span>Прочитано</span>
            <strong>{formatProgress(readingPercentage)}</strong>
          </div>
        )}
        <div className="book-card-actions">
          <Link className="book-read-action" to={`/knowledge/books/${book.id}/read`}>
            Читать
          </Link>
          {action}
        </div>
      </div>
    </article>
  );
}

function CatalogBookAction({
  book,
  authStatus,
  libraryState,
  libraryBookIds,
  addingBookId,
  error,
  onAdd,
}) {
  if (authStatus === 'anonymous') {
    return (
      <Link className="book-library-action book-library-login" to="/login" state={{ from: '/knowledge' }}>
        Войти, чтобы добавить
      </Link>
    );
  }

  const isInLibrary = libraryBookIds.has(book.id);
  const isAdding = addingBookId === book.id;
  const isCheckingLibrary = libraryState.status === 'loading';

  return (
    <div className="book-library-control">
      <button
        className="book-library-action"
        type="button"
        disabled={isInLibrary || isCheckingLibrary || Boolean(addingBookId)}
        onClick={() => onAdd(book.id)}
      >
        {isInLibrary && 'В библиотеке'}
        {isAdding && 'Добавляем…'}
        {!isInLibrary && !isAdding && 'Добавить в библиотеку'}
      </button>
      {error?.bookId === book.id && (
        <p className="book-library-error" role="alert">{error.message}</p>
      )}
    </div>
  );
}

function LoadingBooks({ label }) {
  return (
    <div className="book-grid book-grid-loading" role="status" aria-label={label}>
      {[1, 2, 3].map((item) => (
        <div className="book-card book-card-loading" key={item} aria-hidden="true">
          <div className="book-cover" />
          <div>
            <span />
            <i />
          </div>
        </div>
      ))}
      <span className="visually-hidden">{label}</span>
    </div>
  );
}

function BookCollection({
  id,
  kicker,
  title,
  description,
  state,
  emptyTitle,
  emptyDescription,
  errorTitle,
  loadingLabel,
  library = false,
  renderBookAction,
}) {
  let content;

  if (state.status === 'loading') {
    content = <LoadingBooks label={loadingLabel} />;
  } else if (state.status === 'anonymous') {
    content = (
      <div className="knowledge-message">
        <h3>Войдите, чтобы открыть личную библиотеку.</h3>
        <p>После входа здесь будут сохранённые книги и прогресс чтения.</p>
        <Link className="knowledge-login-link" to="/login" state={{ from: '/knowledge' }}>
          Войти
        </Link>
      </div>
    );
  } else if (state.status === 'error') {
    content = (
      <div className="knowledge-message" role="alert">
        <h3>{errorTitle}</h3>
        <p>Попробуйте открыть раздел немного позже.</p>
      </div>
    );
  } else if (state.items.length === 0) {
    content = (
      <div className="knowledge-message">
        <h3>{emptyTitle}</h3>
        <p>{emptyDescription}</p>
      </div>
    );
  } else {
    content = (
      <div className="book-grid">
        {state.items.map((item) => {
          const book = library ? item.book : item;
          return (
            <BookCard
              action={renderBookAction?.(book)}
              book={book}
              key={library ? item.id : book.id}
              readingPercentage={library ? item.reading_percentage : undefined}
            />
          );
        })}
      </div>
    );
  }

  return (
    <section className="knowledge-catalog" aria-labelledby={id}>
      <div className="knowledge-section-heading">
        <div>
          <p className="section-kicker">{kicker}</p>
          <h2 id={id}>{title}</h2>
        </div>
        <p>{description}</p>
      </div>
      {content}
    </section>
  );
}

function BooksView({
  authStatus,
  booksState,
  libraryState,
  profileState,
  libraryBookIds,
  addingBookId,
  addError,
  onAddBook,
  onOpenUpload,
}) {
  return (
    <div className="knowledge-library-layout">
      <AuthorProfile state={profileState} onUpload={onOpenUpload} />

      <div className="knowledge-books-column">
        <BookCollection
          id="library-title"
          kicker="Библиотека"
          title="Ваши книги"
          description="Сохранённые материалы и прогресс чтения."
          state={libraryState}
          emptyTitle="В вашей библиотеке пока нет книг."
          emptyDescription="Здесь появятся книги из вашей личной коллекции."
          errorTitle="Не удалось загрузить библиотеку."
          loadingLabel="Загружаем вашу библиотеку…"
          library
        />

        <BookCollection
          id="catalog-title"
          kicker="Общий каталог"
          title="Публичные книги"
          description="Новые доступные всем материалы."
          state={booksState}
          emptyTitle="Публичных книг пока нет."
          emptyDescription="Каталог наполнится, когда появятся общедоступные книги."
          errorTitle="Не удалось загрузить каталог."
          loadingLabel="Загружаем публичные книги…"
          renderBookAction={(book) => (
            <CatalogBookAction
              book={book}
              authStatus={authStatus}
              libraryState={libraryState}
              libraryBookIds={libraryBookIds}
              addingBookId={addingBookId}
              error={addError}
              onAdd={onAddBook}
            />
          )}
        />
      </div>
    </div>
  );
}

function ArticlesView() {
  return (
    <section className="knowledge-catalog articles-catalog" aria-labelledby="articles-title">
      <div className="knowledge-section-heading">
        <div>
          <p className="section-kicker">Публикации</p>
          <h2 id="articles-title">Статьи</h2>
        </div>
        <p>Место для будущих текстов и подборок.</p>
      </div>

      <div className="article-grid">
        {articleCards.map((title, index) => (
          <article className="article-card" key={title}>
            <div className="article-card-mark" aria-hidden="true">0{index + 1}</div>
            <div>
              <p>Будущая статья</p>
              <h3>{title}</h3>
              <span>Здесь появятся описание и метаданные материала.</span>
            </div>
            <svg viewBox="0 0 20 20" aria-hidden="true">
              <path d="m7 4 6 6-6 6" />
            </svg>
          </article>
        ))}
      </div>
    </section>
  );
}

export default function KnowledgePage() {
  const { status: authStatus } = useAuth();
  const [mode, setMode] = useState('books');
  const [booksState, setBooksState] = useState(initialCollectionState);
  const [libraryState, setLibraryState] = useState(initialCollectionState);
  const [profileState, setProfileState] = useState({ status: 'loading', profile: null });
  const [addingBookId, setAddingBookId] = useState(null);
  const [addError, setAddError] = useState(null);
  const [isUploadOpen, setIsUploadOpen] = useState(false);

  const libraryBookIds = new Set(
    libraryState.items.map((item) => item.book.id),
  );

  useEffect(() => {
    if (authStatus === 'loading') return undefined;

    let isActive = true;

    getKnowledgeBooks()
      .then((data) => {
        if (isActive) setBooksState({ status: 'success', items: data.results });
      })
      .catch(() => {
        if (isActive) setBooksState({ status: 'error', items: [] });
      });

    if (authStatus === 'anonymous') {
      setLibraryState({ status: 'anonymous', items: [] });
      setProfileState({ status: 'anonymous', profile: null });
      return () => {
        isActive = false;
      };
    }

    setLibraryState(initialCollectionState);
    setProfileState({ status: 'loading', profile: null });

    getKnowledgeLibrary()
      .then((data) => {
        if (isActive) setLibraryState({ status: 'success', items: data.results });
      })
      .catch(() => {
        if (isActive) setLibraryState({ status: 'error', items: [] });
      });

    getKnowledgeProfile()
      .then((profile) => {
        if (isActive) setProfileState({ status: 'exists', profile });
      })
      .catch((error) => {
        if (!isActive) return;
        setProfileState({
          status: error.status === 404 ? 'missing' : 'error',
          profile: null,
        });
      });

    return () => {
      isActive = false;
    };
  }, [authStatus]);

  async function handleAddBook(bookId) {
    if (addingBookId) return;

    setAddingBookId(bookId);
    setAddError(null);

    try {
      const entry = await addBookToLibrary(bookId);
      setLibraryState((current) => {
        const alreadyAdded = current.items.some((item) => item.book.id === bookId);
        return {
          status: 'success',
          items: alreadyAdded ? current.items : [entry, ...current.items],
        };
      });
    } catch {
      setAddError({
        bookId,
        message: 'Не удалось добавить книгу. Попробуйте ещё раз.',
      });
    } finally {
      setAddingBookId(null);
    }
  }

  async function handleBookUploaded(book) {
    const updates = [
      getKnowledgeLibrary()
        .then((data) => setLibraryState({ status: 'success', items: data.results }))
        .catch(() => setLibraryState({ status: 'error', items: [] })),
    ];

    if (book.visibility === 'public') {
      updates.push(
        getKnowledgeBooks()
          .then((data) => setBooksState({ status: 'success', items: data.results }))
          .catch(() => setBooksState({ status: 'error', items: [] })),
      );
    }

    await Promise.all(updates);
  }

  return (
    <SiteLayout>
      <div className="knowledge-page">
        <header className="knowledge-header">
          <div className="container knowledge-header-content">
            <div className="knowledge-tabs" role="tablist" aria-label="Разделы базы знаний">
              <button
                type="button"
                role="tab"
                aria-selected={mode === 'books'}
                onClick={() => setMode('books')}
              >
                Книги
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={mode === 'articles'}
                onClick={() => setMode('articles')}
              >
                Статьи
              </button>
            </div>

            <div className="knowledge-title">
              <p className="eyebrow"><span />Опенпейч</p>
              <h1>База знаний</h1>
              <p className="knowledge-intro">Личное пространство для чтения, заметок и полезных материалов.</p>
            </div>
          </div>
        </header>

        <div className="container knowledge-content">
          {mode === 'books' ? (
            <BooksView
              authStatus={authStatus}
              booksState={booksState}
              libraryState={libraryState}
              profileState={profileState}
              libraryBookIds={libraryBookIds}
              addingBookId={addingBookId}
              addError={addError}
              onAddBook={handleAddBook}
              onOpenUpload={() => setIsUploadOpen(true)}
            />
          ) : (
            <ArticlesView />
          )}
        </div>
      </div>

      {isUploadOpen && profileState.status === 'exists' && (
        <BookUploadDialog
          onClose={() => setIsUploadOpen(false)}
          onUploaded={handleBookUploaded}
        />
      )}
    </SiteLayout>
  );
}
