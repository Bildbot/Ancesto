import { Person, RelationshipRecord, Gender, RelationshipType } from '../types/genealogy';

/**
 * Format Russian full name: Фамилия Имя Отчество or Имя Отчество Фамилия
 */
export function formatFullName(person: Person, options?: { format?: 'formal' | 'natural' | 'short'; includeMaiden?: boolean }): string {
  const { format = 'natural', includeMaiden = true } = options || {};
  const first = person.firstName.trim();
  const last = person.lastName.trim();
  const pat = person.patronymic?.trim();
  const maiden = (includeMaiden && person.maidenName?.trim()) ? ` (${person.maidenName.trim()})` : '';

  if (format === 'short') {
    const fInitial = first ? `${first[0]}.` : '';
    const pInitial = pat ? `${pat[0]}.` : '';
    return `${last} ${fInitial}${pInitial}`.trim() || first;
  }

  if (format === 'formal') {
    // "Морозов Алексей Николаевич"
    const parts = [last + maiden, first, pat].filter(Boolean);
    return parts.join(' ');
  }

  // "Алексей Николаевич Морозов"
  const parts = [first, pat, last + maiden].filter(Boolean);
  return parts.join(' ');
}

/**
 * Format any date string (ISO YYYY-MM-DD, slashes, or already DD.MM.YYYY) into Russian DD.MM.YYYY
 */
export function formatDisplayDate(dateStr?: string): string {
  if (!dateStr || !dateStr.trim()) return '';
  const trimmed = dateStr.trim();

  // Already DD.MM.YYYY
  if (/^\d{2}\.\d{2}\.\d{4}$/.test(trimmed)) {
    return trimmed;
  }

  // YYYY-MM-DD or YYYY/MM/DD or YYYY.MM.DD
  const ymdMatch = trimmed.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (ymdMatch) {
    const year = ymdMatch[1];
    const month = ymdMatch[2].padStart(2, '0');
    const day = ymdMatch[3].padStart(2, '0');
    return `${day}.${month}.${year}`;
  }

  // DD-MM-YYYY or DD/MM/YYYY
  const dmyMatch = trimmed.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (dmyMatch) {
    const day = dmyMatch[1].padStart(2, '0');
    const month = dmyMatch[2].padStart(2, '0');
    const year = dmyMatch[3];
    return `${day}.${month}.${year}`;
  }

  // Just year: 1988
  if (/^\d{4}$/.test(trimmed)) {
    return trimmed;
  }

  return trimmed;
}

/**
 * Extract 4-digit year from any date string
 */
export function extractYear(dateStr?: string): number | null {
  if (!dateStr) return null;
  // If DD.MM.YYYY
  const dmy = dateStr.match(/^\d{1,2}\.\d{1,2}\.(\d{4})$/);
  if (dmy) return parseInt(dmy[1], 10);
  // Match any 4 digit year (e.g. in ISO or partial text)
  const match = dateStr.match(/\b(17|18|19|20)\d{2}\b/);
  return match ? parseInt(match[0], 10) : null;
}

/**
 * Calculate age or age at death
 */
export function calculateAge(birthDate?: string, deathDate?: string, isDeceased = false): { age?: number; text: string } {
  if (!birthDate) return { text: isDeceased ? 'годы не указаны' : 'возраст не указан' };

  const birthYear = extractYear(birthDate);
  if (!birthYear) return { text: formatDisplayDate(birthDate) };

  const formattedBirth = formatDisplayDate(birthDate);
  const currentYear = new Date().getFullYear();

  if (isDeceased) {
    if (deathDate) {
      const deathYear = extractYear(deathDate);
      const formattedDeath = formatDisplayDate(deathDate);
      if (deathYear && deathYear >= birthYear) {
        const yearsLived = deathYear - birthYear;
        return {
          age: yearsLived,
          text: `${formattedBirth} — ${formattedDeath} (${yearsLived} ${pluralizeYears(yearsLived)})`
        };
      }
      return { text: `${formattedBirth} — ${formattedDeath}` };
    }
    return { text: `${formattedBirth} — †` };
  } else {
    const age = currentYear - birthYear;
    return {
      age,
      text: `род. ${formattedBirth} (${age} ${pluralizeYears(age)})`
    };
  }
}

