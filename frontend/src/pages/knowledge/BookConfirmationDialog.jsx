export default function BookConfirmationDialog({
  titleId,
  descriptionId,
  kicker,
  title,
  isPending,
  error,
  confirmLabel,
  pendingLabel,
  confirmClassName = '',
  onClose,
  onConfirm,
  children,
}) {
  function handleBackdropClick(event) {
    if (!isPending && event.target === event.currentTarget) onClose();
  }

  return (
    <div className="book-upload-backdrop" onMouseDown={handleBackdropClick}>
      <section
        className="book-upload-dialog book-delete-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
      >
        <div className="book-upload-heading">
          <div>
            <p className="section-kicker">{kicker}</p>
            <h2 id={titleId}>{title}</h2>
          </div>
          <button
            className="dialog-close"
            type="button"
            aria-label="Закрыть"
            disabled={isPending}
            onClick={onClose}
          >
            ×
          </button>
        </div>

        <div id={descriptionId} className="book-delete-copy">{children}</div>
        {error && <p className="book-upload-error" role="alert">{error}</p>}

        <div className="book-upload-actions">
          <button type="button" autoFocus disabled={isPending} onClick={onClose}>
            Отмена
          </button>
          <button
            className={confirmClassName || undefined}
            type="button"
            disabled={isPending}
            onClick={onConfirm}
          >
            {isPending ? pendingLabel : confirmLabel}
          </button>
        </div>
      </section>
    </div>
  );
}
