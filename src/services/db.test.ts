import { afterEach, describe, expect, it, vi } from 'vitest';
import { createGedcomContent, formatGedcomDate, importTreeFromGedcom, loadFamilyTree, normalizeTreeData, saveFamilyTree, validateImportedData } from './db';
import type { FamilyTreeData, Person } from '../types/genealogy';
import { INITIAL_DEMO_DATA } from '../data/demoFamily';

const treeData: FamilyTreeData = {
  treeName: 'Тестовое древо',
  description: '',
  persons: [],
  relationships: [],
  mediaArchive: [],
  lastModified: 1,
  version: 1,
};

function validPerson(id: string): Person {
  return {
    id,
    firstName: 'Иван',
    lastName: 'Тестов',
    gender: 'male',
    isDeceased: false,
    bio: '',
    significantDates: [],
    mediaFiles: [],
    tags: [],
    createdAt: 1,
    updatedAt: 1,
  };
}

const originalWindow = globalThis.window;
const originalIndexedDb = globalThis.indexedDB;
const originalLocalStorage = globalThis.localStorage;

afterEach(() => {
  vi.restoreAllMocks();
  Object.defineProperty(globalThis, 'window', { configurable: true, value: originalWindow });
  Object.defineProperty(globalThis, 'indexedDB', { configurable: true, value: originalIndexedDb });
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: originalLocalStorage });
});

