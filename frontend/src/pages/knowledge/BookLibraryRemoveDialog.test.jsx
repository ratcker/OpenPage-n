import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../api/knowledge.js', () => ({ removeBookFromLibrary: vi.fn() }));

import { removeBookFromLibrary } from '../../api/knowledge.js';
import BookLibraryRemoveDialog from './BookLibraryRemoveDialog.jsx';

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

const book = { id: 'book-9', title: 'Книга' };

describe('BookLibraryRemoveDialog', () => {
it('удаляет только текущий library entry и возвращает book id', async () => {
    const user = userEvent.setup();
    const onRemoved = vi.fn();
    removeBookFromLibrary.mockResolvedValue(undefined);
    render(<BookLibraryRemoveDialog book={book} onClose={vi.fn()} onRemoved={onRemoved} />);

    expect(screen.getByRole('dialog')).toHaveTextContent('останется в каталоге');
    await user.click(screen.getByRole('button', { name: 'Убрать из библиотеки' }));

    expect(removeBookFromLibrary).toHaveBeenCalledWith('book-9');
    expect(onRemoved).toHaveBeenCalledWith('book-9');
  });

  it('показывает not-found response и позволяет сделать retry', async () => {
    const user = userEvent.setup();
    removeBookFromLibrary.mockRejectedValueOnce({ status: 404 }).mockResolvedValueOnce(undefined);
    const onRemoved = vi.fn();
    render(<BookLibraryRemoveDialog book={book} onClose={vi.fn()} onRemoved={onRemoved} />);

    await user.click(screen.getByRole('button', { name: 'Убрать из библиотеки' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Книга уже убрана из библиотеки');
    await user.click(screen.getByRole('button', { name: 'Убрать из библиотеки' }));
    expect(onRemoved).toHaveBeenCalledWith('book-9');
    expect(removeBookFromLibrary).toHaveBeenCalledTimes(2);
  });
});