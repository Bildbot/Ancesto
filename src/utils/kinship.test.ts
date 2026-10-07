import { describe, expect, it } from 'vitest';
import type { Person } from '../types/genealogy';
import { formatFullName } from './kinship';

function person(overrides: Partial<Person> = {}): Person {
  return {
    id: 'person-1',
    firstName: 'Иван',
    lastName: 'Иванов',
    gender: 'male',
    isDeceased: false,
    bio: '',
    significantDates: [],
    mediaFiles: [],
    tags: [],
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

describe('full name formatting', () => {
  it('puts surname first when the patronymic is present', () => {
    expect(formatFullName(person({ patronymic: 'Иванович' }))).toBe('Иванов Иван Иванович');
  });

  it('keeps first name before surname when there is no patronymic', () => {
    expect(formatFullName(person())).toBe('Иван Иванов');
    expect(formatFullName(person(), { format: 'short' })).toBe('Иван Иванов');
  });

  it('uses the same ordering for both full-name display modes', () => {
    const value = person({ patronymic: 'Иванович' });
    expect(formatFullName(value, { format: 'natural' })).toBe('Иванов Иван Иванович');
    expect(formatFullName(value, { format: 'formal' })).toBe('Иванов Иван Иванович');
    expect(formatFullName(value, { format: 'short' })).toBe('Иванов И.И.');
  });
});
