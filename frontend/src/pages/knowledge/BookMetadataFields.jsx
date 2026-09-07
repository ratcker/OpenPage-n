export default function BookMetadataFields({
  form,
  coverPreview,
  disabled = false,
  onChange,
}) {
  return (
    <>
      <label>
        <span>Название</span>
        <input
          name="title"
          value={form.title}
          required
          disabled={disabled}
          onChange={onChange}
        />
      </label>

      <label>
        <span>Автор</span>
        <input
          name="author"
          value={form.author}
          required
          disabled={disabled}
          onChange={onChange}
        />
      </label>

      <label>
        <span>Описание</span>
        <textarea
          name="description"
          rows={4}
          value={form.description}
          disabled={disabled}
          onChange={onChange}
        />
      </label>

      <div className="book-upload-options book-metadata-options">
        <label>
          <span>Язык</span>
          <input
            name="language"
            value={form.language}
            maxLength={16}
            placeholder="ru"
            disabled={disabled}
            onChange={onChange}
          />
        </label>

        <label>
          <span>Год</span>
          <input
            name="year"
            type="number"
            min="0"
            max={new Date().getFullYear() + 1}
            value={form.year}
            disabled={disabled}
            onChange={onChange}
          />
        </label>
      </div>

      <label>
        <span>Издательство</span>
        <input
          name="publisher"
          value={form.publisher}
          disabled={disabled}
          onChange={onChange}
        />
      </label>

      <label>
        <span>Обложка</span>
        <input
          name="cover"
          type="file"
          accept="image/jpeg,image/png,image/gif,image/webp"
          disabled={disabled}
          onChange={onChange}
        />
      </label>

      {coverPreview && (
        <div className="book-form-cover-preview">
          <img src={coverPreview} alt="Предпросмотр обложки" />
          <span>{form.cover ? 'Выбранная обложка' : 'Обложка из EPUB'}</span>
        </div>
      )}
    </>
  );
}
