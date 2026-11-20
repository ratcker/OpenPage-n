import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';

import BookLibraryAction from './BookLibraryAction/BookLibraryAction.jsx';

const book = { id: 'book-1', is_in_library: false };

describe('BookLibraryAction', () => {
 it('перенаправляет anonymous readers на login и сохраняет их intended destination', () => {
    render(
      <MemoryRouter>
        <BookLibraryAction
          book={book}
          authStatus="anonymous"
          isAdding={false}
          loginFrom="/knowledge/books/book-1"
          onAdd={vi.fn()}
        />
      </MemoryRouter>,
    );

    expect(screen.getByRole('link', { name: 'Войти, чтобы добавить' })).toHaveAttribute('href', '/login');
  });

  it('вызывает add action и выключает кнопку добавления или если книга уже в библиотеке', async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn();
    const { rerender } = render(
      <BookLibraryAction book={book} authStatus="authenticated" isAdding={false} onAdd={onAdd} />,
    );

    await user.click(screen.getByRole('button', { name: 'Добавить в библиотеку' }));
    expect(onAdd).toHaveBeenCalledOnce();

    rerender(<BookLibraryAction book={{ ...book, is_in_library: true }} authStatus="authenticated" isAdding={false} onAdd={onAdd} />);
    expect(screen.getByRole('button', { name: 'В библиотеке' })).toBeDisabled();

    rerender(<BookLibraryAction book={book} authStatus="authenticated" isAdding onAdd={onAdd} />);
    expect(screen.getByRole('button', { name: 'Добавляем…' })).toBeDisabled();
  });

  it('показывает actionable error без скрытия control', () => {
    render(
      <BookLibraryAction book={book} authStatus="authenticated" isAdding={false} error="Сбой" onAdd={vi.fn()} />,
    );

    expect(screen.getByRole('alert')).toHaveTextContent('Сбой');
    expect(screen.getByRole('button', { name: 'Добавить в библиотеку' })).toBeEnabled();
  });
});