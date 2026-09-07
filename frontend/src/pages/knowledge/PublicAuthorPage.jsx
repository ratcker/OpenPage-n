import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import {
  getKnowledgeAuthor,
  getKnowledgeAuthorBooks,
} from '../../api/knowledge.js';
import SiteLayout from '../../components/SiteLayout.jsx';
import { ProfileAvatar } from './AuthorProfile.jsx';
import BookCard from './BookCard.jsx';

const initialAuthorState = { status: 'loading', author: null };
const initialBooksState = {
  status: 'loading',
  items: [],
  count: 0,
  next: null,
  previous: null,
};

export default function PublicAuthorPage() {
  const { publicId } = useParams();
  const [authorState, setAuthorState] = useState(initialAuthorState);
  const [booksState, setBooksState] = useState(initialBooksState);
  const [page, setPage] = useState(1);

  useEffect(() => {
    let isActive = true;
    setAuthorState(initialAuthorState);

    getKnowledgeAuthor(publicId)
      .then((author) => {
        if (isActive) setAuthorState({ status: 'success', author });
      })
      .catch((error) => {
        if (!isActive) return;
        setAuthorState({
          status: error.status === 404 ? 'not-found' : 'error',
          author: null,
        });
      });

    return () => {
      isActive = false;
    };
  }, [publicId]);

  useEffect(() => {
    let isActive = true;
    setBooksState(initialBooksState);

    getKnowledgeAuthorBooks(publicId, page)
      .then((data) => {
        if (!isActive) return;
        setBooksState({
          status: 'success',
          items: data.results,
          count: data.count,
          next: data.next,
          previous: data.previous,
        });
      })
      .catch(() => {
        if (isActive) setBooksState({ ...initialBooksState, status: 'error' });
      });

    return () => {
      isActive = false;
    };
  }, [page, publicId]);

  let authorContent;
  if (authorState.status === 'loading') {
    authorContent = (
      <div className="public-author-state" role="status">
        Загружаем профиль автора…
      </div>
    );
  } else if (authorState.status === 'not-found') {
    authorContent = (
      <div className="public-author-state" role="alert">
        <h1>Автор не найден</h1>
        <p>Возможно, профиль был указан неверно.</p>
      </div>
    );
  } else if (authorState.status === 'error') {
    authorContent = (
      <div className="public-author-state" role="alert">
        <h1>Не удалось загрузить профиль</h1>
        <p>Попробуйте открыть страницу немного позже.</p>
      </div>
    );
  } else {
    const { author } = authorState;
    authorContent = (
      <header className="public-author-hero">
        <ProfileAvatar profile={author} />
        <div>
          <p className="section-kicker">Автор Базы знаний</p>
          <h1>{author.display_name}</h1>
          {author.bio && <p>{author.bio}</p>}
        </div>
      </header>
    );
  }

  let booksContent;
  if (booksState.status === 'loading') {
    booksContent = (
      <div className="knowledge-message" role="status">
        <h3>Загружаем книги…</h3>
      </div>
    );
  } else if (booksState.status === 'error') {
    booksContent = (
      <div className="knowledge-message" role="alert">
        <h3>Не удалось загрузить книги автора.</h3>
        <p>Попробуйте открыть раздел немного позже.</p>
      </div>
    );
  } else if (booksState.items.length === 0) {
    booksContent = (
      <div className="knowledge-message">
        <h3>У автора пока нет публичных книг.</h3>
      </div>
    );
  } else {
    booksContent = (
      <div className="book-grid">
        {booksState.items.map((book) => <BookCard book={book} key={book.id} />)}
      </div>
    );
  }

  return (
    <SiteLayout>
      <div className="knowledge-page public-author-page">
        <div className="container public-author-content">
          <Link className="public-author-back" to="/knowledge">← База знаний</Link>
          {authorContent}

          {authorState.status === 'success' && (
            <section className="knowledge-catalog" aria-labelledby="author-books-title">
              <div className="knowledge-section-heading">
                <div>
                  <p className="section-kicker">Публикации автора</p>
                  <h2 id="author-books-title">Публичные книги</h2>
                </div>
                <p>{booksState.status === 'success' ? `${booksState.count} книг` : ''}</p>
              </div>
              {booksContent}
              {booksState.status === 'success' && (booksState.next || booksState.previous) && (
                <nav className="knowledge-pagination" aria-label="Страницы книг автора">
                  <button
                    type="button"
                    disabled={!booksState.previous}
                    onClick={() => setPage((current) => current - 1)}
                  >
                    Назад
                  </button>
                  <span>Страница {page}</span>
                  <button
                    type="button"
                    disabled={!booksState.next}
                    onClick={() => setPage((current) => current + 1)}
                  >
                    Далее
                  </button>
                </nav>
              )}
            </section>
          )}
        </div>
      </div>
    </SiteLayout>
  );
}
