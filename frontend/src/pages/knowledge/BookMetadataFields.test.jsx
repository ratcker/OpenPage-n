import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import BookMetadataFields from './BookMetadataFields.jsx';

const form = {
  title: 'Название',
  author: 'Автор',
  description: 'Описание',
  language: 'ru',
  year: '2024',
  publisher: 'Издательство',
  cover: null,
};

describe('BookMetadataFields', () => {
  it('рендерит controlled values и image preview, когда они переданы', () => {
    render(
      <BookMetadataFields
        form={form}
        coverPreview="data:image/png;base64,preview"
        onChange={vi.fn()}
      />,
    );

    expect(screen.getByLabelText('Название')).toHaveValue('Название');
    expect(screen.getByLabelText('Автор')).toHaveValue('Автор');
    expect(screen.getByLabelText('Год')).toHaveValue(2024);
    expect(screen.getByRole('img', { name: 'Предпросмотр обложки' })).toHaveAttribute(
      'src',
      'data:image/png;base64,preview',
    );
    expect(screen.getByText('Обложка из EPUB')).toBeInTheDocument();
  });

  it('пробрасывает изменения и выбранные cover файлы через общий change callback', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<BookMetadataFields form={form} onChange={onChange} />);
    const cover = new File(['image'], 'cover.png', { type: 'image/png' });

    await user.clear(screen.getByLabelText('Название'));
    await user.type(screen.getByLabelText('Название'), 'Новое название');
    await user.upload(screen.getByLabelText('Обложка'), cover);

    expect(onChange).toHaveBeenCalled();
    expect(screen.getByLabelText('Обложка')).toHaveAttribute(
      'accept',
      'image/jpeg,image/png,image/gif,image/webp',
    );
    expect(onChange.mock.calls.at(-1)[0].target.files[0]).toBe(cover);
  });

  it('Отключает каждое поле, пока save operation находится в состоянии pending', () => {
    render(<BookMetadataFields form={form} disabled onChange={vi.fn()} />);

    expect(screen.getByLabelText('Название')).toBeDisabled();
    expect(screen.getByLabelText('Описание')).toBeDisabled();
    expect(screen.getByLabelText('Язык')).toBeDisabled();
    expect(screen.getByLabelText('Год')).toBeDisabled();
    expect(screen.getByLabelText('Обложка')).toBeDisabled();
  });
});