describe('BackupService contract', () => {
  it('exports deterministic GEDCOM families, links, adoption and valid dates', () => {
    const persons = [
      { ...validPerson('father'), firstName: 'Иван', birthDate: '1900-03-12' },
      { ...validPerson('mother'), firstName: 'Анна', gender: 'female' as const },
      { ...validPerson('child'), firstName: 'Пётр', birthDate: '1925-03' },
      { ...validPerson('second-wife'), firstName: 'Мария', gender: 'female' as const },
    ];
    const data: FamilyTreeData = {
      ...treeData,
      persons,
      relationships: [
        { id: 'm1', person1Id: 'father', person2Id: 'mother', type: 'marriage', startDate: '1920-01-02' },
        { id: 'm2', person1Id: 'father', person2Id: 'second-wife', type: 'marriage' },
        { id: 'birth-parent', person1Id: 'father', person2Id: 'child', type: 'parent' },
        { id: 'adopt', person1Id: 'mother', person2Id: 'child', type: 'adoptive-parent' },
      ],
    };
    const gedcom = createGedcomContent(data, new Date('2024-02-03T00:00:00Z'));
    expect(gedcom).toContain('2 VERS 5.5.1');
    expect(gedcom).toContain('2 DATE 12 MAR 1900');
    expect(gedcom).toContain('2 DATE MAR 1925');
    expect(gedcom).toContain('1 MARR\n2 DATE 2 JAN 1920');
    expect(gedcom.match(/ INDI/g)).toHaveLength(4);
    expect(gedcom.match(/ FAM\n/g)).toHaveLength(2);
    expect(gedcom).toContain('1 FAMS @F');
    expect(gedcom).toContain('1 FAMC @F');
    expect(gedcom).toContain('2 PEDI adopted');
    expect(createGedcomContent(data, new Date('2024-02-03T00:00:00Z'))).toBe(gedcom);
    const imported = importTreeFromGedcom(gedcom);
    expect(imported?.persons).toHaveLength(4);
    expect(imported?.relationships).toContainEqual(expect.objectContaining({ type: 'adoptive-parent' }));
    expect(formatGedcomDate('1900-03-12')).toBe('12 MAR 1900');
    expect(formatGedcomDate('1900-03')).toBe('MAR 1900');
  });

  it('imports GEDCOM people, dates, notes and family relationships', () => {
    const imported = importTreeFromGedcom([
      '0 HEAD',
      '1 CHAR UTF-8',
      '0 @I1@ INDI',
      '1 NAME Иван /Иванов/',
      '1 SEX M',
      '1 BIRT',
      '2 DATE 12 MAR 1900',
      '2 PLAC Москва',
      '1 NOTE Первая строка',
      '2 CONT Вторая строка',
      '0 @I2@ INDI',
      '1 NAME Анна /Петрова/',
      '1 SEX F',
      '0 @I3@ INDI',
      '1 NAME Пётр /Иванов/',
      '0 @F1@ FAM',
      '1 HUSB @I1@',
      '1 WIFE @I2@',
      '1 CHIL @I3@',
      '0 TRLR',
    ].join('\n'), 'family.ged');

    expect(imported?.persons).toHaveLength(3);
    expect(imported?.persons[0]).toMatchObject({ firstName: 'Иван', lastName: 'Иванов', birthDate: '1900-03-12', birthPlace: 'Москва', bio: 'Первая строка\nВторая строка' });
    expect(imported?.relationships.map(({ type }) => type)).toEqual(['marriage', 'parent', 'parent']);
    expect(imported?.treeName).toBe('family');
  });

  it('returns null for GEDCOM without individual records', () => {
    expect(importTreeFromGedcom('0 HEAD\n1 SOUR Unknown\n0 TRLR')).toBeNull();
  });

  it('normalizes legacy spouse records into one marriage and preserves an unknown end as ended', () => {
    const normalized = normalizeTreeData({
      ...treeData,
      persons: [validPerson('person-1'), validPerson('person-2')],
      relationships: [
        { id: 'current-record', person1Id: 'person-1', person2Id: 'person-2', type: 'spouse', startDate: '1950' },
        { id: 'former-record', person1Id: 'person-2', person2Id: 'person-1', type: 'former-spouse', startDate: '1950' },
      ],
    });

    expect(normalized.relationships).toHaveLength(1);
    expect(normalized.relationships[0]).toMatchObject({
      type: 'marriage',
      startDate: '1950',
      endDateUnknown: true,
    });
  });

  it('keeps unknown marriage start and distinguishes an ongoing marriage from unknown end', () => {
    const normalized = normalizeTreeData({
      ...treeData,
      persons: [validPerson('person-1'), validPerson('person-2')],
      relationships: [{ id: 'marriage', person1Id: 'person-1', person2Id: 'person-2', type: 'marriage' }],
    });

    expect(normalized.relationships[0]).toMatchObject({
      type: 'marriage',
      startDateUnknown: true,
    });
    expect(normalized.relationships[0].endDateUnknown).toBeUndefined();
  });

  it('rejects a backup containing malformed people before it can replace current data', () => {
    const malformedBackup = {
      treeName: 'Повреждённый архив',
      persons: [{ id: 42 }],
      relationships: [],
    };

    expect(validateImportedData(malformedBackup)).toBeNull();
  });

  it('rejects a backup containing a relationship to a missing person', () => {
    const danglingRelationshipBackup = {
      treeName: 'Повреждённый архив',
      persons: [validPerson('person-1')],
      relationships: [{
        id: 'relationship-1',
        person1Id: 'person-1',
        person2Id: 'missing-person',
        type: 'spouse',
      }],
    };

    expect(validateImportedData(danglingRelationshipBackup)).toBeNull();
  });

  it('rejects a backup containing duplicate person identifiers', () => {
    const duplicatePeopleBackup = {
      treeName: 'Повреждённый архив',
      persons: [validPerson('person-1'), validPerson('person-1')],
      relationships: [],
    };

    expect(validateImportedData(duplicatePeopleBackup)).toBeNull();
  });

  it('rejects a backup containing malformed media', () => {
    const malformedMediaBackup = {
      treeName: 'Повреждённый архив',
      persons: [],
      relationships: [],
      mediaArchive: [{
        id: 'media-1',
        type: 'photo',
        name: 'Семейное фото',
        dataUrl: 42,
      }],
    };

    expect(validateImportedData(malformedMediaBackup)).toBeNull();
  });

  it('rejects a person missing required profile fields', () => {
    const { firstName: _firstName, ...personWithoutFirstName } = validPerson('person-1');
    const backup = {
      treeName: 'Повреждённый архив',
      persons: [personWithoutFirstName],
      relationships: [],
    };

    expect(validateImportedData(backup)).toBeNull();
  });

  it('rejects malformed media nested in a person record', () => {
    const backup = {
      treeName: 'Повреждённый архив',
      persons: [{
        ...validPerson('person-1'),
        mediaFiles: [{ id: 'media-1', type: 'unknown', name: 'Файл', dataUrl: 'data:text/plain;base64,WA==' }],
      }],
      relationships: [],
    };

    expect(validateImportedData(backup)).toBeNull();
  });

  it.each(['https://example.com/track.png', 'http://127.0.0.1/private', 'file:///etc/passwd', 'blob:https://example.com/id', 'javascript:alert(1)'])(
    'rejects non-local media URL %s', (dataUrl) => {
      expect(validateImportedData({ ...treeData, mediaArchive: [{ id: 'm', type: 'photo', name: 'photo.png', dataUrl }] })).toBeNull();
    },
  );

  it('accepts a correctly signed local image payload', () => {
    const backup = { ...treeData, mediaArchive: [{ id: 'm', type: 'photo', name: 'photo.png', mimeType: 'image/png', dataUrl: 'data:image/png;base64,iVBORw0KGgo=' }] };
    expect(validateImportedData(backup)).not.toBeNull();
  });

  it('rejects MIME, extension and media category mismatches', () => {
    const dataUrl = 'data:image/png;base64,iVBORw0KGgo=';
    expect(validateImportedData({ ...treeData, mediaArchive: [{ id: 'm', type: 'photo', name: 'photo.jpg', dataUrl }] })).toBeNull();
    expect(validateImportedData({ ...treeData, mediaArchive: [{ id: 'm', type: 'photo', name: 'photo.png', mimeType: 'image/jpeg', dataUrl }] })).toBeNull();
    expect(validateImportedData({ ...treeData, mediaArchive: [{ id: 'm', type: 'document', name: 'doc.pdf', dataUrl }] })).toBeNull();
  });

  it('rejects SVG active content and external resource references', () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>';
    const dataUrl = `data:image/svg+xml,${encodeURIComponent(svg)}`;
    expect(validateImportedData({ ...treeData, mediaArchive: [{ id: 'm', type: 'photo', name: 'portrait', dataUrl }] })).toBeNull();
  });

  it('rejects relationships with unsupported types', () => {
    const backup = {
      treeName: 'Повреждённый архив',
      persons: [validPerson('person-1'), validPerson('person-2')],
      relationships: [{
        id: 'relationship-1',
        person1Id: 'person-1',
        person2Id: 'person-2',
        type: 'colleague',
      }],
    };

    expect(validateImportedData(backup)).toBeNull();
  });

  it('accepts a complete current-format backup', () => {
    const backup = {
      treeName: 'Полный архив',
      description: '',
      version: 1,
      lastModified: 1,
      persons: [validPerson('person-1')],
      relationships: [],
      mediaArchive: [],
    };

    expect(validateImportedData(backup)).not.toBeNull();
  });

  it('accepts persisted face review decisions and scan state', () => {
    const backup = {
      treeName: 'Архив с результатами распознавания',
      version: 1,
      lastModified: 1,
      persons: [],
      relationships: [],
      mediaArchive: [{
        id: 'photo-1',
        type: 'photo',
        name: 'Портрет',
        dataUrl: 'data:image/jpeg;base64,/9j/AA==',
        faceScanComplete: true,
        faces: [{
          id: 'face-1',
          mediaId: 'photo-1',
          box: { x: 10, y: 10, width: 20, height: 20 },
          descriptor: Array(128).fill(0),
          rejectedPersonIds: ['person-1'],
          isConfirmed: false,
        }],
      }],
    };

    expect(validateImportedData(backup)).not.toBeNull();
  });

  it('accepts the bundled demonstration archive', () => {
    expect(validateImportedData(INITIAL_DEMO_DATA)).not.toBeNull();
  });
});

