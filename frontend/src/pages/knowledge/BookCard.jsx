import { Link } from 'react-router-dom';

import BookCover from './BookCover.jsx';
import { BookPublicationBadge } from './BookPublicationInfo.jsx';
import { bookAuthorLine, formatBookProgress } from './bookPresentation.js';

export default function BookCard({ book, readingPercentage, action }) {
  const authorLine = bookAuthorLine(book);

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
        {readingPercentage !== undefined && (
          <div className="book-progress">
            <span>Прочитано</span>
            <strong>{formatBookProgress(readingPercentage)}</strong>
          </div>
        )}
        <div className="book-card-actions">
          <div className="book-card-navigation">
            <Link className="book-read-action" to={`/knowledge/books/${book.id}/read`}>
              Читать
            </Link>
            <Link className="book-open-action" to={`/knowledge/books/${book.id}`}>
              Открыть книгу
            </Link>
          </div>
          {action && <div className="book-card-context-action">{action}</div>}
        </div>
      </div>
    </article>
  );
}
