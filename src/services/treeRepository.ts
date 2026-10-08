import type { FamilyTreeData, MediaItem } from '../types/genealogy';
import { loadFamilyTree, saveFamilyTree, validateImportedData } from './db';
import { loadNativeTree, saveNativeTree } from './nativeTreeRepository';
import { isTauriDesktop } from './nativeTreeRepository';

/** Persistence boundary shared by browser and desktop application services. */
export interface TreeRepository {
  load(): Promise<FamilyTreeData | null>;
  save(tree: FamilyTreeData): Promise<void>;
  saveArchiveMedia?(media: MediaItem): Promise<void>;
}

export class BrowserTreeRepository implements TreeRepository {
  load(): Promise<FamilyTreeData> { return loadFamilyTree(); }
  save(tree: FamilyTreeData): Promise<void> { return saveFamilyTree(tree); }
}

export class TauriTreeRepository implements TreeRepository {
  async load(): Promise<FamilyTreeData | null> {
    const tree = await loadNativeTree();
    if (!tree) return null;
    const validated = validateImportedData(tree);
    if (!validated) throw new Error('Сохранённый архив повреждён. Исходные данные оставлены без изменений.');
    return validated;
  }
  save(tree: FamilyTreeData): Promise<void> { return saveNativeTree(tree); }
}

export function createTreeRepository(): TreeRepository {
  return isTauriDesktop() ? new TauriTreeRepository() : new BrowserTreeRepository();
}
