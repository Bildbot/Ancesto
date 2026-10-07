import { afterEach, describe, expect, it, vi } from 'vitest';
import { normalizeTreeData, saveFamilyTree, validateImportedData } from './db';
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
        dataUrl: 'data:image/jpeg;base64,AA==',
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
    const putRequest = {} as IDBRequest<IDBValidKey>;
    Object.defineProperty(putRequest, 'error', {
      configurable: true,
      value: new Error('IndexedDB write failed'),
    });
    const database = {
      transaction: () => ({
        objectStore: () => ({
          put: () => {
            queueMicrotask(() => putRequest.onerror?.(new Event('error')));
            return putRequest;
          },
        }),
      }),
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
          queueMicrotask(() => openRequest.onsuccess?.(new Event('success')));
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
    const putRequests: IDBRequest<IDBValidKey>[] = [];
    const database = {
      transaction: () => ({
        objectStore: () => ({
          put: () => {
            const request = {} as IDBRequest<IDBValidKey>;
            putRequests.push(request);
            return request;
          },
        }),
      }),
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
    await new Promise<void>((resolve) => queueMicrotask(resolve));
    await new Promise<void>((resolve) => queueMicrotask(resolve));

    expect(putRequests).toHaveLength(1);
    putRequests[0].onsuccess?.(new Event('success'));
    await new Promise<void>((resolve) => setTimeout(resolve, 0));

    expect(putRequests).toHaveLength(2);
    putRequests[1].onsuccess?.(new Event('success'));
    await expect(Promise.all([firstSave, secondSave])).resolves.toEqual([undefined, undefined]);
  });
});
