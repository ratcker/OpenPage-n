export function formatBookProgress(value) {
  const progress = Number(value);
  return Number.isFinite(progress) ? `${value}%` : '0%';
}

export function bookAuthorLine(book) {
  return [book.author, book.year].filter(Boolean).join(' · ');
}

export function bookDetailMetadata(book) {
  return [
    ['Автор', book.author],
    ['Год', book.year],
    ['Издательство', book.publisher],
    ['Язык', book.language?.toUpperCase()],
    ['Формат', book.format?.toUpperCase()],
    ['Видимость', book.visibility === 'private' ? 'Приватная' : 'Публичная'],
  ].filter(([, value]) => value !== null && value !== undefined && value !== '');
}
