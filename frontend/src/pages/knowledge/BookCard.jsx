import { useState } from 'react';
import { Link } from 'react-router-dom';

import { BookPublicationBadge } from './BookPublicationInfo.jsx';

function formatProgress(value) {
  const progress = Number(value);
  return Number.isFinite(progress) ? `${value}%` : '0%';
}

function BookCover({ book }) {
  const [failedUrl, setFailedUrl] = useState('');

  if (book.cover_url && failedUrl !== book.cover_url) {
    return (
      <div className="book-cover book-cover-image">
        <img
          src={book.cover_url}
          alt={`Обложка книги «${book.title}»`}
          loading="lazy"
          onError={() => setFailedUrl(book.cover_url)}
        />
      </div>
    );
  }

  return (
    <div
      className="book-cover book-cover-fallback"
      role="img"
      aria-label={`Обложка книги «${book.title}» отсутствует`}
    >
      <span>{book.format.toUpperCase()}</span>
      <i />
    </div>
  );
}

export default function BookCard({ book, readingPercentage, action, onEdit }) {
  const authorLine = [book.author, book.year].filter(Boolean).join(' · ');

  return (
    <article className="book-card">
      <BookCover book={book} />
      <div className="book-card-copy">
        <p>{authorLine}</p>
        <h3>{book.title}</h3>
        <BookPublicationBadge book={book} />
        {(book.publisher || book.language) && (
          <div className="book-metadata">
            {book.publisher && <span>{book.publisher}</span>}
            {book.language && <strong>{book.language.toUpperCase()}</strong>}
          </div>
        )}
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
          {book.can_edit === true && onEdit && (
            <button
              className="book-library-action"
              type="button"
              onClick={() => onEdit(book)}
            >
              Редактировать
            </button>
          )}
          {action}
        </div>
      </div>
    </article>
  );
}
