import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../api/knowledge.js', () => ({ updateKnowledgeBook: vi.fn() }));
vi.mock('./useImagePreview.js', () => ({ default: () => '' }));

import { updateKnowledgeBook } from '../../api/knowledge.js';
import BookEditDialog from './BookEditDialog.jsx';

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

const book = {
  id: 'book-5', title: 'Старое название', author: 'Автор', description: '',
  language: 'ru', year: 2020, publisher: '', cover_url: '/cover.png',
};

describe('BookEditDialog', () => {
  it('отправляет только измененные metadata и закрывается в случае успеха', async () => {
    const user = userEvent.setup();
    const updated = { ...book, title: 'Новое название' };
    const onUpdated = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();
    updateKnowledgeBook.mockResolvedValue(updated);
    render(<BookEditDialog book={book} onClose={onClose} onUpdated={onUpdated} />);

    await user.clear(screen.getByLabelText('Название'));
    await user.type(screen.getByLabelText('Название'), 'Новое название');
    await user.click(screen.getByRole('button', { name: 'Сохранить' }));

    expect(updateKnowledgeBook).toHaveBeenCalledWith('book-5', { title: 'Новое название' });
    expect(onUpdated).toHaveBeenCalledWith(updated);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('закрывается без API request, если metadata не изменились', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<BookEditDialog book={book} onClose={onClose} onUpdated={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: 'Сохранить' }));

    expect(updateKnowledgeBook).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('оставляет диалог открытым и показывает backend validation error', async () => {
    const user = userEvent.setup();
    updateKnowledgeBook.mockRejectedValue({ status: 400, message: 'Некорректный год' });
    const onClose = vi.fn();
    render(<BookEditDialog book={book} onClose={onClose} onUpdated={vi.fn()} />);

    await user.clear(screen.getByLabelText('Название'));
    await user.type(screen.getByLabelText('Название'), 'Новое');
    await user.click(screen.getByRole('button', { name: 'Сохранить' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Некорректный год');
    expect(onClose).not.toHaveBeenCalled();
  });
});