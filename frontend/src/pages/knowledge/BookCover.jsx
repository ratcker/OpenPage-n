import { useState } from 'react';

export default function BookCover({ book, eager = false }) {
  const [failedUrl, setFailedUrl] = useState('');

  if (book.cover_url && failedUrl !== book.cover_url) {
    return (
      <div className="book-cover book-cover-image">
        <img
          src={book.cover_url}
          alt={`Обложка книги «${book.title}»`}
          loading={eager ? 'eager' : 'lazy'}
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
