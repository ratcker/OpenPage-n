const publicationCopy = {
  author: {
    badge: 'От автора',
    heading: 'Опубликовано автором.',
    description: (
      'Автор подтвердил право разместить произведение на платформе Опенпейч.'
    ),
  },
  authorized_distributor: {
    badge: 'Опубликовано пользователем',
    heading: 'Размещено пользователем Опенпейч.',
    description: (
      'Пользователь подтвердил наличие необходимых прав для публикации '
      + 'и распространения произведения.'
    ),
  },
};

function publicationInfo(book) {
  if (book.visibility !== 'public') return null;
  return publicationCopy[book.publication_basis] || null;
}

export function BookPublicationBadge({ book }) {
  const info = publicationInfo(book);
  if (!info) return null;
  return <span className="book-publication-badge">{info.badge}</span>;
}

export function BookPublicationNotice({ book }) {
  const info = publicationInfo(book);
  if (!info) return null;

  return (
    <details className="book-publication-notice">
      <summary>О публикации</summary>
      <div role="note">
        <strong>{info.heading}</strong>
        <p>{info.description}</p>
        <p className="book-publication-disclaimer">
          Опенпейч не подтверждает авторство или наличие прав самостоятельно.
        </p>
      </div>
    </details>
  );
}
