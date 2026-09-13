import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';

import {
  addBookToLibrary,
  getKnowledgeArticles,
  getKnowledgeBooks,
  getKnowledgeProfile,
  getMyKnowledgeArticles,
} from '../../api/knowledge.js';
import useAuth from '../../auth/useAuth.js';
import SiteLayout from '../../components/SiteLayout.jsx';
import AuthorProfile from './AuthorProfile.jsx';
import AuthorProfileDialog from './AuthorProfileDialog.jsx';
import ArticleCard from './ArticleCard.jsx';
import BookCollection, {
  initialBookCollectionState,
  loadedBookCollection,
} from './BookCollection.jsx';
import BookLibraryAction from './BookLibraryAction.jsx';
import BookUploadDialog from './BookUploadDialog.jsx';

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
  addingBookId,
  error,
  onAdd,
}) {
  return (
    <BookLibraryAction
      book={book}
      authStatus={authStatus}
      isAdding={addingBookId === book.id}
      disabled={Boolean(addingBookId)}
      error={error?.bookId === book.id ? error.message : ''}
      loginFrom="/knowledge"
      onAdd={() => onAdd(book.id)}
    />
  );
}

function BooksView({
  authStatus,
  booksState,
  booksPage,
  profileState,
  addingBookId,
  addError,
  onAddBook,
  onBooksPageChange,
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
          id="catalog-title"
          kicker="Общий каталог"
          title="Публичные книги"
          description="Новые доступные всем материалы."
          state={booksState}
          page={booksPage}
          emptyTitle="Публичных книг пока нет."
          emptyDescription="Каталог наполнится, когда появятся общедоступные книги."
          errorTitle="Не удалось загрузить каталог."
          loadingLabel="Загружаем публичные книги…"
          onPageChange={onBooksPageChange}
          renderBookAction={(book) => (
            <CatalogBookAction
              book={book}
              authStatus={authStatus}
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

function ArticleCollection({
  className = '',
  id,
  kicker,
  title,
  description,
  action,
  state,
  page,
  emptyTitle,
  emptyDescription,
  errorTitle,
  onPageChange,
}) {
  let content;

  if (state.status === 'loading') {
    content = (
      <div className="knowledge-message" role="status">
        <h3>Загружаем статьи…</h3>
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
      <div className="article-grid">
        {state.items.map((article) => (
          <ArticleCard article={article} key={article.id} />
        ))}
      </div>
    );
  }

  return (
    <section
      className={`knowledge-catalog articles-catalog ${className}`.trim()}
      aria-labelledby={id}
    >
      <div className="knowledge-section-heading">
        <div>
          <p className="section-kicker">{kicker}</p>
          <h2 id={id}>{title}</h2>
        </div>
        {action || <p>{description}</p>}
      </div>
      {content}
      {state.status === 'success' && (state.next || state.previous) && (
        <nav className="knowledge-pagination" aria-label={`Страницы: ${title}`}>
          <button
            type="button"
            disabled={!state.previous}
            onClick={() => onPageChange(page - 1)}
          >
            Назад
          </button>
          <span>Страница {page}</span>
          <button
            type="button"
            disabled={!state.next}
            onClick={() => onPageChange(page + 1)}
          >
            Далее
          </button>
        </nav>
      )}
    </section>
  );
}

function ArticlesView({ profileState }) {
  const [articlesState, setArticlesState] = useState(initialArticlesState);
  const [myArticlesState, setMyArticlesState] = useState(initialArticlesState);
  const [page, setPage] = useState(1);
  const [myPage, setMyPage] = useState(1);
  const hasProfile = profileState.status === 'exists';

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

  useEffect(() => {
    if (!hasProfile) return undefined;

    let isActive = true;
    setMyArticlesState(initialArticlesState);

    getMyKnowledgeArticles(myPage)
      .then((data) => {
        if (!isActive) return;
        setMyArticlesState({
          status: 'success',
          items: data.results,
          count: data.count,
          next: data.next,
          previous: data.previous,
        });
      })
      .catch(() => {
        if (isActive) setMyArticlesState({ ...initialArticlesState, status: 'error' });
      });

    return () => {
      isActive = false;
    };
  }, [hasProfile, myPage]);

  return (
    <div className={`articles-layout${hasProfile ? ' articles-layout-with-personal' : ''}`}>
      {hasProfile && (
        <ArticleCollection
          className="my-articles"
          id="my-articles-title"
          kicker="Личные публикации"
          title="Ваши статьи"
          action={(
            <Link className="article-create-link" to="/knowledge/articles/new">
              Написать статью
            </Link>
          )}
          state={myArticlesState}
          page={myPage}
          emptyTitle="У вас пока нет статей."
          emptyDescription="Создайте первый материал — приватный или публичный."
          errorTitle="Не удалось загрузить ваши статьи."
          onPageChange={setMyPage}
        />
      )}

      <ArticleCollection
        id="articles-title"
        kicker="Публикации"
        title="Все статьи"
        description="Тексты и подборки авторов сообщества."
        state={articlesState}
        page={page}
        emptyTitle="Публичных статей пока нет."
        emptyDescription="Здесь появятся новые тексты авторов Базы знаний."
        errorTitle="Не удалось загрузить статьи."
        onPageChange={setPage}
      />
    </div>
  );
}

export default function KnowledgePage() {
  const { status: authStatus } = useAuth();
  const [searchParams] = useSearchParams();
  const [mode, setMode] = useState(
    searchParams.get('tab') === 'articles' ? 'articles' : 'books',
  );
  const [booksState, setBooksState] = useState(initialBookCollectionState);
  const [booksPage, setBooksPage] = useState(1);
  const [profileState, setProfileState] = useState({ status: 'loading', profile: null });
  const [addingBookId, setAddingBookId] = useState(null);
  const [addError, setAddError] = useState(null);
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [profileDialogMode, setProfileDialogMode] = useState(null);
  const addPendingRef = useRef(false);

  useEffect(() => {
    if (authStatus === 'loading') return undefined;

    let isActive = true;
    setBooksState(initialBookCollectionState);

    getKnowledgeBooks(booksPage, authStatus === 'authenticated')
      .then((data) => {
        if (isActive) setBooksState(loadedBookCollection(data));
      })
      .catch(() => {
        if (isActive) {
          setBooksState({ ...initialBookCollectionState, status: 'error' });
        }
      });

    return () => {
      isActive = false;
    };
  }, [authStatus, booksPage]);

  useEffect(() => {
    if (authStatus === 'loading') return undefined;
    if (authStatus === 'anonymous') {
      setProfileState({ status: 'anonymous', profile: null });
      return undefined;
    }

    let isActive = true;
    setProfileState({ status: 'loading', profile: null });

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
    if (addPendingRef.current) return;

    addPendingRef.current = true;
    setAddingBookId(bookId);
    setAddError(null);

    try {
      await addBookToLibrary(bookId);
      setBooksState((current) => ({
        ...current,
        items: current.items.map((book) => (
          book.id === bookId ? { ...book, is_in_library: true } : book
        )),
      }));
    } catch {
      setAddError({
        bookId,
        message: 'Не удалось добавить книгу. Попробуйте ещё раз.',
      });
    } finally {
      addPendingRef.current = false;
      setAddingBookId(null);
    }
  }

  async function handleBookUploaded(book) {
    if (book.visibility !== 'public') return;
    try {
      const data = await getKnowledgeBooks(booksPage, true);
      setBooksState(loadedBookCollection(data));
    } catch {
      setBooksState({ ...initialBookCollectionState, status: 'error' });
    }
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
              booksPage={booksPage}
              profileState={profileState}
              addingBookId={addingBookId}
              addError={addError}
              onAddBook={handleAddBook}
              onBooksPageChange={setBooksPage}
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
    </SiteLayout>
  );
}
