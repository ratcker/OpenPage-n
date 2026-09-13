import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { getKnowledgeLibrary } from '../../api/knowledge.js';
import SiteLayout from '../../components/SiteLayout.jsx';
import BookCollection, {
  initialBookCollectionState,
  loadedBookCollection,
} from './BookCollection.jsx';
import BookLibraryRemoveDialog from './BookLibraryRemoveDialog.jsx';

export default function LibraryPage() {
  const [page, setPage] = useState(1);
  const [state, setState] = useState(initialBookCollectionState);
  const [removingBook, setRemovingBook] = useState(null);

  useEffect(() => {
    let isActive = true;
    setState(initialBookCollectionState);

    getKnowledgeLibrary(page)
      .then((data) => {
        if (isActive) setState(loadedBookCollection(data));
      })
      .catch(() => {
        if (isActive) {
          setState({ ...initialBookCollectionState, status: 'error' });
        }
      });

    return () => {
      isActive = false;
    };
  }, [page]);

  function handleRemoved(bookId) {
    setRemovingBook(null);
    if (page > 1 && state.items.length === 1) {
      setPage((current) => current - 1);
      return;
    }

    setState((current) => ({
      ...current,
      items: current.items.filter((item) => item.book.id !== bookId),
      count: Math.max(0, current.count - 1),
    }));
  }

  return (
    <SiteLayout>
      <div
        className="knowledge-page library-page"
        aria-hidden={removingBook ? 'true' : undefined}
        inert={Boolean(removingBook)}
      >
        <div className="container library-page-content">
          <Link className="public-author-back" to="/knowledge">← База знаний</Link>
          <header className="library-page-heading">
            <p className="section-kicker">Личная коллекция</p>
            <h1>Моя библиотека</h1>
            <p>Сохранённые книги и ваш прогресс чтения.</p>
          </header>
          <BookCollection
            id="library-title"
            kicker="Библиотека"
            title="Сохранённые книги"
            description={state.status === 'success' ? `${state.count} книг` : ''}
            state={state}
            page={page}
            emptyTitle="В вашей библиотеке пока нет книг."
            emptyDescription="Добавьте книгу из публичного каталога."
            errorTitle="Не удалось загрузить библиотеку."
            loadingLabel="Загружаем вашу библиотеку…"
            library
            renderBookAction={(book) => (
              <button
                className="book-library-action"
                type="button"
                onClick={() => setRemovingBook(book)}
              >
                Убрать из библиотеки
              </button>
            )}
            onPageChange={setPage}
          />
        </div>
      </div>

      {removingBook && (
        <BookLibraryRemoveDialog
          book={removingBook}
          onClose={() => setRemovingBook(null)}
          onRemoved={handleRemoved}
        />
      )}
    </SiteLayout>
  );
}
