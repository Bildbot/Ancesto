import { describe, expect, it } from 'vitest';
import { removeRelationship } from './relationships';
import type { RelationshipRecord } from '../types/genealogy';

const relationships: RelationshipRecord[] = [
  { id: 'marriage', person1Id: 'person-a', person2Id: 'person-b', type: 'marriage' },
  { id: 'parent', person1Id: 'person-a', person2Id: 'person-b', type: 'parent' },
];

describe('relationship deletion', () => {
  it('removes only the selected relationship when an ID is supplied', () => {
    expect(removeRelationship(relationships, 'person-a', 'person-b', 'marriage', 'marriage')).toEqual([
      { id: 'parent', person1Id: 'person-a', person2Id: 'person-b', type: 'parent' },
    ]);
  });

  it('removes the marriage for a pair regardless of legacy relationship type', () => {
    expect(removeRelationship(relationships, 'person-a', 'person-b', 'marriage')).toEqual([
      { id: 'parent', person1Id: 'person-a', person2Id: 'person-b', type: 'parent' },
    ]);
  });
});
