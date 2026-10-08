import type { FamilyTreeData, FaceTag, MediaItem } from '../types/genealogy';

function cleanMedia(media: MediaItem, personId: string): MediaItem {
  return {
    ...media,
    ...(media.manualPersonIds ? { manualPersonIds: media.manualPersonIds.filter((id) => id !== personId) } : {}),
    ...(media.faces ? {
      faces: media.faces.map((face): FaceTag => ({
        ...face,
        ...(face.personId === personId ? { personId: undefined, isConfirmed: false } : {}),
        ...(face.suggestedPersonId === personId ? { suggestedPersonId: undefined } : {}),
        ...(face.rejectedPersonIds ? { rejectedPersonIds: face.rejectedPersonIds.filter((id) => id !== personId) } : {}),
      })),
    } : {}),
  };
}

/** Build the complete, reference-safe tree produced by deleting one person. */
export function deletePersonFromTree(tree: FamilyTreeData, personId: string): FamilyTreeData {
  const cleanById = new Map<string, MediaItem>();
  const clean = (media: MediaItem) => {
    const cached = cleanById.get(media.id);
    if (cached) return cached;
    const result = cleanMedia(media, personId);
    cleanById.set(media.id, result);
    return result;
  };

  return {
    ...tree,
    persons: tree.persons
      .filter((person) => person.id !== personId)
      .map((person) => ({ ...person, mediaFiles: person.mediaFiles.map(clean) })),
    relationships: tree.relationships.filter((rel) => rel.person1Id !== personId && rel.person2Id !== personId),
    mediaArchive: (tree.mediaArchive || []).map(clean),
  };
}
