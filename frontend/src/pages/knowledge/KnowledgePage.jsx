import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';

import {
  addBookToLibrary,
  getKnowledgeArticles,
  getKnowledgeBooks,
  getKnowledgeLibrary,
  getKnowledgeProfile,
} from '../../api/knowledge.js';
import useAuth from '../../auth/useAuth.js';
import SiteLayout from '../../components/SiteLayout.jsx';
import AuthorProfile from './AuthorProfile.jsx';
import AuthorProfileDialog from './AuthorProfileDialog.jsx';
import ArticleCard from './ArticleCard.jsx';
import BookCard from './BookCard.jsx';
import BookEditDialog from './BookEditDialog.jsx';
import BookUploadDialog from './BookUploadDialog.jsx';

const initialCollectionState = {
  status: 'loading',
  items: [],
};

const initialArticlesState = {
  status: 'loading',
  items: [],
  count: 0,
  next: null,
  previous: null,
};

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
  onEditBook,
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
              onEdit={onEditBook}
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
  onEditBook,
  onCreateProfile,
  onEditProfile,
  onOpenUpload,
}) {
  return (
    <div className="knowledge-library-layout">
      <AuthorProfile
        state={profileState}
        onCreate={onCreateProfile}
        onEdit={onEditProfile}
        onUpload={onOpenUpload}
      />

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
          onEditBook={onEditBook}
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
          onEditBook={onEditBook}
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

function ArticlesView({ profileState }) {
  const [articlesState, setArticlesState] = useState(initialArticlesState);
  const [page, setPage] = useState(1);

  useEffect(() => {
    let isActive = true;
    setArticlesState(initialArticlesState);

    getKnowledgeArticles(page)
      .then((data) => {
        if (!isActive) return;
        setArticlesState({
          status: 'success',
          items: data.results,
          count: data.count,
          next: data.next,
          previous: data.previous,
        });
      })
      .catch(() => {
        if (isActive) setArticlesState({ ...initialArticlesState, status: 'error' });
      });

    return () => {
      isActive = false;
    };
  }, [page]);

  let content;
  if (articlesState.status === 'loading') {
    content = (
      <div className="knowledge-message" role="status">
        <h3>Загружаем статьи…</h3>
      </div>
    );
  } else if (articlesState.status === 'error') {
    content = (
      <div className="knowledge-message" role="alert">
        <h3>Не удалось загрузить статьи.</h3>
        <p>Попробуйте открыть раздел немного позже.</p>
      </div>
    );
  } else if (articlesState.items.length === 0) {
    content = (
      <div className="knowledge-message">
        <h3>Публичных статей пока нет.</h3>
        <p>Здесь появятся новые тексты авторов Базы знаний.</p>
      </div>
    );
  } else {
    content = (
      <div className="article-grid">
        {articlesState.items.map((article) => (
          <ArticleCard article={article} key={article.id} />
        ))}
      </div>
    );
  }

  return (
    <section className="knowledge-catalog articles-catalog" aria-labelledby="articles-title">
      <div className="knowledge-section-heading">
        <div>
          <p className="section-kicker">Публикации</p>
          <h2 id="articles-title">Статьи</h2>
        </div>
        {profileState.status === 'exists' ? (
          <Link className="article-create-link" to="/knowledge/articles/new">
            Написать статью
          </Link>
        ) : (
          <p>Тексты и подборки авторов сообщества.</p>
        )}
      </div>
      {content}
      {articlesState.status === 'success'
        && (articlesState.next || articlesState.previous) && (
          <nav className="knowledge-pagination" aria-label="Страницы статей">
            <button
              type="button"
              disabled={!articlesState.previous}
              onClick={() => setPage((current) => current - 1)}
            >
              Назад
            </button>
            <span>Страница {page}</span>
            <button
              type="button"
              disabled={!articlesState.next}
              onClick={() => setPage((current) => current + 1)}
            >
              Далее
            </button>
          </nav>
        )}
    </section>
  );
}

export default function KnowledgePage() {
  const { status: authStatus } = useAuth();
  const [searchParams] = useSearchParams();
  const [mode, setMode] = useState(
    searchParams.get('tab') === 'articles' ? 'articles' : 'books',
  );
  const [booksState, setBooksState] = useState(initialCollectionState);
  const [libraryState, setLibraryState] = useState(initialCollectionState);
  const [profileState, setProfileState] = useState({ status: 'loading', profile: null });
  const [addingBookId, setAddingBookId] = useState(null);
  const [addError, setAddError] = useState(null);
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [editingBook, setEditingBook] = useState(null);
  const [profileDialogMode, setProfileDialogMode] = useState(null);

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

  async function handleBookUpdated() {
    await Promise.all([
      getKnowledgeLibrary()
        .then((data) => setLibraryState({ status: 'success', items: data.results }))
        .catch(() => setLibraryState({ status: 'error', items: [] })),
      getKnowledgeBooks()
        .then((data) => setBooksState({ status: 'success', items: data.results }))
        .catch(() => setBooksState({ status: 'error', items: [] })),
    ]);
  }

  function handleProfileSaved(profile) {
    setProfileState({ status: 'exists', profile });
    setProfileDialogMode(null);
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
              onEditBook={setEditingBook}
              onCreateProfile={() => setProfileDialogMode('create')}
              onEditProfile={() => setProfileDialogMode('edit')}
              onOpenUpload={() => setIsUploadOpen(true)}
            />
          ) : (
            <ArticlesView profileState={profileState} />
          )}
        </div>
      </div>

      {isUploadOpen && profileState.status === 'exists' && (
        <BookUploadDialog
          onClose={() => setIsUploadOpen(false)}
          onUploaded={handleBookUploaded}
        />
      )}
      {profileDialogMode && (
        <AuthorProfileDialog
          mode={profileDialogMode}
          profile={profileState.profile}
          onClose={() => setProfileDialogMode(null)}
          onChanged={(profile) => setProfileState({ status: 'exists', profile })}
          onSaved={handleProfileSaved}
        />
      )}
      {editingBook && (
        <BookEditDialog
          book={editingBook}
          onClose={() => setEditingBook(null)}
          onUpdated={handleBookUpdated}
        />
      )}
    </SiteLayout>
  );
}
