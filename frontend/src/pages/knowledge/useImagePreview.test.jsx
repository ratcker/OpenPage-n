import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import useImagePreview from './useImagePreview.js';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('useImagePreview', () => {
  it('читает selected file как data URL и очищает preview при удалении', async () => {
    const file = new File(['image-bytes'], 'cover.png', { type: 'image/png' });
    const { result, rerender } = renderHook(({ selectedFile }) => useImagePreview(selectedFile), {
      initialProps: { selectedFile: file },
    });

    await waitFor(() => expect(result.current).toMatch(/^data:image\/png;base64,/));
    rerender({ selectedFile: null });
    await waitFor(() => expect(result.current).toBe(''));
  });

  it('прерывает in-flight FileReader при изменении selected file', () => {
    const readers = [];
    class ControlledFileReader {
      static EMPTY = 0;
      static LOADING = 1;
      static DONE = 2;

      constructor() {
        this.readyState = ControlledFileReader.EMPTY;
        this.result = null;
        this.aborted = false;
        readers.push(this);
      }

      readAsDataURL() {
        this.readyState = ControlledFileReader.LOADING;
      }

      abort() {
        this.aborted = true;
        this.readyState = ControlledFileReader.DONE;
      }
    }
    vi.stubGlobal('FileReader', ControlledFileReader);
    const first = new File(['first'], 'first.png');
    const second = new File(['second'], 'second.png');
    const { rerender } = renderHook(({ selectedFile }) => useImagePreview(selectedFile), {
      initialProps: { selectedFile: first },
    });

    rerender({ selectedFile: second });

    expect(readers).toHaveLength(2);
    expect(readers[0].aborted).toBe(true);
    expect(readers[1].readyState).toBe(ControlledFileReader.LOADING);
  });
});