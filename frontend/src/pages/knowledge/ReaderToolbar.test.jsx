import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';

import ReaderToolbar from './ReaderToolbar.jsx';

const baseProps = {
  book: { id: 'book-1', title: 'Книга', author: 'Автор', format: 'pdf', visibility: 'private' },
  progress: 24.6,
  zoom: 1,
  fontSize: 100,
  isFullscreen: false,
  saveStatus: 'saved',
  onZoomChange: vi.fn(),
  onFontSizeChange: vi.fn(),
  onFullscreen: vi.fn(),
};

describe('ReaderToolbar', () => {
  it('показывает rounded progress и PDF zoom controls', async () => {
    const user = userEvent.setup();
    const onZoomChange = vi.fn();
    render(<MemoryRouter><ReaderToolbar {...baseProps} onZoomChange={onZoomChange} /></MemoryRouter>);

    expect(screen.getByLabelText('Прогресс чтения')).toHaveTextContent('25%');
    expect(screen.getByLabelText('Масштаб PDF')).toBeInTheDocument();
    expect(screen.getByText('100%')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Увеличить масштаб' }));
    expect(onZoomChange).toHaveBeenCalledWith(0.15);
    expect(screen.queryByLabelText('Размер текста EPUB')).not.toBeInTheDocument();
  });

  it('показывает EPUB font controls и соответствующее publication notice', async () => {
    const user = userEvent.setup();
    const onFontSizeChange = vi.fn();
    render(
      <MemoryRouter>
        <ReaderToolbar
          {...baseProps}
          book={{ ...baseProps.book, format: 'epub', visibility: 'public', publication_basis: 'author' }}
          fontSize={100}
          onFontSizeChange={onFontSizeChange}
        />
      </MemoryRouter>,
    );

    expect(screen.getByLabelText('Размер текста EPUB')).toBeInTheDocument();
    expect(screen.getByText('О публикации')).toBeInTheDocument();
    expect(screen.getByText('Опубликовано автором.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Увеличить размер текста' }));
    expect(onFontSizeChange).toHaveBeenCalledWith(10);
  });

  it('отключает zoom на нижней границе и отображает error как status', () => {
    render(
      <MemoryRouter>
        <ReaderToolbar {...baseProps} zoom={0.35} saveStatus="error" isFullscreen />
      </MemoryRouter>,
    );

    expect(screen.getByRole('button', { name: 'Уменьшить масштаб' })).toBeDisabled();
    expect(screen.getByRole('status')).toHaveTextContent('Не удалось сохранить прогресс');
    expect(screen.getByRole('button', { name: 'Выйти из полного экрана' })).toBeInTheDocument();
  });
});