describe('TreeRepository contract', () => {
  it('propagates an IndexedDB write failure to its caller', async () => {
    const transaction: { objectStore: () => { put: () => void }; onabort?: (event: Event) => void; error: Error } = {
      objectStore: () => ({ put: () => undefined }),
      error: new Error('IndexedDB write failed'),
    };
    const database = {
      close: vi.fn(),
      transaction: () => transaction,
    } as unknown as IDBDatabase;
    const openRequest = {} as IDBOpenDBRequest;

    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: { setItem: vi.fn() },
    });
    Object.defineProperty(globalThis, 'indexedDB', {
      configurable: true,
      value: {
        open: () => {
          queueMicrotask(() => {
            openRequest.onsuccess?.(new Event('success'));
            setTimeout(() => transaction.onabort?.(new Event('abort')), 0);
          });
          Object.defineProperty(openRequest, 'result', { configurable: true, value: database });
          return openRequest;
        },
      },
    });
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: { indexedDB: globalThis.indexedDB },
    });

    await expect(saveFamilyTree(treeData)).rejects.toBeDefined();
  });

  it('serializes writes so a later tree snapshot cannot finish first', async () => {
    const transactions: Array<{ oncomplete?: (event: Event) => void }> = [];
    const database = {
      close: vi.fn(),
      transaction: () => {
        const transaction: { oncomplete?: (event: Event) => void; objectStore: () => { put: () => void } } = {
          objectStore: () => ({ put: () => undefined }),
        };
        transactions.push(transaction);
        return transaction;
      },
    } as unknown as IDBDatabase;

    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: { setItem: vi.fn() },
    });
    Object.defineProperty(globalThis, 'indexedDB', {
      configurable: true,
      value: {
        open: () => {
          const request = {} as IDBOpenDBRequest;
          Object.defineProperty(request, 'result', { configurable: true, value: database });
          queueMicrotask(() => request.onsuccess?.(new Event('success')));
          return request;
        },
      },
    });
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: { indexedDB: globalThis.indexedDB },
    });

    const firstSave = saveFamilyTree({ ...treeData, description: 'первая версия' });
    const secondSave = saveFamilyTree({ ...treeData, description: 'вторая версия' });
    await new Promise<void>((resolve) => setTimeout(resolve, 0));

    expect(transactions).toHaveLength(1);
    transactions[0].oncomplete?.(new Event('complete'));
    await new Promise<void>((resolve) => setTimeout(resolve, 0));

    expect(transactions).toHaveLength(2);
    transactions[1].oncomplete?.(new Event('complete'));
    await expect(Promise.all([firstSave, secondSave])).resolves.toEqual([undefined, undefined]);
  });

  it('does not resolve on put success when the transaction later aborts', async () => {
    const transaction: { objectStore: () => { put: () => IDBRequest<IDBValidKey> }; onabort?: (event: Event) => void; error: Error } = {
      objectStore: () => ({ put: () => ({ onsuccess: null } as unknown as IDBRequest<IDBValidKey>) }),
      error: new Error('aborted after put'),
    };
    const db = { transaction: () => transaction, close: vi.fn() } as unknown as IDBDatabase;
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { setItem: vi.fn() } });
    Object.defineProperty(globalThis, 'indexedDB', { configurable: true, value: { open: () => { const r = {} as IDBOpenDBRequest; Object.defineProperty(r, 'result', { value: db }); queueMicrotask(() => r.onsuccess?.(new Event('success'))); return r; } } });
    Object.defineProperty(globalThis, 'window', { configurable: true, value: { indexedDB: globalThis.indexedDB } });
    const saving = saveFamilyTree(treeData);
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    transaction.onabort?.(new Event('abort'));
    await expect(saving).rejects.toThrow('aborted after put');
    expect(db.close).toHaveBeenCalledOnce();
  });

  it('writes a payload-free localStorage backup after IndexedDB commit and tolerates quota errors', async () => {
    const transaction: { objectStore: () => { put: (data: FamilyTreeData) => void }; oncomplete?: (event: Event) => void } = {
      objectStore: () => ({ put: () => undefined }),
    };
    const db = { transaction: () => transaction, close: vi.fn() } as unknown as IDBDatabase;
    const setItem = vi.fn(() => { throw new DOMException('quota', 'QuotaExceededError'); });
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { setItem } });
    Object.defineProperty(globalThis, 'indexedDB', { configurable: true, value: { open: () => { const r = {} as IDBOpenDBRequest; Object.defineProperty(r, 'result', { value: db }); queueMicrotask(() => r.onsuccess?.(new Event('success'))); return r; } } });
    Object.defineProperty(globalThis, 'window', { configurable: true, value: { indexedDB: globalThis.indexedDB } });
    const saving = saveFamilyTree({ ...treeData, mediaArchive: [{ id: 'm', type: 'photo', name: 'image', dataUrl: `data:image/png;base64,${'A'.repeat(100000)}` }] });
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    transaction.oncomplete?.(new Event('complete'));
    await expect(saving).resolves.toBeUndefined();
    expect(setItem).toHaveBeenCalledOnce();
    expect(db.close).toHaveBeenCalledOnce();
  });

  it('rejects corrupt IndexedDB data without replacing it', async () => {
    const transaction = { objectStore: () => ({ get: () => { const request = {} as IDBRequest; Object.defineProperty(request, 'result', { value: { persons: [{ id: 'bad' }] } }); queueMicrotask(() => request.onsuccess?.(new Event('success'))); return request; } }) };
    const db = { transaction: () => transaction, close: vi.fn() } as unknown as IDBDatabase;
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: vi.fn(() => null), setItem: vi.fn() } });
    Object.defineProperty(globalThis, 'indexedDB', { configurable: true, value: { open: () => { const r = {} as IDBOpenDBRequest; Object.defineProperty(r, 'result', { value: db }); queueMicrotask(() => r.onsuccess?.(new Event('success'))); return r; } } });
    Object.defineProperty(globalThis, 'window', { configurable: true, value: { indexedDB: globalThis.indexedDB } });
    await expect(loadFamilyTree()).rejects.toThrow('повреждён');
    expect(globalThis.localStorage.setItem).not.toHaveBeenCalled();
  });

  it('rejects corrupt localStorage fallback without rewriting it', async () => {
    const original = JSON.stringify({ treeName: 'damaged', persons: [{ id: 'broken' }], relationships: [] });
    const setItem = vi.fn();
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: () => original, setItem } });
    Object.defineProperty(globalThis, 'indexedDB', { configurable: true, value: { open: () => { const request = {} as IDBOpenDBRequest; queueMicrotask(() => request.onerror?.(new Event('error'))); return request; } } });
    Object.defineProperty(globalThis, 'window', { configurable: true, value: { indexedDB: globalThis.indexedDB } });
    await expect(loadFamilyTree()).rejects.toThrow();
    expect(setItem).not.toHaveBeenCalled();
    expect(globalThis.localStorage.getItem('genealogy_user_tree_backup')).toBe(original);
  });
});