export function pluralizeYears(years: number): string {
  const abs = Math.abs(years) % 100;
  const lastDigit = abs % 10;
  if (abs > 10 && abs < 20) return 'лет';
  if (lastDigit > 1 && lastDigit < 5) return 'года';
  if (lastDigit === 1) return 'год';
  return 'лет';
}

/**
 * Returns parents of a person
 */
export function getParents(personId: string, persons: Person[], relationships: RelationshipRecord[]): Person[] {
  const parentIds = new Set<string>();

  for (const rel of relationships) {
    if (rel.person2Id === personId && (rel.type === 'parent' || rel.type === 'adoptive-parent')) {
      parentIds.add(rel.person1Id);
    } else if (rel.person1Id === personId && (rel.type === 'child' || rel.type === 'adoptive-child')) {
      parentIds.add(rel.person2Id);
    }
  }

  return persons.filter(p => parentIds.has(p.id));
}

export interface DetailedParent {
  person: Person;
  isAdoptive: boolean;
  rel: RelationshipRecord;
}

/**
 * Returns detailed parents of a person, distinguishing biological and adoptive
 */
export function getDetailedParents(personId: string, persons: Person[], relationships: RelationshipRecord[]): DetailedParent[] {
  const result: DetailedParent[] = [];
  const handled = new Set<string>();

  for (const rel of relationships) {
    let parentId: string | null = null;
    let isAdoptive = false;

    if (rel.person2Id === personId && (rel.type === 'parent' || rel.type === 'adoptive-parent')) {
      parentId = rel.person1Id;
      isAdoptive = rel.type === 'adoptive-parent';
    } else if (rel.person1Id === personId && (rel.type === 'child' || rel.type === 'adoptive-child')) {
      parentId = rel.person2Id;
      isAdoptive = rel.type === 'adoptive-child';
    }

    if (parentId && !handled.has(parentId)) {
      const p = persons.find(x => x.id === parentId);
      if (p) {
        handled.add(parentId);
        result.push({ person: p, isAdoptive, rel });
      }
    }
  }

  return result;
}

/**
 * Returns children of a person
 */
export function getChildren(personId: string, persons: Person[], relationships: RelationshipRecord[]): Person[] {
  const childIds = new Set<string>();

  for (const rel of relationships) {
    if (rel.person1Id === personId && (rel.type === 'parent' || rel.type === 'adoptive-parent')) {
      childIds.add(rel.person2Id);
    } else if (rel.person2Id === personId && (rel.type === 'child' || rel.type === 'adoptive-child')) {
      childIds.add(rel.person1Id);
    }
  }

  return persons.filter(p => childIds.has(p.id));
}

export interface DetailedChild {
  person: Person;
  isAdoptive: boolean;
  rel: RelationshipRecord;
}

/**
 * Returns detailed children of a person, distinguishing biological and adoptive
 */
export function getDetailedChildren(personId: string, persons: Person[], relationships: RelationshipRecord[]): DetailedChild[] {
  const result: DetailedChild[] = [];
  const handled = new Set<string>();

  for (const rel of relationships) {
    let childId: string | null = null;
    let isAdoptive = false;

    if (rel.person1Id === personId && (rel.type === 'parent' || rel.type === 'adoptive-parent')) {
      childId = rel.person2Id;
      isAdoptive = rel.type === 'adoptive-parent';
    } else if (rel.person2Id === personId && (rel.type === 'child' || rel.type === 'adoptive-child')) {
      childId = rel.person1Id;
      isAdoptive = rel.type === 'adoptive-child';
    }

    if (childId && !handled.has(childId)) {
      const c = persons.find(x => x.id === childId);
      if (c) {
        handled.add(childId);
        result.push({ person: c, isAdoptive, rel });
      }
    }
  }

  return result;
}

