export type Gender = 'male' | 'female' | 'other';

export type RelationshipType = 
  | 'parent'          // person1 is parent of person2
  | 'child'           // person1 is child of person2
  | 'spouse'          // married or partner
  | 'former-spouse'   // ex-spouse
  | 'sibling'         // brother / sister
  | 'adoptive-parent' // усыновитель / приемный родитель
  | 'adoptive-child'  // усыновленный ребенок
  | 'godparent'       // крёстный / крёстная
  | 'godchild'        // крестник / крестница
  | 'custom';         // произвольное родство

export type RelativeRole = 
  | 'parent'          // Создаваемая персона является родителем для targetId
  | 'child'           // Создаваемая персона является ребёнком для targetId
  | 'spouse'          // Создаваемая персона является супругом(ой) для targetId
  | 'former-spouse'   // Создаваемая персона является бывшим(ей) супругом(ой) для targetId
  | 'sibling'         // Создаваемая персона является братом/сестрой для targetId
  | 'adoptive-parent'
  | 'adoptive-child'
  | 'godparent'
  | 'godchild'
  | 'custom';

export interface PendingRelationship {
  targetId: string;
  role: RelativeRole;
  customLabel?: string;
}

export interface SignificantDate {
  id: string;
  title: string;       // e.g. "Бракосочетание", "Крещение", "Служба в армии", "Окончание гимназии"
  date: string;        // "1942-05-18" or "1942"
  location?: string;   // e.g. "Санкт-Петербург", "с. Покровское"
  description?: string;
  category?: 'life' | 'career' | 'military' | 'education' | 'award' | 'estate' | 'other';
}

export type MediaType = 'photo' | 'document' | 'video' | 'audio';

export interface FaceBox {
  x: number;      // Bounding box X in percentage of image width (0-100)
  y: number;      // Bounding box Y in percentage of image height (0-100)
  width: number;  // Bounding box width in percentage (0-100)
  height: number; // Bounding box height in percentage (0-100)
}

export interface FaceTag {
  id: string;
  mediaId: string;
  box: FaceBox;
  personId?: string;          // Assigned person ID (if confirmed or manually set)
  descriptor?: number[];      // 128-float face embedding vector for recognition
  confidence?: number;        // Face detector confidence (0 to 1)
  suggestedPersonId?: string; // AI / Smart-match suggested person ID
  suggestedScore?: number;    // Match similarity percentage (0-100)
  isConfirmed?: boolean;      // True if user confirmed, false if pending suggestion
  createdAt?: number;
}

export interface MediaItem {
  id: string;
  type: MediaType;
  name: string;
  caption?: string;
  date?: string;
  dataUrl: string; // Base64 data URL or preloaded asset URL
  mimeType?: string;
  size?: number; // In bytes
  isPrimaryAvatar?: boolean; // Set as profile portrait
  faces?: FaceTag[]; // Detected or tagged faces on this photo
  originPersonId?: string; // ID of person who originally uploaded this file
}

export interface Person {
  id: string;
  firstName: string;       // Имя (e.g. "Алексей")
  lastName: string;        // Фамилия (e.g. "Морозов")
  patronymic?: string;     // Отчество (e.g. "Николаевич")
  maidenName?: string;     // Девичья фамилия (e.g. "Воронцова")
  gender: Gender;
  birthDate?: string;      // e.g. "1912-08-24" or "1912"
  birthPlace?: string;     // e.g. "г. Москва"
  isDeceased: boolean;
  deathDate?: string;
  deathPlace?: string;
  avatarUrl?: string;
  avatarFaceBox?: FaceBox; // Координаты рамки лица для точного центрирования миниатюры
  bio: string;             // Биография, воспоминания, архивные справки
  occupation?: string;     // Профессия, род деятельности (e.g. "Архитектор, академик")
  socialStatus?: string;   // Сословие / звание (e.g. "Дворянин", "Потомственный почётный гражданин")
  significantDates: SignificantDate[];
  mediaFiles: MediaItem[];
  tags: string[];          // Теги (e.g. "Ветеран ВОВ", "Сибирская ветвь", "Династия врачей")
  createdAt: number;
  updatedAt: number;
}

export interface RelationshipRecord {
  id: string;
  person1Id: string;       // First person
  person2Id: string;       // Second person
  type: RelationshipType;  // person1 relation to person2
  customLabel?: string;    // Custom relationship string if type === 'custom'
  startDate?: string;      // e.g. marriage date
  endDate?: string;
  notes?: string;
}

export interface FamilyTreeData {
  persons: Person[];
  relationships: RelationshipRecord[];
  treeName: string;
  description?: string;
  lastModified: number;
  version: number;
}

export type ActiveView = 'tree' | 'network' | 'timeline' | 'archive' | 'directory';
