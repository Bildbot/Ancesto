import type { RelationshipRecord, RelationshipType } from '../types/genealogy';

export function removeRelationship(
  relationships: RelationshipRecord[],
  person1Id: string,
  person2Id: string,
  type?: RelationshipType,
  relationshipId?: string,
): RelationshipRecord[] {
  return relationships.filter((relationship) => {
    if (relationshipId) return relationship.id !== relationshipId;

    const isDirect = relationship.person1Id === person1Id && relationship.person2Id === person2Id;
    const isReverse = relationship.person1Id === person2Id && relationship.person2Id === person1Id;
    if (!isDirect && !isReverse) return true;
    if (!type) return false;

    if (type === 'parent' || type === 'child' || type === 'adoptive-parent' || type === 'adoptive-child') {
      return !['parent', 'child', 'adoptive-parent', 'adoptive-child'].includes(relationship.type);
    }
    if (type === 'spouse' || type === 'former-spouse') {
      return !['spouse', 'former-spouse'].includes(relationship.type);
    }
    return relationship.type !== type;
  });
}
