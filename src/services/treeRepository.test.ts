import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FamilyTreeData } from '../types/genealogy';
import { loadFamilyTree, saveFamilyTree } from './db';
import { loadNativeTree, saveNativeTree, isTauriDesktop } from './nativeTreeRepository';
import { BrowserTreeRepository, createTreeRepository, TauriTreeRepository, type TreeRepository } from './treeRepository';

vi.mock('./db', () => ({ loadFamilyTree: vi.fn(), saveFamilyTree: vi.fn(), validateImportedData: vi.fn((tree) => tree) }));
vi.mock('./nativeTreeRepository', () => ({
  isTauriDesktop: vi.fn(), loadNativeTree: vi.fn(), saveNativeTree: vi.fn(),
}));

const tree = { treeName: 'test', persons: [], relationships: [], mediaArchive: [], lastModified: 1, version: 1 } as FamilyTreeData;

describe.each([
  ['browser', () => new BrowserTreeRepository(), loadFamilyTree, saveFamilyTree],
  ['Tauri', () => new TauriTreeRepository(), loadNativeTree, saveNativeTree],
] as const)('%s repository contract', (_name, create, load, save) => {
  afterEach(() => vi.resetAllMocks());

  it('delegates tree load and save through the shared interface', async () => {
    vi.mocked(load).mockResolvedValue(tree as never);
    vi.mocked(save).mockResolvedValue(undefined);
    const repository: TreeRepository = create();
    expect(await repository.load()).toEqual(tree);
    await repository.save(tree);
    expect(load).toHaveBeenCalledOnce();
    expect(save).toHaveBeenCalledWith(tree);
  });
});

describe('repository selection', () => {
  it('selects the persistence implementation for the current runtime', () => {
    vi.mocked(isTauriDesktop).mockReturnValue(true);
    expect(createTreeRepository()).toBeInstanceOf(TauriTreeRepository);
    vi.mocked(isTauriDesktop).mockReturnValue(false);
    expect(createTreeRepository()).toBeInstanceOf(BrowserTreeRepository);
  });
});
