import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import BookCover from './BookCover.jsx';

const book = { title: 'Книга', format: 'epub' };

describe('BookCover', () => {

  it('использует eager loading по запросу и делает fallback', () => {
    render(<BookCover book={book} eager />);
    const image = screen.getByRole('img', { name: 'Обложка книги «Книга»' });
    expect(image).toHaveAttribute('loading', 'eager');

    fireEvent.error(image);

    expect(screen.getByRole('img', { name: 'Обложка книги «Книга» отсутствует' })).toHaveTextContent('EPUB');
    expect(screen.queryByRole('img', { name: 'Обложка книги «Книга»' })).not.toBeInTheDocument();
  });

  it('рендерит format fallback, когда cover URL не передан', () => {
    render(<BookCover book={{ ...book, cover_url: '' }} />);

    expect(screen.getByRole('img', { name: 'Обложка книги «Книга» отсутствует' })).toBeInTheDocument();
  });
});