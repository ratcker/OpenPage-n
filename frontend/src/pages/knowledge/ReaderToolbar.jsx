import { Link } from 'react-router-dom';

import { BookPublicationNotice } from './BookPublicationInfo.jsx';

function formatProgress(value) {
  const progress = Number(value);
  return `${Math.round(Number.isFinite(progress) ? progress : 0)}%`;
}

export default function ReaderToolbar({
  book,
  progress,
  zoom,
  fontSize,
  isFullscreen,
  saveStatus,
  onZoomChange,
  onFontSizeChange,
  onFullscreen,
}) {
  return (
    <header className="reader-toolbar">
      <div className="reader-toolbar-book">
        <Link className="reader-back" to="/knowledge" aria-label="Назад в Базу знаний">
          <span aria-hidden="true">←</span>
          Назад
        </Link>
        <div>
          <p>{book.author}</p>
          <h1>{book.title}</h1>
        </div>
      </div>

      <div className="reader-toolbar-actions">
        <BookPublicationNotice book={book} />
        <output className="reader-progress" aria-label="Прогресс чтения">
          {formatProgress(progress)}
        </output>

        {book.format === 'pdf' && (
          <div className="reader-format-controls" aria-label="Масштаб PDF">
            <button
              type="button"
              aria-label="Уменьшить масштаб"
              disabled={zoom <= 0.75}
              onClick={() => onZoomChange(-0.15)}
            >
              −
            </button>
            <span>{Math.round(zoom * 100)}%</span>
            <button
              type="button"
              aria-label="Увеличить масштаб"
              disabled={zoom >= 1.8}
              onClick={() => onZoomChange(0.15)}
            >
              +
            </button>
          </div>
        )}

        {book.format === 'epub' && (
          <div className="reader-format-controls" aria-label="Размер текста EPUB">
            <button
              type="button"
              aria-label="Уменьшить размер текста"
              disabled={fontSize <= 80}
              onClick={() => onFontSizeChange(-10)}
            >
              A−
            </button>
            <span>{fontSize}%</span>
            <button
              type="button"
              aria-label="Увеличить размер текста"
              disabled={fontSize >= 140}
              onClick={() => onFontSizeChange(10)}
            >
              A+
            </button>
          </div>
        )}

        <button className="reader-fullscreen" type="button" onClick={onFullscreen}>
          {isFullscreen ? 'Выйти из полного экрана' : 'Во весь экран'}
        </button>
      </div>

      {saveStatus === 'error' && (
        <p className="reader-save-status" role="status">Не удалось сохранить прогресс</p>
      )}
    </header>
  );
}
