import {
  cleanup,
  render,
  waitFor,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import EpubReader from './EpubReader.jsx';

const epubMocks = vi.hoisted(() => ({
  create: vi.fn(),
  handlers: {},
  rendition: null,
  book: null,
}));

vi.mock('epubjs', () => ({
  default: epubMocks.create,
}));

beforeEach(() => {
  epubMocks.create.mockReset();
  epubMocks.handlers = {};
  epubMocks.rendition = {
    themes: { fontSize: vi.fn() },
    on: vi.fn((event, handler) => { epubMocks.handlers[event] = handler; }),
    off: vi.fn(),
    display: vi.fn(() => Promise.resolve()),
    destroy: vi.fn(),
  };
  epubMocks.book = {
    ready: Promise.resolve(),
    locations: {
      generate: vi.fn(() => Promise.resolve()),
      length: vi.fn(() => 12),
      percentageFromCfi: vi.fn(() => 0.4215),
    },
    renderTo: vi.fn(() => epubMocks.rendition),
    on: vi.fn((event, handler) => { epubMocks.handlers[event] = handler; }),
    off: vi.fn(),
    destroy: vi.fn(),
  };
  epubMocks.create.mockReturnValue(epubMocks.book);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('EpubReader', () => {
  it('создаёт continuous reader, восстанавливает CFI и обновляет font size', async () => {
    const onPositionChange = vi.fn();
    const initialLocation = {
      type: 'epub',
      location: 'epubcfi(/6/4!/4/2)',
    };
    const props = {
      contentUrl: 'https://s3.example.test/book.epub',
      initialLocation,
      fontSize: 100,
      onPositionChange,
      onContentError: vi.fn(),
    };
    const view = render(<EpubReader {...props} />);

    await waitFor(() => {
      expect(epubMocks.rendition.display).toHaveBeenCalledWith(initialLocation.location);
    });
    expect(epubMocks.create).toHaveBeenCalledWith(props.contentUrl);
    expect(epubMocks.book.renderTo).toHaveBeenCalledWith(expect.any(HTMLElement), {
      manager: 'continuous',
      flow: 'scrolled',
      width: '100%',
      height: '100%',
    });
    expect(epubMocks.book.locations.generate).toHaveBeenCalledWith(1600);

    epubMocks.handlers.relocated({ start: { cfi: 'epubcfi(/6/8!/4/2)' } });
    expect(onPositionChange).toHaveBeenCalledWith({
      reading_location: { type: 'epub', location: 'epubcfi(/6/8!/4/2)' },
      reading_percentage: 42.15,
    });

    view.rerender(<EpubReader {...props} fontSize={110} />);
    expect(epubMocks.rendition.themes.fontSize).toHaveBeenLastCalledWith('110%');
    expect(epubMocks.create).toHaveBeenCalledTimes(1);
  });

  it('передаёт display error и освобождает book с rendition', async () => {
    const onContentError = vi.fn();
    const view = render(
      <EpubReader
        contentUrl="https://s3.example.test/book.epub"
        initialLocation={null}
        fontSize={100}
        onPositionChange={vi.fn()}
        onContentError={onContentError}
      />,
    );
    await waitFor(() => expect(epubMocks.rendition.display).toHaveBeenCalled());

    epubMocks.handlers.displayerror(new Error('expired'));
    expect(onContentError).toHaveBeenCalledTimes(1);

    view.unmount();
    expect(epubMocks.rendition.destroy).toHaveBeenCalledTimes(1);
    expect(epubMocks.book.destroy).toHaveBeenCalledTimes(1);
  });
});
