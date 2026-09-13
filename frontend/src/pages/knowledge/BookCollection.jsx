import BookCard from './BookCard.jsx';

export const initialBookCollectionState = {
  status: 'loading',
  items: [],
  count: 0,
  next: null,
  previous: null,
};

export function loadedBookCollection(data) {
  return {
    status: 'success',
    items: data.results,
    count: data.count,
    next: data.next,
    previous: data.previous,
  };
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

export default function BookCollection({
  id,
  kicker,
  title,
  description,
  state,
  emptyTitle,
  emptyDescription,
  errorTitle,
  loadingLabel,
  page,
  library = false,
  renderBookAction,
  onPageChange,
}) {
  let content;

  if (state.status === 'loading') {
    content = <LoadingBooks label={loadingLabel} />;
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
