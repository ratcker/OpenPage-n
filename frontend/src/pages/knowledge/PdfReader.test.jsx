import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import PdfReader from './PdfReader.jsx';

const pdfMockState = vi.hoisted(() => ({
  numPages: 10,
  pageProps: new Map(),
}));

vi.mock('react-pdf', () => ({
  pdfjs: { GlobalWorkerOptions: {} },
  Document: ({ children, file, onLoadSuccess, onLoadError, onSourceError }) => (
    <div>
      <span data-testid="document-source">{file}</span>
      <button
        type="button"
        onClick={() => onLoadSuccess({ numPages: pdfMockState.numPages })}
      >
        Загрузить PDF mock
      </button>
      <button type="button" onClick={() => onLoadError(new Error('expired'))}>
        Ошибка документа mock
      </button>
      <button type="button" onClick={() => onSourceError(new Error('source expired'))}>
        Ошибка источника mock
      </button>
      {children}
    </div>
  ),
  Page: (props) => {
    const {
      pageNumber,
      scale,
      devicePixelRatio,
      renderTextLayer,
      renderAnnotationLayer,
      onLoadError,
      onRenderError,
      onRenderSuccess,
    } = props;
    pdfMockState.pageProps.set(pageNumber, props);
    return (
      <div
        data-testid={`rendered-page-${pageNumber}`}
        data-page-number={pageNumber}
        data-scale={scale}
        data-device-pixel-ratio={devicePixelRatio}
        data-text-layer={String(renderTextLayer)}
        data-annotation-layer={String(renderAnnotationLayer)}
      >
        Страница {pageNumber}
        <button type="button" onClick={onRenderSuccess}>
          Отрисовать страницу {pageNumber}
        </button>
        <button
          type="button"
          onClick={() => onRenderError(new Error(`render ${pageNumber}`))}
        >
          Ошибка render страницы {pageNumber}
        </button>
        <button
          type="button"
          onClick={() => onLoadError(new Error(`load ${pageNumber}`))}
        >
          Ошибка load страницы {pageNumber}
        </button>
      </div>
    );
  },
}));

function renderPdf({
  contentUrl = 'https://s3.example.test/book.pdf',
  initialLocation = null,
  scale = 1,
  onPositionChange = vi.fn(),
  onContentError = vi.fn(),
} = {}) {
  const props = {
    contentUrl,
    initialLocation,
    scale,
    onPositionChange,
    onContentError,
  };
  return {
    ...render(<PdfReader {...props} />),
    props,
  };
}

function loadDocument(numPages = 10) {
  pdfMockState.numPages = numPages;
  fireEvent.click(screen.getByRole('button', { name: 'Загрузить PDF mock' }));
}

function renderedPages() {
  return screen.queryAllByTestId(/^rendered-page-/).map(
    (element) => Number(element.dataset.pageNumber),
  );
}

function renderPage(pageNumber) {
  fireEvent.click(screen.getByRole('button', {
    name: `Отрисовать страницу ${pageNumber}`,
  }));
}

