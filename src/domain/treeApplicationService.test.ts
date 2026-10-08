import { describe, expect, it, vi } from 'vitest';
import type { FamilyTreeData } from '../types/genealogy';
import { TreeApplicationService } from './treeApplicationService';
import type { TreeRepository } from '../services/treeRepository';

const person = (id: string) => ({ id, firstName: id, lastName: '', gender: 'other' as const, isDeceased: false, bio: '', significantDates: [], mediaFiles: [], tags: [], createdAt: 1, updatedAt: 1 });
const tree: FamilyTreeData = { treeName: 'Test', persons: [person('a'), person('b')], relationships: [{ id: 'r', person1Id: 'a', person2Id: 'b', type: 'parent' }], mediaArchive: [{ id: 'm', type: 'photo', name: 'm.png', dataUrl: '', manualPersonIds: [], faces: [{ id: 'f', mediaId: 'm', box: { x: 0, y: 0, width: 1, height: 1 }, personId: 'a' }] }], lastModified: 1, version: 1 };

function setup() {
  const repository: TreeRepository = { load: vi.fn(async () => tree), save: vi.fn(async () => undefined) };
  return { repository, service: new TreeApplicationService(repository) };
}

describe('TreeApplicationService', () => {
  it('persists deletion only after building a consistent result', async () => {
    const { repository, service } = setup();
    const result = await service.deletePerson(tree, 'a');
    expect(result.persons.map(({ id }) => id)).toEqual(['b']);
    expect(result.relationships).toEqual([]);
    expect(result.mediaArchive?.[0].faces?.[0].personId).toBeUndefined();
    expect(repository.save).toHaveBeenCalledWith(result);
    expect(tree.persons).toHaveLength(2);
  });

  it('attaches archive media and rolls back state when persistence fails', async () => {
    const { repository, service } = setup();
    const result = await service.attachMedia(tree, 'b', 'm');
    expect(result.persons[1].mediaFiles[0].id).toBe('m');
    expect(result.mediaArchive?.[0].manualPersonIds).toContain('b');

    vi.mocked(repository.save).mockRejectedValueOnce(new Error('disk failure'));
    await expect(service.deletePerson(tree, 'a')).rejects.toThrow('disk failure');
    expect(tree.persons).toHaveLength(2);
  });

  it('rejects attachment commands with unknown entities without saving', async () => {
    const { repository, service } = setup();
    await expect(service.attachMedia(tree, 'missing', 'm')).rejects.toThrow('не найдены');
    expect(repository.save).not.toHaveBeenCalled();
  });

  it('validates imported trees before committing them', async () => {
    const { repository, service } = setup();
    const imported = await service.importTree(tree);
    expect(repository.save).toHaveBeenCalledWith(imported);
    await expect(service.importTree({ ...tree, relationships: [{ id: 'invalid', person1Id: 'missing', person2Id: 'b', type: 'parent' }] }))
      .rejects.toThrow('некорректные данные');
    expect(repository.save).toHaveBeenCalledOnce();
  });
});