export interface DetailedSpouse {
  person: Person;
  isFormer: boolean;
  rel: RelationshipRecord;
}

/**
 * Returns spouses/partners of a person
 */
export function getSpouses(personId: string, persons: Person[], relationships: RelationshipRecord[]): { person: Person; rel: RelationshipRecord }[] {
  const results: { person: Person; rel: RelationshipRecord }[] = [];

  for (const rel of relationships) {
    if (rel.type === 'spouse' || rel.type === 'former-spouse') {
      let partnerId: string | null = null;
      if (rel.person1Id === personId) partnerId = rel.person2Id;
      else if (rel.person2Id === personId) partnerId = rel.person1Id;

      if (partnerId) {
        const partner = persons.find(p => p.id === partnerId);
        if (partner) {
          results.push({ person: partner, rel });
        }
      }
    }
  }

  return results;
}

export interface DetailedSibling {
  person: Person;
  rel?: RelationshipRecord;
  isDirectLink: boolean;
}

/**
 * Returns detailed siblings with their direct relationship record if one exists
 */
export function getDetailedSiblings(personId: string, persons: Person[], relationships: RelationshipRecord[]): DetailedSibling[] {
  const result: DetailedSibling[] = [];
  const handled = new Set<string>();

  // 1. Explicit sibling links
  for (const rel of relationships) {
    if (rel.type === 'sibling') {
      let sibId: string | null = null;
      if (rel.person1Id === personId) sibId = rel.person2Id;
      else if (rel.person2Id === personId) sibId = rel.person1Id;

      if (sibId && !handled.has(sibId)) {
        const s = persons.find(x => x.id === sibId);
        if (s) {
          handled.add(sibId);
          result.push({ person: s, rel, isDirectLink: true });
        }
      }
    }
  }

  // 2. Siblings deduced from shared parents
  const parents = getParents(personId, persons, relationships);
  for (const parent of parents) {
    const parentChildren = getChildren(parent.id, persons, relationships);
    for (const child of parentChildren) {
      if (child.id !== personId && !handled.has(child.id)) {
        handled.add(child.id);
        result.push({ person: child, isDirectLink: false });
      }
    }
  }

  return result;
}

export interface OtherRelation {
  person: Person;
  rel: RelationshipRecord;
  roleLabel: string;
}

/**
 * Returns other relationships like godparent, godchild, custom, etc.
 */
export function getOtherRelationships(personId: string, persons: Person[], relationships: RelationshipRecord[]): OtherRelation[] {
  const result: OtherRelation[] = [];

  for (const rel of relationships) {
    if (
      rel.type === 'godparent' ||
      rel.type === 'godchild' ||
      rel.type === 'custom'
    ) {
      let otherId: string | null = null;
      let roleLabel = '';

      if (rel.person1Id === personId) {
        otherId = rel.person2Id;
        if (rel.type === 'godparent') roleLabel = 'Крёстный родитель для';
        else if (rel.type === 'godchild') roleLabel = 'Крестник для';
        else roleLabel = rel.customLabel || 'Связь с';
      } else if (rel.person2Id === personId) {
        otherId = rel.person1Id;
        if (rel.type === 'godparent') roleLabel = 'Крестник';
        else if (rel.type === 'godchild') roleLabel = 'Крёстный родитель';
        else roleLabel = rel.customLabel || 'Связь с';
      }

      if (otherId) {
        const p = persons.find(x => x.id === otherId);
        if (p) {
          result.push({ person: p, rel, roleLabel });
        }
      }
    }
  }

  return result;
}

/**
 * Returns siblings of a person
 */
export function getSiblings(personId: string, persons: Person[], relationships: RelationshipRecord[]): Person[] {
  const siblingIds = new Set<string>();

  // Check explicit sibling relationships
  for (const rel of relationships) {
    if (rel.type === 'sibling') {
      if (rel.person1Id === personId) siblingIds.add(rel.person2Id);
      else if (rel.person2Id === personId) siblingIds.add(rel.person1Id);
    }
  }

  // Also deduce through shared parents
  const parents = getParents(personId, persons, relationships);
  for (const parent of parents) {
    const parentChildren = getChildren(parent.id, persons, relationships);
    for (const child of parentChildren) {
      if (child.id !== personId) {
        siblingIds.add(child.id);
      }
    }
  }

  return persons.filter(p => siblingIds.has(p.id));
}

