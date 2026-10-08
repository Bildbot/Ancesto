import type { FamilyTreeData, MediaItem } from '../types/genealogy';
import { deletePersonFromTree } from './personDeletion';
import type { TreeRepository } from '../services/treeRepository';
import { validateImportedData } from '../services/db';

/** Coordinates validated, atomic tree commands with persistence. */
export class TreeApplicationService {
  constructor(private readonly repository: TreeRepository) {}

  load(): Promise<FamilyTreeData | null> {
    return this.repository.load();
  }

  async deletePerson(tree: FamilyTreeData, personId: string): Promise<FamilyTreeData> {
    if (!tree.persons.some((person) => person.id === personId)) return tree;
    return this.commit(deletePersonFromTree(tree, personId));
  }

  async attachMedia(tree: FamilyTreeData, personId: string, mediaId: string): Promise<FamilyTreeData> {
    const person = tree.persons.find((candidate) => candidate.id === personId);
    const media = (tree.mediaArchive || []).find((candidate) => candidate.id === mediaId)
      || tree.persons.flatMap((candidate) => candidate.mediaFiles).find((candidate) => candidate.id === mediaId);
    if (!person || !media) throw new Error('Персона или медиафайл не найдены.');

    const attachments = new Set(media.manualPersonIds || []);
    attachments.add(personId);
    const updatedMedia: MediaItem = { ...media, manualPersonIds: [...attachments] };
    const persons = tree.persons.map((candidate) => ({
      ...candidate,
      ...(candidate.id === personId && !candidate.mediaFiles.some((item) => item.id === mediaId)
        ? { mediaFiles: [...candidate.mediaFiles, updatedMedia] }
        : { mediaFiles: candidate.mediaFiles.map((item) => item.id === mediaId ? updatedMedia : item) }),
    }));
    const mediaArchive = (tree.mediaArchive || []).map((item) => item.id === mediaId ? updatedMedia : item);
    if (!mediaArchive.some((item) => item.id === mediaId)) mediaArchive.push(updatedMedia);
    return this.commit({ ...tree, persons, mediaArchive });
  }

  async importTree(tree: FamilyTreeData): Promise<FamilyTreeData> {
    const validated = validateImportedData(tree);
    if (!validated) throw new Error('Импортируемое древо содержит некорректные данные.');
    return this.commit(validated);
  }

  private async commit(next: FamilyTreeData): Promise<FamilyTreeData> {
    // Persistence occurs before returning the new state; a failed write leaves the caller's state intact.
    await this.repository.save(next);
    return next;
  }
}
