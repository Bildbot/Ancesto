import { FamilyTreeData, Person, RelationshipRecord, MediaItem } from '../types/genealogy';
import { EMPTY_TREE_DATA, INITIAL_DEMO_DATA } from '../data/demoFamily';

const DB_NAME = 'genealogy_heritage_db';
const DB_VERSION = 1;
const STORE_NAME = 'family_tree_store';
const TREE_KEY = 'user_tree_data';
const LOCAL_STORAGE_BACKUP_KEY = 'genealogy_user_tree_backup';

/**
 * Open or create IndexedDB instance
 */
function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      reject(new Error('IndexedDB not supported in this browser'));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Normalize legacy relationships where type is 'child' into standard 'parent'
 * where person1Id is parent and person2Id is child, and remove exact duplicates.
 */
export function normalizeTreeData(data: FamilyTreeData): FamilyTreeData {
  if (!data || !Array.isArray(data.relationships)) return data;

  const normalizedRels: RelationshipRecord[] = [];
  const existingPairSet = new Set<string>();

  data.relationships.forEach((rel) => {
    let person1Id = rel.person1Id;
    let person2Id = rel.person2Id;
    let type = rel.type;

    if (type === 'child') {
      // In legacy records, person1Id was child, person2Id was parent.
      // Normalize to standard 'parent' where person1Id is parent and person2Id is child!
      person1Id = rel.person2Id;
      person2Id = rel.person1Id;
      type = 'parent';
    } else if (type === 'adoptive-child') {
      person1Id = rel.person2Id;
      person2Id = rel.person1Id;
      type = 'adoptive-parent';
    }

    const pairKey = `${type}_${person1Id}_${person2Id}`;
    if (!existingPairSet.has(pairKey)) {
      existingPairSet.add(pairKey);
      normalizedRels.push({
        ...rel,
        person1Id,
        person2Id,
        type
      });
    }
  });

  // Collect master media archive pool
  const masterMediaMap = new Map<string, MediaItem>();
  if (Array.isArray(data.mediaArchive)) {
    data.mediaArchive.forEach((m) => masterMediaMap.set(m.id, m));
  }
  if (Array.isArray(data.persons)) {
    data.persons.forEach((p) => {
      if (Array.isArray(p.mediaFiles)) {
        p.mediaFiles.forEach((m) => {
          if (!masterMediaMap.has(m.id)) {
            masterMediaMap.set(m.id, m);
          }
        });
      }
    });
  }

  return {
    ...data,
    relationships: normalizedRels,
    mediaArchive: Array.from(masterMediaMap.values())
  };
}

/**
 * Load tree data from IndexedDB or LocalStorage fallback
 */
export async function loadFamilyTree(): Promise<FamilyTreeData> {
  try {
    const db = await openDatabase();
    return new Promise((resolve) => {
      const transaction = db.transaction(STORE_NAME, 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const getRequest = store.get(TREE_KEY);

      getRequest.onsuccess = () => {
        if (getRequest.result && Array.isArray(getRequest.result.persons)) {
          const normalized = normalizeTreeData(getRequest.result);
          resolve(normalized);
        } else {
          // Check LocalStorage fallback
          const localData = getLocalStorageFallback();
          if (localData && Array.isArray(localData.persons)) {
            const normalized = normalizeTreeData(localData);
            saveFamilyTree(normalized);
            resolve(normalized);
          } else {
            // Initialize with empty clean tree
            saveFamilyTree(EMPTY_TREE_DATA);
            resolve(EMPTY_TREE_DATA);
          }
        }
      };

      getRequest.onerror = () => {
        const localData = getLocalStorageFallback();
        resolve(localData ? normalizeTreeData(localData) : EMPTY_TREE_DATA);
      };
    });
  } catch (error) {
    console.warn('IndexedDB failed, using localStorage:', error);
    const localData = getLocalStorageFallback();
    return localData ? normalizeTreeData(localData) : EMPTY_TREE_DATA;
  }
}

/**
 * Save current tree data to IndexedDB + LocalStorage sync
 */
export async function saveFamilyTree(data: FamilyTreeData): Promise<void> {
  const updatedData: FamilyTreeData = {
    ...data,
    lastModified: Date.now()
  };

  // Always attempt LocalStorage backup (ignoring quota errors if media too large)
  try {
    localStorage.setItem(LOCAL_STORAGE_BACKUP_KEY, JSON.stringify(updatedData));
  } catch (e) {
    // If media is very large, try saving without heavy media dataUrls in LocalStorage as fallback
    try {
      const strippedData = {
        ...updatedData,
        persons: updatedData.persons.map(p => ({
          ...p,
          mediaFiles: p.mediaFiles.map(m => ({
            ...m,
            dataUrl: m.dataUrl.length > 50000 ? '' : m.dataUrl
          }))
        }))
      };
      localStorage.setItem(LOCAL_STORAGE_BACKUP_KEY, JSON.stringify(strippedData));
    } catch {
      // LocalStorage full, ignore since IndexedDB handles hundreds of megabytes
    }
  }

  // Save to IndexedDB
  try {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const putRequest = store.put(updatedData, TREE_KEY);

      putRequest.onsuccess = () => resolve();
      putRequest.onerror = () => reject(putRequest.error);
    });
  } catch (error) {
    console.error('Failed to save in IndexedDB:', error);
  }
}