/**
 * Returns relationship label from person A to person B (e.g., "Отец", "Мать", "Внук", "Супруга")
 */
export function describeKinship(fromPerson: Person, toPerson: Person, persons: Person[], relationships: RelationshipRecord[]): string {
  if (fromPerson.id === toPerson.id) return 'Я (выбранная персона)';

  // 1. Direct explicit relationships
  for (const rel of relationships) {
    if (rel.person1Id === fromPerson.id && rel.person2Id === toPerson.id) {
      if (rel.type === 'parent') return fromPerson.gender === 'female' ? 'Мать' : 'Отец';
      if (rel.type === 'child') return fromPerson.gender === 'female' ? 'Дочь' : 'Сын';
      if (rel.type === 'spouse') return fromPerson.gender === 'female' ? 'Жена' : 'Муж';
      if (rel.type === 'former-spouse') return fromPerson.gender === 'female' ? 'Бывшая жена' : 'Бывший муж';
      if (rel.type === 'sibling') return fromPerson.gender === 'female' ? 'Сестра' : 'Брат';
      if (rel.type === 'adoptive-parent') return fromPerson.gender === 'female' ? 'Приёмная мать' : 'Приёмный отец';
      if (rel.type === 'adoptive-child') return fromPerson.gender === 'female' ? 'Приёмная дочь' : 'Приёмный сын';
      if (rel.type === 'godparent') return fromPerson.gender === 'female' ? 'Крёстная мать' : 'Крёстный отец';
      if (rel.type === 'godchild') return fromPerson.gender === 'female' ? 'Крестница' : 'Крестник';
      if (rel.type === 'custom' && rel.customLabel) return rel.customLabel;
    }
    if (rel.person2Id === fromPerson.id && rel.person1Id === toPerson.id) {
      if (rel.type === 'parent') return fromPerson.gender === 'female' ? 'Дочь' : 'Сын';
      if (rel.type === 'child') return fromPerson.gender === 'female' ? 'Мать' : 'Отец';
      if (rel.type === 'spouse') return fromPerson.gender === 'female' ? 'Жена' : 'Муж';
      if (rel.type === 'former-spouse') return fromPerson.gender === 'female' ? 'Бывшая жена' : 'Бывший муж';
      if (rel.type === 'sibling') return fromPerson.gender === 'female' ? 'Сестра' : 'Брат';
      if (rel.type === 'adoptive-parent') return fromPerson.gender === 'female' ? 'Приёмная дочь' : 'Приёмный сын';
      if (rel.type === 'adoptive-child') return fromPerson.gender === 'female' ? 'Приёмная мать' : 'Приёмный отец';
      if (rel.type === 'godparent') return fromPerson.gender === 'female' ? 'Крестница' : 'Крестник';
      if (rel.type === 'godchild') return fromPerson.gender === 'female' ? 'Крёстная мать' : 'Крёстный отец';
      if (rel.type === 'custom' && rel.customLabel) return `В связи (${rel.customLabel})`;
    }
  }

  // 2. Check Grandparents / Grandchildren
  const fromParents = getParents(fromPerson.id, persons, relationships);
  const toParents = getParents(toPerson.id, persons, relationships);

  // Is fromPerson a Grandparent of toPerson?
  for (const parent of toParents) {
    const grandparents = getParents(parent.id, persons, relationships);
    if (grandparents.some(gp => gp.id === fromPerson.id)) {
      return fromPerson.gender === 'female' ? 'Бабушка' : 'Дедушка';
    }
    // Great-grandparents
    for (const gp of grandparents) {
      const ggparents = getParents(gp.id, persons, relationships);
      if (ggparents.some(ggp => ggp.id === fromPerson.id)) {
        return fromPerson.gender === 'female' ? 'Прабабушка' : 'Прадедушка';
      }
    }
  }

  // Is fromPerson a Grandchild of toPerson?
  for (const parent of fromParents) {
    const grandparents = getParents(parent.id, persons, relationships);
    if (grandparents.some(gp => gp.id === toPerson.id)) {
      return fromPerson.gender === 'female' ? 'Внучка' : 'Внук';
    }
    for (const gp of grandparents) {
      const ggparents = getParents(gp.id, persons, relationships);
      if (ggparents.some(ggp => ggp.id === toPerson.id)) {
        return fromPerson.gender === 'female' ? 'Правнучка' : 'Правнук';
      }
    }
  }

  // 3. Uncle / Aunt / Nephew / Niece
  for (const parent of toParents) {
    const auntsUncles = getSiblings(parent.id, persons, relationships);
    if (auntsUncles.some(au => au.id === fromPerson.id)) {
      return fromPerson.gender === 'female' ? 'Тётя' : 'Дядя';
    }
  }

  for (const parent of fromParents) {
    const auntsUncles = getSiblings(parent.id, persons, relationships);
    if (auntsUncles.some(au => au.id === toPerson.id)) {
      return fromPerson.gender === 'female' ? 'Племянница' : 'Племянник';
    }
  }

  // 4. First Cousins (Двоюродные)
  for (const p1 of fromParents) {
    for (const p2 of toParents) {
      const pSiblings = getSiblings(p1.id, persons, relationships);
      if (pSiblings.some(s => s.id === p2.id)) {
        return fromPerson.gender === 'female' ? 'Двоюродная сестра' : 'Двоюродный брат';
      }
    }
  }

  // 5. In-laws (Свекор, Теща, Зять, Невестка)
  const fromSpouses = getSpouses(fromPerson.id, persons, relationships).map(s => s.person);
  for (const spouse of fromSpouses) {
    const spouseParents = getParents(spouse.id, persons, relationships);
    if (spouseParents.some(p => p.id === toPerson.id)) {
      return fromPerson.gender === 'female' ? 'Невестка (сноха)' : 'Зять';
    }
  }

  const toSpouses = getSpouses(toPerson.id, persons, relationships).map(s => s.person);
  for (const spouse of toSpouses) {
    const spouseParents = getParents(spouse.id, persons, relationships);
    if (spouseParents.some(p => p.id === fromPerson.id)) {
      if (toPerson.gender === 'female') {
        return fromPerson.gender === 'female' ? 'Свекровь' : 'Свёкор';
      } else {
        return fromPerson.gender === 'female' ? 'Тёща' : 'Тесть';
      }
    }
  }

  return 'Родственник';
}

