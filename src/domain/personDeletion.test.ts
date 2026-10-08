import { describe, expect, it } from 'vitest';
import { deletePersonFromTree } from './personDeletion';
import type { FamilyTreeData, MediaItem, Person } from '../types/genealogy';

const person = (id: string): Person => ({
  id, firstName: id, lastName: '', gender: 'other', isDeceased: false, bio: '',
  significantDates: [], mediaFiles: [], tags: [], createdAt: 1, updatedAt: 1,
});
const media: MediaItem = {
  id: 'archive-media', type: 'photo', name: 'portrait', dataUrl: 'data:image/png;base64,AA==',
  manualPersonIds: ['deleted', 'kept'],
  faces: [
    { id: 'confirmed', mediaId: 'archive-media', box: { x: 0, y: 0, width: 10, height: 10 }, personId: 'deleted', isConfirmed: true },
    { id: 'suggested', mediaId: 'archive-media', box: { x: 0, y: 0, width: 10, height: 10 }, suggestedPersonId: 'deleted', rejectedPersonIds: ['deleted', 'kept'] },
  ],
};
const tree: FamilyTreeData = {
  treeName: 'Test', persons: [person('deleted'), { ...person('kept'), mediaFiles: [media] }],
  relationships: [
    { id: 'removed', person1Id: 'deleted', person2Id: 'kept', type: 'parent' },
    { id: 'preserved', person1Id: 'kept', person2Id: 'kept', type: 'custom' },
  ], mediaArchive: [media], lastModified: 1, version: 1,
};

describe('deletePersonFromTree', () => {
  it('deletes a person without media and their relationships', () => {
    const result = deletePersonFromTree({ ...tree, mediaArchive: [], persons: [person('deleted'), person('kept')] }, 'deleted');
    expect(result.persons.map(({ id }) => id)).toEqual(['kept']);
    expect(result.relationships.map(({ id }) => id)).toEqual(['preserved']);
  });

  it('cleans every person reference while preserving archive media and other attachments', () => {
    const result = deletePersonFromTree(tree, 'deleted');
    const retained = result.mediaArchive![0];
    expect(result.persons.map(({ id }) => id)).toEqual(['kept']);
    expect(result.relationships.map(({ id }) => id)).toEqual(['preserved']);
    expect(retained.manualPersonIds).toEqual(['kept']);
    expect(retained.faces?.[0]).toMatchObject({ personId: undefined, isConfirmed: false });
    expect(retained.faces?.[1]).toMatchObject({ suggestedPersonId: undefined, rejectedPersonIds: ['kept'] });
    expect(result.persons[0].mediaFiles[0]).toBe(retained);
    expect(retained.dataUrl).toBe(media.dataUrl);
  });
});
