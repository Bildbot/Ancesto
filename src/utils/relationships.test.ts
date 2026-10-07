import { describe, expect, it } from 'vitest';
import { removeRelationship } from './relationships';
import type { RelationshipRecord } from '../types/genealogy';

const relationships: RelationshipRecord[] = [
  { id: 'spouse', person1Id: 'person-a', person2Id: 'person-b', type: 'spouse' },
  { id: 'former-spouse', person1Id: 'person-a', person2Id: 'person-b', type: 'former-spouse' },
];

describe('relationship deletion', () => {
  it('removes only the selected relationship when an ID is supplied', () => {
    expect(removeRelationship(relationships, 'person-a', 'person-b', 'spouse', 'spouse')).toEqual([
      { id: 'former-spouse', person1Id: 'person-a', person2Id: 'person-b', type: 'former-spouse' },
    ]);
  });
});