/**
 * Standard relationship options for select menus
 */
export const RELATIONSHIP_PRESETS: { value: RelationshipType; label: string; reciprocalLabel: string }[] = [
  { value: 'parent', label: 'Родитель (отец / мать)', reciprocalLabel: 'Ребёнок (сын / дочь)' },
  { value: 'child', label: 'Ребёнок (сын / дочь)', reciprocalLabel: 'Родитель (отец / мать)' },
  { value: 'spouse', label: 'Супруг(а)', reciprocalLabel: 'Супруг(а)' },
  { value: 'former-spouse', label: 'Бывший(ая) супруг(а)', reciprocalLabel: 'Бывший(ая) супруг(а)' },
  { value: 'sibling', label: 'Брат / Сестра', reciprocalLabel: 'Брат / Сестра' },
  { value: 'adoptive-parent', label: 'Приёмный родитель', reciprocalLabel: 'Приёмный ребёнок' },
  { value: 'adoptive-child', label: 'Приёмный ребёнок', reciprocalLabel: 'Приёмный родитель' },
  { value: 'godparent', label: 'Крёстный / Крёстная', reciprocalLabel: 'Крестник / Крестница' },
  { value: 'godchild', label: 'Крестник / Крестница', reciprocalLabel: 'Крёстный / Крёстная' },
  { value: 'custom', label: 'Другая степень родства...', reciprocalLabel: 'Связь' },
];
