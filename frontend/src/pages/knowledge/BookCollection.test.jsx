import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';

import BookCollection, {
  initialBookCollectionState,
  loadedBookCollection,
} from './BookCollection/BookCollection.jsx';

const baseProps = {
  id: 'books-heading',
  kicker: 'Каталог',
  title: 'Книги',
  description: 'Описание каталога',
  emptyTitle: 'Книг пока нет',
  emptyDescription: 'Загрузите первую книгу.',
  errorTitle: 'Не удалось загрузить книги',
  loadingLabel: 'Загружаем книги',
  page: 2,
  onPageChange: vi.fn(),
};

describe('BookCollection', () => {
  it('инициализируется в состоянии loading и рендерит доступное состояние загрузки', () => {
    expect(initialBookCollectionState).toEqual({
      status: 'loading', items: [], count: 0, next: null, previous: null,
    });
    render(<BookCollection {...baseProps} state={initialBookCollectionState} />);

    expect(screen.getByRole('status', { name: 'Загружаем книги' })).toBeInTheDocument();
  });

  it('нормализует page response в success state', () => {
    expect(loadedBookCollection({ count: 9, next: '?page=2', previous: null, results: [1] })).toEqual({
      status: 'success', items: [1], count: 9, next: '?page=2', previous: null,
    });
  });

  it('показывает empty и error states без попытки рендерить карточки книг', () => {
    const { rerender } = render(
      <BookCollection {...baseProps} state={{ status: 'success', items: [], next: null, previous: null }} />,
    );
    expect(screen.getByText('Книг пока нет')).toBeInTheDocument();

    rerender(<BookCollection {...baseProps} state={{ status: 'error', items: [] }} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Не удалось загрузить книги');
  });

  it('рендерит карточки и меняет страницу только когда pagination control активен', async () => {
    const user = userEvent.setup();
    const onPageChange = vi.fn();
    const book = {
      id: 'book-1',
      title: 'Тестовая книга',
      author: 'Автор',
      format: 'epub',
      visibility: 'public',
      cover_url: '',
    };
    render(
      <MemoryRouter>
        <BookCollection
          {...baseProps}
          onPageChange={onPageChange}
          state={{ status: 'success', items: [book], count: 21, next: '?page=3', previous: '?page=1' }}
        />
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { name: 'Тестовая книга' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Читать' })).toHaveAttribute(
      'href',
      '/knowledge/books/book-1/read',
    );
    await user.click(screen.getByRole('button', { name: 'Назад' }));
    await user.click(screen.getByRole('button', { name: 'Далее' }));
    expect(onPageChange).toHaveBeenNthCalledWith(1, 1);
    expect(onPageChange).toHaveBeenNthCalledWith(2, 3);
  });

  it('извлекает library entry и пробрасывает его reading progress', () => {
    const book = {
      id: 'book-2', title: 'Из библиотеки', author: 'Автор', format: 'pdf', visibility: 'private',
    };
    render(
      <MemoryRouter>
        <BookCollection
          {...baseProps}
          library
          state={{
            status: 'success',
            items: [{ id: 'entry-2', book, reading_percentage: 42 }],
            count: 1,
            next: null,
            previous: null,
          }}
        />
      </MemoryRouter>,
    );

    expect(screen.getByText('42%')).toBeInTheDocument();
  });
});