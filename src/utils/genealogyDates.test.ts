import { describe, expect, it } from 'vitest';
import { compareGenealogyDates, getGenderPresentation, parseGenealogyDate } from './kinship';

describe('genealogy date parsing and ordering', () => {
  it('orders full dates chronologically regardless of display format', () => {
    const dates = ['02.01.1900', '1899-12-31', '1900-01-01', '15.06.1899'];
    expect([...dates].sort(compareGenealogyDates)).toEqual(['15.06.1899', '1899-12-31', '1900-01-01', '02.01.1900']);
  });

  it('accepts year and month precision and treats them as the start of the period', () => {
    expect(parseGenealogyDate('1902')).toEqual({ timestamp: Date.UTC(1902, 0, 1), precision: 'year' });
    expect(parseGenealogyDate('1902-03')).toEqual({ timestamp: Date.UTC(1902, 2, 1), precision: 'month' });
    expect(parseGenealogyDate('03.1902')).toEqual({ timestamp: Date.UTC(1902, 2, 1), precision: 'month' });
    expect(parseGenealogyDate('31.02.1902')).toBeNull();
  });

  it('puts unknown dates last and treats two unknown dates as tied', () => {
    expect(compareGenealogyDates(undefined, '1900')).toBeGreaterThan(0);
    expect(compareGenealogyDates('not a date', undefined)).toBe(0);
  });
});

describe('gender presentation', () => {
  it.each([
    ['male', '♂', 'Мужчина'],
    ['female', '♀', 'Женщина'],
    ['other', '⚧', 'Другой пол'],
    [undefined, '○', 'Пол не указан'],
    ['unsupported', '○', 'Пол не указан'],
  ])('provides an accessible distinct presentation for %s', (gender, symbol, label) => {
    expect(getGenderPresentation(gender)).toEqual({ symbol, label });
  });
});
