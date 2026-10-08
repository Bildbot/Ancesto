import { FamilyTreeData, Person, RelationshipRecord, MediaItem } from '../types/genealogy';
import { EMPTY_TREE_DATA, INITIAL_DEMO_DATA } from '../data/demoFamily';
import { isTauriDesktop, loadNativeTree, saveNativeTree } from './nativeTreeRepository';

const DB_NAME = 'genealogy_heritage_db';
const DB_VERSION = 1;
const STORE_NAME = 'family_tree_store';
const TREE_KEY = 'user_tree_data';
const LOCAL_STORAGE_BACKUP_KEY = 'genealogy_user_tree_backup';
let saveQueue: Promise<void> = Promise.resolve();

const MEDIA_TYPES = new Set(['photo', 'document', 'video', 'audio']);
const GENDERS = new Set(['male', 'female', 'other']);
const RELATIONSHIP_TYPES = new Set([
  'parent',
  'child',
  'marriage',
  'spouse',
  'former-spouse',
  'sibling',
  'adoptive-parent',
  'adoptive-child',
  'godparent',
  'godchild',
  'custom',
]);

const MEDIA_MIME_BY_EXTENSION: Record<string, string> = {
  pdf: 'application/pdf', doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  txt: 'text/plain', mp3: 'audio/mpeg', ogg: 'audio/ogg', wav: 'audio/wav',
  gif: 'image/gif', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp',
  mp4: 'video/mp4', webm: 'video/webm',
};

function decodeDataUrl(dataUrl: string): { mime: string; bytes: Uint8Array } | null {
  const match = dataUrl.match(/^data:([^;,]+)?((?:;[^,]*)*),(.*)$/is);
  if (!match) return null;
  const mime = (match[1] || 'text/plain').toLowerCase();
  const metadata = match[2] || '';
  try {
    const bytes = /;base64(?:;|$)/i.test(metadata)
      ? Uint8Array.from(atob(match[3].replace(/\s/g, '')), (char) => char.charCodeAt(0))
      : new TextEncoder().encode(decodeURIComponent(match[3]));
    return { mime, bytes };
  } catch {
    return null;
  }
}