function getLocalStorageFallback(): FamilyTreeData | null {
  try {
    const item = localStorage.getItem(LOCAL_STORAGE_BACKUP_KEY);
    if (item) {
      const parsed = JSON.parse(item);
      if (parsed && Array.isArray(parsed.persons)) {
        return parsed;
      }
    }
  } catch {
    // ignore
  }
  return null;
}

/**
 * Export tree data as downloadable JSON backup file
 */
export function exportTreeAsJson(data: FamilyTreeData): void {
  const jsonStr = JSON.stringify(data, null, 2);
  const blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  const safeName = (data.treeName || 'родословное_древо').replace(/[^a-zA-Zа-яА-Я0-9_-]/g, '_');
  const dateStr = new Date().toISOString().slice(0, 10);
  link.href = url;
  link.download = `${safeName}_${dateStr}.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Export tree data to standard GEDCOM 5.5 format
 */
export function exportTreeAsGedcom(data: FamilyTreeData): void {
  const lines: string[] = [
    '0 HEAD',
    '1 SOUR RODOSLOVNAYA',
    '2 NAME Родословная',
    '2 VERS 1.0',
    '1 GEDC',
    '2 VERS 5.5.1',
    '2 FORM LINEAGE-LINKED',
    '1 CHAR UTF-8',
    '1 DATE ' + new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).toUpperCase(),
  ];

  // Map persons to INDI records
  for (const person of data.persons) {
    lines.push(`0 @I${person.id.replace(/[^a-zA-Z0-9]/g, '')}@ INDI`);
    const surname = person.lastName ? `/${person.lastName}/` : '';
    const given = [person.firstName, person.patronymic].filter(Boolean).join(' ');
    lines.push(`1 NAME ${given} ${surname}`.trim());
    if (person.maidenName) {
      lines.push(`2 _MARNM ${person.maidenName}`);
    }
    lines.push(`1 SEX ${person.gender === 'female' ? 'F' : person.gender === 'male' ? 'M' : 'U'}`);
    
    if (person.birthDate || person.birthPlace) {
      lines.push('1 BIRT');
      if (person.birthDate) lines.push(`2 DATE ${person.birthDate}`);
      if (person.birthPlace) lines.push(`2 PLAC ${person.birthPlace}`);
    }

    if (person.isDeceased) {
      lines.push('1 DEAT');
      if (person.deathDate) lines.push(`2 DATE ${person.deathDate}`);
      if (person.deathPlace) lines.push(`2 PLAC ${person.deathPlace}`);
    }

    if (person.occupation) {
      lines.push(`1 OCCU ${person.occupation}`);
    }

    if (person.bio) {
      lines.push(`1 NOTE ${person.bio.replace(/\n/g, ' ')}`);
    }
  }

  lines.push('0 TRLR');

  const gedcomContent = lines.join('\n');
  const blob = new Blob([gedcomContent], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  const safeName = (data.treeName || 'родословное_древо').replace(/[^a-zA-Zа-яА-Я0-9_-]/g, '_');
  link.href = url;
  link.download = `${safeName}.ged`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Validate imported JSON data
 */
export function validateImportedData(raw: unknown): FamilyTreeData | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  if (!Array.isArray(obj.persons) || !Array.isArray(obj.relationships)) return null;

  const validData: FamilyTreeData = {
    treeName: typeof obj.treeName === 'string' ? obj.treeName : 'Моя родословная',
    description: typeof obj.description === 'string' ? obj.description : '',
    persons: obj.persons as Person[],
    relationships: obj.relationships as RelationshipRecord[],
    mediaArchive: Array.isArray(obj.mediaArchive) ? (obj.mediaArchive as MediaItem[]) : [],
    version: 1,
    lastModified: Date.now()
  };

  return normalizeTreeData(validData);
}
