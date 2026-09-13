import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { getKnowledgeLibrary } from '../../api/knowledge.js';
import SiteLayout from '../../components/SiteLayout.jsx';
import BookCollection, {
  initialBookCollectionState,
  loadedBookCollection,
} from './BookCollection.jsx';

export default function LibraryPage() {
  const [page, setPage] = useState(1);
  const [state, setState] = useState(initialBookCollectionState);

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

  return (
    <SiteLayout>
      <div className="knowledge-page library-page">
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
            onPageChange={setPage}
          />
        </div>
      </div>
    </SiteLayout>
  );
}