function hasValidMediaSignature(mime: string, bytes: Uint8Array): boolean {
  const starts = (...values: number[]) => values.every((value, index) => bytes[index] === value);
  const ascii = (start: number, length: number) => String.fromCharCode(...bytes.slice(start, start + length));
  switch (mime) {
    case 'image/png': return starts(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);
    case 'image/jpeg': return starts(0xff, 0xd8, 0xff);
    case 'image/gif': return ascii(0, 3) === 'GIF';
    case 'image/webp': return ascii(0, 4) === 'RIFF' && ascii(8, 4) === 'WEBP';
    case 'application/pdf': return ascii(0, 5) === '%PDF-';
    case 'audio/mpeg': return starts(0x49, 0x44, 0x33) || (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0);
    case 'audio/ogg': return ascii(0, 4) === 'OggS';
    case 'audio/wav': return ascii(0, 4) === 'RIFF' && ascii(8, 4) === 'WAVE';
    case 'video/webm': return starts(0x1a, 0x45, 0xdf, 0xa3);
    case 'video/mp4': return ascii(4, 4) === 'ftyp';
    case 'text/plain': return bytes.length > 0 && !bytes.includes(0);
    // ZIP-based office documents are identified by their container signature.
    case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document': return starts(0x50, 0x4b, 0x03, 0x04);
    // Legacy DOC is an OLE compound document.
    case 'application/msword': return starts(0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1);
    // The bundled demo uses static SVGs. Reject active content and external references.
    case 'image/svg+xml': {
      const svg = new TextDecoder().decode(bytes)
        .replace(/xmlns="http:\/\/www\.w3\.org\/2000\/svg"/gi, '')
        .replace(/url\(#[^)]+\)/gi, '');
      return /^\s*<svg\b/i.test(svg) && /<\/svg>\s*$/i.test(svg)
        && !/<script\b|<style\b|<foreignObject\b|<iframe\b|<image\b|<!DOCTYPE|<!ENTITY|\bon\w+\s*=|\b(?:xlink:)?href\s*=|javascript:|https?:|file:|data:|url\s*\(/i.test(svg);
    }
    default: return false;
  }
}

function isValidMediaPayload(value: Record<string, unknown>): boolean {
  const dataUrl = value.dataUrl as string;
  // Empty payloads are only used by the intentionally payload-free localStorage fallback.
  if (dataUrl === '') return true;
  const decoded = decodeDataUrl(dataUrl);
  if (!decoded || !hasValidMediaSignature(decoded.mime, decoded.bytes)) return false;
  const declaredMime = value.mimeType;
  if (declaredMime !== undefined && declaredMime !== decoded.mime) return false;
  const name = value.name as string;
  const extension = name.match(/\.([a-z0-9]{1,8})$/i)?.[1].toLowerCase();
  if (extension
    && (!MEDIA_MIME_BY_EXTENSION[extension] || MEDIA_MIME_BY_EXTENSION[extension] !== decoded.mime)) return false;
  const permittedType = value.type === 'photo'
    ? decoded.mime.startsWith('image/')
    : value.type === 'document'
      ? ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain', 'image/svg+xml'].includes(decoded.mime)
      : value.type === 'audio' ? decoded.mime.startsWith('audio/') : decoded.mime.startsWith('video/');
  return permittedType;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function isOptionalString(value: unknown): boolean {
  return value === undefined || typeof value === 'string';
}

function isValidFaceBox(value: unknown): boolean {
  return isRecord(value)
    && ['x', 'y', 'width', 'height'].every((key) => typeof value[key] === 'number' && Number.isFinite(value[key]));
}

function isValidFaceTag(value: unknown): boolean {
  if (!isRecord(value) || typeof value.id !== 'string' || typeof value.mediaId !== 'string' || !isValidFaceBox(value.box)) {
    return false;
  }

  return isOptionalString(value.personId)
    && isOptionalString(value.suggestedPersonId)
    && (value.rejectedPersonIds === undefined || (Array.isArray(value.rejectedPersonIds) && value.rejectedPersonIds.every((id) => typeof id === 'string')))
    && (value.descriptor === undefined || (Array.isArray(value.descriptor) && value.descriptor.length === 128 && value.descriptor.every((item) => typeof item === 'number' && Number.isFinite(item))))
    && (value.confidence === undefined || typeof value.confidence === 'number')
    && (value.suggestedScore === undefined || typeof value.suggestedScore === 'number')
    && (value.isConfirmed === undefined || typeof value.isConfirmed === 'boolean')
    && (value.createdAt === undefined || typeof value.createdAt === 'number');
}

function isValidMediaItem(value: unknown): boolean {
  if (!isRecord(value)
    || typeof value.id !== 'string'
    || !MEDIA_TYPES.has(value.type as string)
    || typeof value.name !== 'string'
    || typeof value.dataUrl !== 'string') {
    return false;
  }

  return isValidMediaPayload(value)
    && isOptionalString(value.caption)
    && isOptionalString(value.date)
    && isOptionalString(value.mimeType)
    && isOptionalString(value.originPersonId)
    && (value.faceScanComplete === undefined || typeof value.faceScanComplete === 'boolean')
    && (value.size === undefined || (typeof value.size === 'number' && Number.isFinite(value.size) && value.size >= 0))
    && (value.isPrimaryAvatar === undefined || typeof value.isPrimaryAvatar === 'boolean')
    && (value.manualPersonIds === undefined || (Array.isArray(value.manualPersonIds) && value.manualPersonIds.every((personId) => typeof personId === 'string')))
    && (value.faces === undefined || (Array.isArray(value.faces) && value.faces.every(isValidFaceTag)));
}

function isValidPerson(value: unknown): boolean {
  if (!isRecord(value)
    || typeof value.id !== 'string'
    || typeof value.firstName !== 'string'
    || typeof value.lastName !== 'string'
    || !GENDERS.has(value.gender as string)
    || typeof value.isDeceased !== 'boolean'
    || typeof value.bio !== 'string'
    || !Array.isArray(value.significantDates)
    || !Array.isArray(value.mediaFiles)
    || !Array.isArray(value.tags)
    || typeof value.createdAt !== 'number'
    || typeof value.updatedAt !== 'number') {
    return false;
  }

  const stringFields = [
    value.patronymic,
    value.maidenName,
    value.birthDate,
    value.birthPlace,
    value.deathDate,
    value.deathPlace,
    value.avatarUrl,
    value.occupation,
    value.socialStatus,
  ];

  return stringFields.every(isOptionalString)
    && (value.avatarUrl === undefined || value.avatarUrl === '' || (typeof value.avatarUrl === 'string' && isValidMediaPayload({ dataUrl: value.avatarUrl, name: '', type: 'photo' })))
    && (value.avatarFaceBox === undefined || isValidFaceBox(value.avatarFaceBox))
    && value.tags.every((tag) => typeof tag === 'string')
    && value.mediaFiles.every(isValidMediaItem)
    && value.significantDates.every((date) => isRecord(date)
      && typeof date.id === 'string'
      && typeof date.title === 'string'
      && typeof date.date === 'string'
      && isOptionalString(date.location)
      && isOptionalString(date.description)
      && (date.category === undefined || ['life', 'career', 'military', 'education', 'award', 'estate', 'other'].includes(date.category as string)));
}

function isValidRelationship(value: unknown, personIds: Set<string>): boolean {
  if (!isRecord(value)
    || typeof value.id !== 'string'
    || typeof value.person1Id !== 'string'
    || typeof value.person2Id !== 'string'
    || !RELATIONSHIP_TYPES.has(value.type as string)
    || !personIds.has(value.person1Id)
    || !personIds.has(value.person2Id)) {
    return false;
  }

  return isOptionalString(value.customLabel)
    && isOptionalString(value.startDate)
    && (value.startDateUnknown === undefined || typeof value.startDateUnknown === 'boolean')
    && isOptionalString(value.endDate)
    && (value.endDateUnknown === undefined || typeof value.endDateUnknown === 'boolean')
    && isOptionalString(value.notes);
}

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
  const relationshipIndexes = new Map<string, number>();

  data.relationships.forEach((rel) => {
    let person1Id = rel.person1Id;
    let person2Id = rel.person2Id;
    let type = rel.type;
    let startDateUnknown = rel.startDateUnknown;
    let endDateUnknown = rel.endDateUnknown;

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

    if (type === 'spouse' || type === 'former-spouse' || type === 'marriage') {
      const wasFormer = type === 'former-spouse';
      type = 'marriage';
      if (rel.startDate) startDateUnknown = false;
      else if (startDateUnknown === undefined) startDateUnknown = true;
      if (rel.endDate) endDateUnknown = false;
      else if (wasFormer && endDateUnknown === undefined) endDateUnknown = true;
    }

    const pairKey = type === 'marriage'
      ? `marriage_${[person1Id, person2Id].sort().join('_')}`
      : `${type}_${person1Id}_${person2Id}`;
    const existingIndex = relationshipIndexes.get(pairKey);
    if (existingIndex === undefined) {
      relationshipIndexes.set(pairKey, normalizedRels.length);
      normalizedRels.push({
        ...rel,
        person1Id,
        person2Id,
        type,
        startDateUnknown,
        endDateUnknown
      });
    } else if (type === 'marriage') {
      const existing = normalizedRels[existingIndex];
      const startDate = existing.startDate || rel.startDate;
      const incomingEnded = !!rel.endDate || endDateUnknown === true;
      const existingEnded = !!existing.endDate || existing.endDateUnknown === true;
      const preferIncomingEnd = incomingEnded && (!existingEnded || (!existing.endDate && !!rel.endDate));
      normalizedRels[existingIndex] = {
        ...existing,
        startDate,
        startDateUnknown: !!startDate ? false : true,
        endDate: preferIncomingEnd ? rel.endDate : existing.endDate,
        endDateUnknown: preferIncomingEnd
          ? (!rel.endDate && endDateUnknown === true)
          : (!existing.endDate && existing.endDateUnknown === true)
      };
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
  if (isTauriDesktop()) {
    const data = await loadNativeTree();
    if (!data) return EMPTY_TREE_DATA;
    const validated = validateStoredData(data);
    if (!validated) throw new Error('Сохранённый архив повреждён. Исходные данные оставлены без изменений.');
    return validated;
  }

  try {
    const db = await openDatabase();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const getRequest = store.get(TREE_KEY);

        getRequest.onsuccess = () => {
        if (getRequest.result !== undefined) {
          const normalized = validateStoredData(getRequest.result);
          if (!normalized) {
            reject(new Error('Сохранённый архив IndexedDB повреждён. Исходные данные оставлены без изменений.'));
            return;
          }
          resolve(normalized);
        } else {
          // Check LocalStorage fallback
          const localData = getLocalStorageFallback();
          if (localData) {
            const normalized = normalizeTreeData(localData);
            saveFamilyTree(normalized);
            resolve(normalized);
          } else {
            if (hasLocalStorageFallback()) {
              reject(new Error('Резервная копия localStorage повреждена. Исходные данные оставлены без изменений.'));
              return;
            }
            // Initialize with empty clean tree
            saveFamilyTree(EMPTY_TREE_DATA);
            resolve(EMPTY_TREE_DATA);
          }
        }
      };

      getRequest.onerror = () => {
        const localData = getLocalStorageFallback();
        if (localData) resolve(normalizeTreeData(localData));
        else reject(getRequest.error || new Error('Не удалось прочитать IndexedDB'));
      };
      transaction.onabort = () => reject(transaction.error || new Error('Транзакция чтения IndexedDB отменена'));
      transaction.onerror = () => reject(transaction.error || new Error('Ошибка транзакции чтения IndexedDB'));
      transaction.oncomplete = () => db.close();
    });
  } catch (error) {
    console.warn('IndexedDB failed, using localStorage:', error);
    const localData = getLocalStorageFallback();
    if (localData) return normalizeTreeData(localData);
    throw error;
  }
}

/**
 * Save current tree data to IndexedDB + LocalStorage sync
 */
export function saveFamilyTree(data: FamilyTreeData): Promise<void> {
  const write = saveQueue.then(() => saveFamilyTreeNow(data));
  // A rejected write must be reported to its caller but cannot block recovery.
  saveQueue = write.catch(() => undefined);
  return write;
}

export function waitForPendingSaves(): Promise<void> {
  return saveQueue;
}

async function saveFamilyTreeNow(data: FamilyTreeData): Promise<void> {
  const updatedData: FamilyTreeData = {
    ...data,
    lastModified: Date.now()
  };

  if (isTauriDesktop()) {
    await saveNativeTree(updatedData);
    return;
  }

  // Save to IndexedDB
  try {
    const db = await openDatabase();
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      store.put(updatedData, TREE_KEY);
      transaction.onabort = () => { db.close(); reject(transaction.error || new Error('Транзакция IndexedDB отменена')); };
      transaction.onerror = () => { db.close(); reject(transaction.error || new Error('Ошибка транзакции IndexedDB')); };
      transaction.oncomplete = () => { db.close(); resolve(); };
    });
    try {
      localStorage.setItem(LOCAL_STORAGE_BACKUP_KEY, JSON.stringify(createLocalStorageFallback(updatedData)));
    } catch {
      // IndexedDB is authoritative; fallback is best effort when quota is exhausted.
    }
  } catch (error) {
    console.error('Failed to save in IndexedDB:', error);
    try {
      localStorage.setItem(LOCAL_STORAGE_BACKUP_KEY, JSON.stringify(createLocalStorageFallback(updatedData)));
    } catch {
      // Preserve the IndexedDB error; the fallback is only best effort.
    }
    throw error;
  }
}

function getLocalStorageFallback(): FamilyTreeData | null {
  try {
    const item = localStorage.getItem(LOCAL_STORAGE_BACKUP_KEY);
    if (item) {
      const parsed = JSON.parse(item);
      return validateStoredData(parsed);
    }
  } catch {
    // ignore
  }
  return null;
}

function hasLocalStorageFallback(): boolean {
  try {
    return localStorage.getItem(LOCAL_STORAGE_BACKUP_KEY) !== null;
  } catch {
    return false;
  }
}

function createLocalStorageFallback(data: FamilyTreeData): FamilyTreeData {
  const withoutPayload = (media: MediaItem): MediaItem => ({ ...media, dataUrl: '' });
  return {
    ...data,
    persons: data.persons.map((person) => ({ ...person, mediaFiles: person.mediaFiles.map(withoutPayload) })),
    mediaArchive: data.mediaArchive?.map(withoutPayload) ?? [],
  };
}

function validateStoredData(value: unknown): FamilyTreeData | null {
  return validateImportedData(value);
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

function gedcomText(value: string): string {
  return value.replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();
}

const GEDCOM_MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

/** Convert the application's ISO-like dates into GEDCOM 5.5.1 date values. */
export function formatGedcomDate(value: string): string {
  const date = value.trim();
  const full = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (full) {
    const month = Number(full[2]);
    const day = Number(full[3]);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) return `${day} ${GEDCOM_MONTHS[month - 1]} ${full[1]}`;
  }
  const month = date.match(/^(\d{4})-(\d{2})$/);
  if (month) {
    const number = Number(month[2]);
    if (number >= 1 && number <= 12) return `${GEDCOM_MONTHS[number - 1]} ${month[1]}`;
  }
  if (/^\d{3,4}$/.test(date)) return date;
  return gedcomText(date);
}

/** Build a deterministic GEDCOM 5.5.1 document. Non-core app fields are intentionally omitted. */
export function createGedcomContent(data: FamilyTreeData, exportDate = new Date()): string {
  const people = [...data.persons].sort((a, b) => a.id.localeCompare(b.id));
  const personById = new Map(people.map((person, index) => [person.id, { person, xref: `@I${index + 1}@` }]));
  type Family = { spouses: string[]; children: string[]; adopted: Set<string>; marriage?: RelationshipRecord; key: string };
  const families = new Map<string, Family>();
  const marriageRels = data.relationships.filter((rel) => rel.type === 'marriage' || rel.type === 'spouse' || rel.type === 'former-spouse');
  const parentRels = data.relationships.filter((rel) => ['parent', 'adoptive-parent'].includes(rel.type));
  const keyOf = (ids: string[]) => [...new Set(ids)].sort().join('\u0000');
  const getFamily = (spouses: string[], marriage?: RelationshipRecord) => {
    const key = keyOf(spouses);
    let family = families.get(key);
    if (!family) {
      family = { spouses: [...new Set(spouses)], children: [], adopted: new Set(), marriage, key };
      families.set(key, family);
    } else if (marriage && !family.marriage) family.marriage = marriage;
    return family;
  };
  for (const marriage of marriageRels) getFamily([marriage.person1Id, marriage.person2Id], marriage);
  const parentsByChild = new Map<string, string[]>();
  for (const rel of parentRels) {
    const list = parentsByChild.get(rel.person2Id) || [];
    list.push(rel.person1Id);
    parentsByChild.set(rel.person2Id, list);
  }
  for (const rel of parentRels) {
    const parents = parentsByChild.get(rel.person2Id) || [rel.person1Id];
    const family = getFamily(parents);
    if (!family.children.includes(rel.person2Id)) family.children.push(rel.person2Id);
    if (rel.type === 'adoptive-parent') family.adopted.add(rel.person2Id);
  }
  const orderedFamilies = [...families.values()].sort((a, b) => a.key.localeCompare(b.key));
  const familyXref = new Map(orderedFamilies.map((family, index) => [family.key, `@F${index + 1}@`]));
  const lines = [
    '0 HEAD', '1 SOUR RODOSLOVNAYA', '2 NAME Родословная', '2 VERS 1.0',
    '1 GEDC', '2 VERS 5.5.1', '2 FORM LINEAGE-LINKED', '1 CHAR UTF-8',
    `1 DATE ${String(exportDate.getDate()).padStart(2, '0')} ${GEDCOM_MONTHS[exportDate.getMonth()]} ${exportDate.getFullYear()}`,
  ];
  for (const { person, xref } of personById.values()) {
    lines.push(`0 ${xref} INDI`);
    const given = gedcomText([person.firstName, person.patronymic].filter(Boolean).join(' '));
    const surname = gedcomText(person.lastName);
    lines.push(`1 NAME ${given}${surname ? ` /${surname}/` : ''}`.trim());
    if (person.maidenName) lines.push(`2 _MARNM ${gedcomText(person.maidenName)}`);
    lines.push(`1 SEX ${person.gender === 'female' ? 'F' : person.gender === 'male' ? 'M' : 'U'}`);
    if (person.birthDate || person.birthPlace) {
      lines.push('1 BIRT');
      if (person.birthDate) lines.push(`2 DATE ${formatGedcomDate(person.birthDate)}`);
      if (person.birthPlace) lines.push(`2 PLAC ${gedcomText(person.birthPlace)}`);
    }
    if (person.isDeceased) {
      lines.push('1 DEAT');
      if (person.deathDate) lines.push(`2 DATE ${formatGedcomDate(person.deathDate)}`);
      if (person.deathPlace) lines.push(`2 PLAC ${gedcomText(person.deathPlace)}`);
    }
    if (person.occupation) lines.push(`1 OCCU ${gedcomText(person.occupation)}`);
    if (person.bio) lines.push(`1 NOTE ${gedcomText(person.bio)}`);
    for (const family of orderedFamilies) {
      const ref = familyXref.get(family.key)!;
      if (family.spouses.includes(person.id)) lines.push(`1 FAMS ${ref}`);
      if (family.children.includes(person.id)) {
        lines.push(`1 FAMC ${ref}`);
        if (family.adopted.has(person.id)) lines.push('2 PEDI adopted');
      }
    }
  }
  for (const family of orderedFamilies) {
    const xref = familyXref.get(family.key)!;
    lines.push(`0 ${xref} FAM`);
    const spouses = family.spouses.map((id) => personById.get(id)).filter((entry): entry is NonNullable<typeof entry> => !!entry);
    const husband = spouses.find(({ person }) => person.gender === 'male')
      || spouses.find(({ person }) => person.gender === 'other');
    const wife = spouses.find(({ person }) => person.gender === 'female' && person.id !== husband?.person.id)
      || spouses.find((entry) => entry.person.id !== husband?.person.id);
    if (husband) lines.push(`1 HUSB ${husband.xref}`);
    if (wife) lines.push(`1 WIFE ${wife.xref}`);
    if (family.marriage?.startDate) lines.push(`1 MARR\n2 DATE ${formatGedcomDate(family.marriage.startDate)}`);
    if (family.marriage?.endDate) lines.push(`1 DIV\n2 DATE ${formatGedcomDate(family.marriage.endDate)}`);
    for (const childId of family.children) {
      const child = personById.get(childId);
      if (child) {
        lines.push(`1 CHIL ${child.xref}`);
      }
    }
  }
  lines.push('0 TRLR');
  return `${lines.join('\n')}\n`;
}

/** Download tree data as a GEDCOM 5.5.1 file. */
export function exportTreeAsGedcom(data: FamilyTreeData): void {
  const gedcomContent = createGedcomContent(data);
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

/** Parse GEDCOM 5.x individuals and family records into the application's tree model. */
export function importTreeFromGedcom(content: string, fileName = ''): FamilyTreeData | null {
  const records: Array<{ level: number; tag: string; value: string; children: Array<{ level: number; tag: string; value: string; children: Array<{ level: number; tag: string; value: string }> }> }> = [];
  let current: (typeof records)[number] | null = null;
  let event: (typeof records)[number]['children'][number] | null = null;

  for (const rawLine of content.replace(/^\uFEFF/, '').split(/\r?\n/)) {
    const match = rawLine.match(/^\s*(\d+)\s+(?:(@[^@]+@)\s+)?([A-Za-z_]+)(?:\s+(.*))?$/);
    if (!match) continue;
    const level = Number(match[1]);
    const tag = match[3].toUpperCase();
    const value = (match[4] || '').trim();
    if (level === 0) {
      current = { level, tag: tag, value: match[2] || '', children: [] };
      records.push(current);
      event = null;
    } else if (current && level === 1) {
      const child = { level, tag, value, children: [] as Array<{ level: number; tag: string; value: string }> };
      current.children.push(child);
      event = ['BIRT', 'DEAT'].includes(tag) ? child : null;
    } else if (current && level === 2) {
      const parent = event && ['DATE', 'PLAC'].includes(tag) ? event : current.children[current.children.length - 1];
      if (parent) parent.children.push({ level, tag, value });
    }
  }

  const individuals = records.filter((record) => record.tag === 'INDI');
  if (!individuals.length) return null;
  const now = Date.now();
  const idByXref = new Map<string, string>();
  individuals.forEach((record, index) => idByXref.set(record.value, `gedcom-${index + 1}-${Math.random().toString(36).slice(2, 8)}`));
  const parseDate = (value: string | undefined): string | undefined => {
    if (!value) return undefined;
    const normalized = value.trim().toUpperCase().replace(/^(ABT|ABOUT|BEF|BEFORE|AFT|AFTER|CAL|EST)\s+/, '');
    const months: Record<string, string> = { JAN: '01', FEB: '02', MAR: '03', APR: '04', MAY: '05', JUN: '06', JUL: '07', AUG: '08', SEP: '09', OCT: '10', NOV: '11', DEC: '12' };
    const parts = normalized.split(/\s+/);
    if (/^\d{3,4}$/.test(parts[0])) return parts[0];
    if (parts.length >= 3 && months[parts[1]] && /^\d{1,2}$/.test(parts[0]) && /^\d{3,4}$/.test(parts[2])) return `${parts[2]}-${months[parts[1]]}-${parts[0].padStart(2, '0')}`;
    if (parts.length >= 2 && months[parts[0]] && /^\d{3,4}$/.test(parts[1])) return `${parts[1]}-${months[parts[0]]}`;
    return value.trim();
  };
  const first = (record: (typeof records)[number], tag: string) => record.children.find((child) => child.tag === tag);
  const childValue = (record: (typeof records)[number], tag: string, childTag: string) => first(record, tag)?.children.find((child) => child.tag === childTag)?.value;
  const persons: Person[] = individuals.map((record, index) => {
    const name = first(record, 'NAME')?.value || '';
    const surname = name.match(/\/([^/]*)\//)?.[1]?.trim() || '';
    const given = name.replace(/\/[^/]*\//g, ' ').trim().split(/\s+/).filter(Boolean);
    const birthDate = parseDate(childValue(record, 'BIRT', 'DATE'));
    const deathDate = parseDate(childValue(record, 'DEAT', 'DATE'));
    const sex = first(record, 'SEX')?.value.toUpperCase();
    const individualNotes = record.children.filter((child) => child.tag === 'NOTE').map((child) => child.value + child.children.map((part) => `${part.tag === 'CONT' ? '\n' : ''}${part.value}`).join('')).join('\n');
    const id = idByXref.get(record.value)!;
    return {
      id, firstName: given.shift() || 'Неизвестно', lastName: surname, ...(given.length ? { patronymic: given.join(' ') } : {}),
      gender: sex === 'M' ? 'male' : sex === 'F' ? 'female' : 'other',
      ...(first(record, 'NAME')?.children.find((child) => child.tag === '_MARNM') ? { maidenName: first(record, 'NAME')!.children.find((child) => child.tag === '_MARNM')!.value } : {}),
      ...(birthDate ? { birthDate } : {}), ...(childValue(record, 'BIRT', 'PLAC') ? { birthPlace: childValue(record, 'BIRT', 'PLAC') } : {}),
      isDeceased: !!first(record, 'DEAT') || !!deathDate, ...(deathDate ? { deathDate } : {}), ...(childValue(record, 'DEAT', 'PLAC') ? { deathPlace: childValue(record, 'DEAT', 'PLAC') } : {}),
      ...(first(record, 'OCCU') ? { occupation: first(record, 'OCCU')!.value } : {}),
      bio: individualNotes, significantDates: [], mediaFiles: [], tags: [], createdAt: now + index, updatedAt: now + index,
    };
  });
  const relationships: RelationshipRecord[] = [];
  const addRelationship = (a: string | undefined, b: string | undefined, type: RelationshipRecord['type'], suffix: string) => {
    if (!a || !b || a === b || relationships.some((rel) => rel.type === type && rel.person1Id === a && rel.person2Id === b)) return;
    relationships.push({ id: `gedcom-rel-${relationships.length + 1}-${suffix}`, person1Id: a, person2Id: b, type });
  };
  const adoptedFamilyRefs = new Set<string>();
  individuals.forEach((person) => person.children
    .filter((child) => child.tag === 'FAMC' && child.children.some((part) => part.tag === 'PEDI' && part.value.toLowerCase() === 'adopted'))
    .forEach((child) => adoptedFamilyRefs.add(`${person.value}|${child.value}`)));
  records.filter((record) => record.tag === 'FAM').forEach((family, familyIndex) => {
    const husband = idByXref.get(first(family, 'HUSB')?.value || '');
    const wife = idByXref.get(first(family, 'WIFE')?.value || '');
    addRelationship(husband, wife, 'marriage', String(familyIndex));
    family.children.filter((child) => child.tag === 'CHIL').forEach((child) => {
        const personId = idByXref.get(child.value);
      const adopted = adoptedFamilyRefs.has(`${child.value}|${family.value}`);
      addRelationship(husband, personId, adopted ? 'adoptive-parent' : 'parent', String(familyIndex));
      addRelationship(wife, personId, adopted ? 'adoptive-parent' : 'parent', String(familyIndex));
    });
  });
  return { persons, relationships, mediaArchive: [], treeName: fileName.replace(/\.ged(?:com)?$/i, '') || 'Импорт GEDCOM', description: '', lastModified: now, version: 1 };
}

/**
 * Validate imported JSON data
 */
export function validateImportedData(raw: unknown): FamilyTreeData | null {
  if (!isRecord(raw)
    || typeof raw.treeName !== 'string'
    || (raw.description !== undefined && typeof raw.description !== 'string')
    || !Array.isArray(raw.persons)
    || !Array.isArray(raw.relationships)
    || (raw.mediaArchive !== undefined && !Array.isArray(raw.mediaArchive))
    || raw.version !== 1
    || typeof raw.lastModified !== 'number'
    || !Number.isFinite(raw.lastModified)
    || !raw.persons.every(isValidPerson)
    || (Array.isArray(raw.mediaArchive) && !raw.mediaArchive.every(isValidMediaItem))) {
    return null;
  }

  const personIds = new Set(raw.persons.map((person) => (person as Person).id));
  if (personIds.size !== raw.persons.length || !raw.relationships.every((relationship) => isValidRelationship(relationship, personIds))) {
    return null;
  }

  const validData: FamilyTreeData = {
    treeName: raw.treeName,
    description: raw.description,
    persons: raw.persons as Person[],
    relationships: raw.relationships as RelationshipRecord[],
    mediaArchive: Array.isArray(raw.mediaArchive) ? raw.mediaArchive as MediaItem[] : [],
    version: raw.version,
    lastModified: raw.lastModified,
  };

  return normalizeTreeData(validData);
}
