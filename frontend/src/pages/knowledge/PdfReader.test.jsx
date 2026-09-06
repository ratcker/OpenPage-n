import {
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import PdfReader from './PdfReader.jsx';

vi.mock('react-pdf', () => ({
  pdfjs: { GlobalWorkerOptions: {} },
  Document: ({ children, onLoadSuccess, onLoadError }) => (
    <div>
      <button type="button" onClick={() => onLoadSuccess({ numPages: 3 })}>
        Загрузить PDF mock
      </button>
      <button type="button" onClick={() => onLoadError(new Error('expired'))}>
        Ошибка документа mock
      </button>
      {children}
    </div>
  ),
  Page: ({ pageNumber, scale, onRenderSuccess }) => (
    <div data-testid={`rendered-page-${pageNumber}`}>
      Страница {pageNumber}, scale {scale}
      <button type="button" onClick={onRenderSuccess}>
        Отрисовать страницу {pageNumber}
      </button>
    </div>
  ),
}));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('PdfReader', () => {
  it('обрабатывает numPages, восстанавливает страницу и сообщает scroll progress', () => {
    const onPositionChange = vi.fn();
    vi.spyOn(HTMLElement.prototype, 'offsetTop', 'get').mockImplementation(function offsetTop() {
      return Number(this.dataset.page || 0) * 100;
    });
    vi.stubGlobal('requestAnimationFrame', (callback) => {
      callback();
      return null;
    });
    vi.stubGlobal('cancelAnimationFrame', vi.fn());

    render(
      <PdfReader
        contentUrl="https://s3.example.test/book.pdf"
        initialLocation={{ type: 'pdf', page: 2 }}
        scale={1.15}
        onPositionChange={onPositionChange}
        onContentError={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Загрузить PDF mock' }));
    expect(screen.getAllByTestId(/rendered-page-/)).toHaveLength(3);
    expect(screen.getByText('Страница 3, scale 1.15')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Отрисовать страницу 2' }));
    const scroll = document.querySelector('.pdf-reader-scroll');
    expect(scroll.scrollTop).toBe(200);

    Object.defineProperties(scroll, {
      clientHeight: { configurable: true, value: 400 },
      scrollHeight: { configurable: true, value: 1000 },
    });
    scroll.scrollTop = 300;
    fireEvent.scroll(scroll);

    expect(onPositionChange).toHaveBeenLastCalledWith({
      reading_location: { type: 'pdf', page: 3 },
      reading_percentage: 50,
    });
  });

  it('передаёт ошибку загрузки документа странице reader-а', () => {
    const onContentError = vi.fn();
    render(
      <PdfReader
        contentUrl="https://s3.example.test/book.pdf"
        initialLocation={null}
        scale={1}
        onPositionChange={vi.fn()}
        onContentError={onContentError}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Ошибка документа mock' }));
    expect(onContentError).toHaveBeenCalledTimes(1);
  });
});
