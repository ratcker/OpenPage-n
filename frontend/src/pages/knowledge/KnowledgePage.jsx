import { useState } from 'react';

import SiteLayout from '../../components/SiteLayout.jsx';
import AuthorProfile from './AuthorProfile.jsx';

const bookCards = ['Новая полка', 'Будущая коллекция', 'Личные заметки'];
const articleCards = ['Рабочие заметки', 'Полезная подборка', 'Новая идея'];

function BooksView() {
  return (
    <div className="knowledge-library-layout">
      <AuthorProfile />

      <section className="knowledge-catalog" aria-labelledby="books-title">
        <div className="knowledge-section-heading">
          <div>
            <p className="section-kicker">Библиотека</p>
            <h2 id="books-title">Ваши книги</h2>
          </div>
          <p>Основа будущего книжного каталога.</p>
        </div>

        <div className="book-grid">
          {bookCards.map((title, index) => (
            <article className="book-card" key={title}>
              <div className="book-cover" aria-hidden="true">
                <span>{String(index + 1).padStart(2, '0')}</span>
                <i />
              </div>
              <div>
                <p>Макет карточки</p>
                <h3>{title}</h3>
              </div>
            </article>
          ))}
        </div>
      </section>
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

// Визуальная основа сервиса без серверных данных.
export default function KnowledgePage() {
  const [mode, setMode] = useState('books');

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
          {mode === 'books' ? <BooksView /> : <ArticlesView />}
        </div>
      </div>
    </SiteLayout>
  );
}