afterEach(() => {
  cleanup();
  pdfMockState.numPages = 10;
  pdfMockState.pageProps.clear();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('PdfReader', () => {
  it('показывает loading, открывает первую страницу и ждёт render именно её', () => {
    const onPositionChange = vi.fn();
    renderPdf({ onPositionChange });

    expect(screen.getByText('Подготавливаем PDF…')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Предыдущая страница' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Следующая страница' })).toBeDisabled();

    loadDocument(10);

    expect(screen.getByText('1 / 10')).toBeInTheDocument();
    expect(renderedPages()).toEqual([1, 2, 3]);
    act(() => pdfMockState.pageProps.get(2).onRenderSuccess());
    expect(screen.getByText('Подготавливаем PDF…')).toBeInTheDocument();

    renderPage(1);
    expect(screen.queryByText('Подготавливаем PDF…')).not.toBeInTheDocument();
    expect(onPositionChange).toHaveBeenCalledWith({
      reading_location: { type: 'pdf', page: 1 },
      reading_percentage: 0,
    });
  });

  it.each([
    [{ type: 'pdf', page: 6 }, 6, [4, 5, 6, 7, 8]],
    [{ type: 'pdf', page: 99 }, 10, [8, 9, 10]],
    [{ type: 'pdf', page: -4 }, 1, [1, 2, 3]],
    [{ type: 'pdf', page: 4.8 }, 4, [2, 3, 4, 5, 6]],
    [{ type: 'pdf', page: 'не число' }, 1, [1, 2, 3]],
    [{ type: 'epub', page: 7 }, 1, [1, 2, 3]],
  ])('восстанавливает и ограничивает сохранённую позицию %j', (
    initialLocation,
    expectedPage,
    expectedWindow,
  ) => {
    renderPdf({ initialLocation });
    expect(renderedPages()).toEqual([]);

    loadDocument(10);

    expect(screen.getByText(`${expectedPage} / 10`)).toBeInTheDocument();
    expect(renderedPages()).toEqual(expectedWindow);
  });

  it('сообщает только восстановленную страницу без промежуточной позиции 1', () => {
    const onPositionChange = vi.fn();
    renderPdf({
      initialLocation: { type: 'pdf', page: 7 },
      onPositionChange,
    });
    loadDocument(10);

    act(() => pdfMockState.pageProps.get(6).onRenderSuccess());
    expect(onPositionChange).not.toHaveBeenCalled();
    renderPage(7);

    expect(onPositionChange).toHaveBeenCalledTimes(1);
    expect(onPositionChange).toHaveBeenCalledWith({
      reading_location: { type: 'pdf', page: 7 },
      reading_percentage: 66.67,
    });
  });

  it('держит в DOM не больше пяти страниц и сдвигает окно ±2', () => {
    renderPdf({ initialLocation: { type: 'pdf', page: 120 } });
    loadDocument(900);

    expect(renderedPages()).toEqual([118, 119, 120, 121, 122]);
    expect(renderedPages()).toHaveLength(5);
    fireEvent.click(screen.getByRole('button', { name: 'Следующая страница' }));

    expect(renderedPages()).toEqual([119, 120, 121, 122, 123]);
    expect(screen.queryByTestId('rendered-page-118')).not.toBeInTheDocument();
    expect(screen.getByTestId('rendered-page-123')).toBeInTheDocument();
    expect(renderedPages()).toHaveLength(5);
  });

  it('переключает окно только после завершения перемещения ползунка', () => {
    const onPositionChange = vi.fn();
    renderPdf({
      initialLocation: { type: 'pdf', page: 120 },
      onPositionChange,
    });
    loadDocument(900);
    const scrubber = screen.getByRole('slider', {
      name: 'Быстрый переход по страницам',
    });

    fireEvent.change(scrubber, { target: { value: '700' } });

    expect(scrubber).toHaveValue('700');
    expect(scrubber).toHaveAttribute('aria-valuetext', 'Страница 700 из 900');
    expect(screen.getByText('700 / 900')).toBeInTheDocument();
    expect(renderedPages()).toEqual([118, 119, 120, 121, 122]);
    expect(onPositionChange).not.toHaveBeenCalled();

    fireEvent.pointerUp(scrubber);

    expect(renderedPages()).toEqual([698, 699, 700, 701, 702]);
    expect(screen.getByLabelText('Номер страницы')).toHaveValue('700');
    renderPage(700);
    expect(onPositionChange).toHaveBeenCalledWith(expect.objectContaining({
      reading_location: { type: 'pdf', page: 700 },
    }));
  });

  it('оставляет text layer только текущей странице и скрывает preload-соседей', () => {
    vi.stubGlobal('devicePixelRatio', 4);
    renderPdf({ initialLocation: { type: 'pdf', page: 5 } });
    loadDocument(10);

    for (const pageNumber of renderedPages()) {
      const page = screen.getByTestId(`rendered-page-${pageNumber}`);
      expect(page).toHaveAttribute('data-annotation-layer', 'false');
      expect(page).toHaveAttribute('data-device-pixel-ratio', '2');
      if (pageNumber === 5) {
        expect(page).toHaveAttribute('data-text-layer', 'true');
        expect(page.closest('[data-page="5"]')).not.toHaveAttribute('aria-hidden');
      } else {
        expect(page).toHaveAttribute('data-text-layer', 'false');
        expect(page.closest(`[data-page="${pageNumber}"]`))
          .toHaveAttribute('aria-hidden', 'true');
      }
    }
  });

  it('перелистывает кнопками, соблюдает границы и сообщает прогресс', () => {
    const onPositionChange = vi.fn();
    renderPdf({ onPositionChange });
    loadDocument(5);
    renderPage(1);
    onPositionChange.mockClear();

    const previous = screen.getByRole('button', { name: 'Предыдущая страница' });
    const next = screen.getByRole('button', { name: 'Следующая страница' });
    expect(previous).toBeDisabled();
    fireEvent.click(next);
    expect(screen.getByText('2 / 5')).toBeInTheDocument();
    renderPage(2);
    expect(onPositionChange).toHaveBeenLastCalledWith({
      reading_location: { type: 'pdf', page: 2 },
      reading_percentage: 25,
    });

    fireEvent.change(screen.getByLabelText('Номер страницы'), { target: { value: '5' } });
    fireEvent.keyDown(screen.getByLabelText('Номер страницы'), { key: 'Enter' });
    expect(screen.getByText('5 / 5')).toBeInTheDocument();
    renderPage(5);
    expect(next).toBeDisabled();
    expect(onPositionChange).toHaveBeenLastCalledWith({
      reading_location: { type: 'pdf', page: 5 },
      reading_percentage: 100,
    });

    fireEvent.click(previous);
    expect(screen.getByText('4 / 5')).toBeInTheDocument();
  });

  it('считает единственную страницу прочитанной на 100%', () => {
    const onPositionChange = vi.fn();
    renderPdf({ onPositionChange });
    loadDocument(1);
    renderPage(1);

    expect(screen.getByText('1 / 1')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Предыдущая страница' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Следующая страница' })).toBeDisabled();
    expect(onPositionChange).toHaveBeenCalledWith({
      reading_location: { type: 'pdf', page: 1 },
      reading_percentage: 100,
    });
  });

  it('обрабатывает ввод только по Enter и возвращает фактическую страницу по blur', () => {
    renderPdf({ initialLocation: { type: 'pdf', page: 4 } });
    loadDocument(10);
    const input = screen.getByLabelText('Номер страницы');

    fireEvent.change(input, { target: { value: '' } });
    expect(input).toHaveValue('');
    fireEvent.blur(input);
    expect(input).toHaveValue('4');

    for (const invalidValue of ['abc', '2.5']) {
      fireEvent.change(input, { target: { value: invalidValue } });
      fireEvent.keyDown(input, { key: 'Enter' });
      expect(input).toHaveValue('4');
      expect(screen.getByText('4 / 10')).toBeInTheDocument();
    }

    fireEvent.change(input, { target: { value: '0' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(screen.getByText('1 / 10')).toBeInTheDocument();
    fireEvent.change(input, { target: { value: '200' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(screen.getByText('10 / 10')).toBeInTheDocument();
  });

  it('поддерживает клавиатурную навигацию, но не перехватывает клавиши в input', () => {
    renderPdf({ initialLocation: { type: 'pdf', page: 5 } });
    loadDocument(10);

    fireEvent.keyDown(document.body, { key: 'ArrowRight' });
    expect(screen.getByText('6 / 10')).toBeInTheDocument();
    fireEvent.keyDown(document.body, { key: 'PageDown' });
    expect(screen.getByText('7 / 10')).toBeInTheDocument();
    fireEvent.keyDown(document.body, { key: 'ArrowLeft' });
    fireEvent.keyDown(document.body, { key: 'PageUp' });
    expect(screen.getByText('5 / 10')).toBeInTheDocument();

    const input = screen.getByLabelText('Номер страницы');
    fireEvent.keyDown(input, { key: 'ArrowRight' });
    expect(screen.getByText('5 / 10')).toBeInTheDocument();
  });

  it('не сбрасывает страницу при изменении масштаба', () => {
    const onPositionChange = vi.fn();
    const view = renderPdf({
      initialLocation: { type: 'pdf', page: 6 },
      onPositionChange,
    });
    loadDocument(10);
    renderPage(6);
    onPositionChange.mockClear();

    view.rerender(<PdfReader {...view.props} scale={1.5} />);

    expect(screen.getByText('6 / 10')).toBeInTheDocument();
    expect(renderedPages()).toEqual([4, 5, 6, 7, 8]);
    expect(screen.getByTestId('rendered-page-6')).toHaveAttribute('data-scale', '1.5');
    expect(screen.getByText('Подготавливаем PDF…')).toBeInTheDocument();
    renderPage(6);
    expect(screen.queryByText('Подготавливаем PDF…')).not.toBeInTheDocument();
    expect(onPositionChange).not.toHaveBeenCalled();
  });

  it('сохраняет текущую страницу при смене contentUrl и убирает старое окно', () => {
    const onPositionChange = vi.fn();
    const view = renderPdf({
      initialLocation: { type: 'pdf', page: 6 },
      onPositionChange,
    });
    loadDocument(10);
    renderPage(6);
    fireEvent.click(screen.getByRole('button', { name: 'Следующая страница' }));
    renderPage(7);
    onPositionChange.mockClear();

    view.rerender(<PdfReader {...view.props} contentUrl="https://s3.example.test/new.pdf" />);
    expect(screen.getByTestId('document-source')).toHaveTextContent('new.pdf');
    expect(renderedPages()).toEqual([]);
    loadDocument(10);

    expect(screen.getByText('7 / 10')).toBeInTheDocument();
    expect(renderedPages()).toEqual([5, 6, 7, 8, 9]);
    renderPage(7);
    expect(onPositionChange).toHaveBeenCalledTimes(1);
    expect(onPositionChange).toHaveBeenCalledWith(expect.objectContaining({
      reading_location: { type: 'pdf', page: 7 },
    }));
  });

  it('передаёт ошибки документа и текущей страницы в onContentError', () => {
    const onContentError = vi.fn();
    renderPdf({ onContentError, initialLocation: { type: 'pdf', page: 5 } });

    fireEvent.click(screen.getByRole('button', { name: 'Ошибка документа mock' }));
    fireEvent.click(screen.getByRole('button', { name: 'Ошибка источника mock' }));
    loadDocument(10);
    fireEvent.click(screen.getByRole('button', { name: 'Ошибка render страницы 5' }));
    fireEvent.click(screen.getByRole('button', { name: 'Ошибка load страницы 5' }));

    expect(onContentError).toHaveBeenCalledTimes(4);
  });

  it('показывает ошибку preload, но игнорирует отменённый render', () => {
    const onContentError = vi.fn();
    renderPdf({ onContentError, initialLocation: { type: 'pdf', page: 5 } });
    loadDocument(10);

    act(() => pdfMockState.pageProps.get(6).onRenderError(new Error('render 6')));
    expect(screen.getByText(/Не удалось заранее подготовить/)).toBeInTheDocument();
    expect(onContentError).not.toHaveBeenCalled();

    act(() => {
      pdfMockState.pageProps.get(4).onRenderError(
        Object.assign(new Error('Rendering cancelled'), { name: 'RenderingCancelledException' }),
      );
    });
    expect(onContentError).not.toHaveBeenCalled();
  });

  it('устойчив к быстрым переходам и удаляет keyboard handler при unmount', () => {
    const removeListener = vi.spyOn(document, 'removeEventListener');
    const view = renderPdf({ initialLocation: { type: 'pdf', page: 4 } });
    loadDocument(10);
    const staleRenderSuccess = pdfMockState.pageProps.get(2).onRenderSuccess;

    const next = screen.getByRole('button', { name: 'Следующая страница' });
    fireEvent.click(next);
    fireEvent.click(next);
    fireEvent.click(next);
    expect(screen.getByText('7 / 10')).toBeInTheDocument();
    expect(renderedPages()).toEqual([5, 6, 7, 8, 9]);

    view.unmount();
    act(() => staleRenderSuccess());
    expect(removeListener).toHaveBeenCalledWith('keydown', expect.any(Function));
  });
});
