import { describe, expect, it } from 'vitest';

import {
  bookAuthorLine,
  bookDetailMetadata,
  formatBookProgress,
} from './bookPresentation.js';

describe('book presentation helpers', () => {
  it('форматирует finite reading progress и делает fallback для invalid values', () => {
    expect(formatBookProgress(25)).toBe('25%');
    expect(formatBookProgress('12.5')).toBe('12.5%');
    expect(formatBookProgress(null)).toBe('0%');
    expect(formatBookProgress('')).toBe('0%');
    expect(formatBookProgress('not-a-number')).toBe('0%');
    expect(formatBookProgress(Infinity)).toBe('0%');
  });

  it('объединяет author и year, опуская empty values', () => {
    expect(bookAuthorLine({ author: 'Автор', year: 2024 })).toBe('Автор · 2024');
    expect(bookAuthorLine({ author: 'Автор', year: null })).toBe('Автор');
    expect(bookAuthorLine({ author: '', year: 2024 })).toBe('2024');
  });

  it('маппит metadata labels, переводит язык и format в uppercase', () => {
    expect(bookDetailMetadata({
      author: 'Автор',
      year: 2024,
      publisher: '',
      language: 'ru',
      format: 'epub',
      visibility: 'private',
    })).toEqual([
      ['Автор', 'Автор'],
      ['Год', 2024],
      ['Язык', 'RU'],
      ['Формат', 'EPUB'],
      ['Видимость', 'Приватная'],
    ]);
  });
});