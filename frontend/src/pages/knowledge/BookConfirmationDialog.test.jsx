import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import BookConfirmationDialog from './BookConfirmationDialog.jsx';

const baseProps = {
  titleId: 'confirm-title',
  descriptionId: 'confirm-description',
  kicker: 'Подтверждение',
  title: 'Подтвердить действие?',
  isPending: false,
  error: '',
  confirmLabel: 'Подтвердить',
  pendingLabel: 'Выполняется…',
  onClose: vi.fn(),
  onConfirm: vi.fn(),
};

describe('BookConfirmationDialog', () => {
  it('связывает доступные labels диалога и отправляет confirm', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const onConfirm = vi.fn();
    render(
      <BookConfirmationDialog {...baseProps} onClose={onClose} onConfirm={onConfirm}>
        <p>Описание подтверждения</p>
      </BookConfirmationDialog>,
    );

    const dialog = screen.getByRole('dialog', { name: 'Подтвердить действие?' });
    expect(dialog).toHaveAttribute('aria-describedby', 'confirm-description');
    expect(screen.getByText('Описание подтверждения')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Подтвердить' }));
    await user.click(screen.getByRole('button', { name: 'Отмена' }));

    expect(onConfirm).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('закрывается только по клику на backdrop, а не по клику внутри диалога', () => {
    const onClose = vi.fn();
    const { container } = render(
      <BookConfirmationDialog {...baseProps} onClose={onClose}>
        <p>Текст</p>
      </BookConfirmationDialog>,
    );
    const backdrop = container.firstElementChild;
    const dialog = screen.getByRole('dialog');

    fireEvent.mouseDown(dialog);
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.mouseDown(backdrop);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('предотвращает закрытие и дублирование экшенов в состоянии pending', () => {
    const onClose = vi.fn();
    const onConfirm = vi.fn();
    const { container } = render(
      <BookConfirmationDialog {...baseProps} isPending onClose={onClose} onConfirm={onConfirm}>
        <p>Текст</p>
      </BookConfirmationDialog>,
    );

    fireEvent.mouseDown(container.firstElementChild);
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Закрыть' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Отмена' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Выполняется…' })).toBeDisabled();
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
