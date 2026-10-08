import { invoke, isTauri } from '@tauri-apps/api/core';
import type { FamilyTreeData, MediaItem } from '../types/genealogy';

export function isTauriDesktop(): boolean {
  return typeof window !== 'undefined' && isTauri();
}

export function loadNativeTree(): Promise<FamilyTreeData | null> {
  return invoke<FamilyTreeData | null>('load_tree');
}

export function saveNativeTree(tree: FamilyTreeData): Promise<void> {
  return invoke('save_tree', { tree });
}

export function saveNativeArchiveMedia(media: MediaItem): Promise<void> {
  return invoke('save_archive_media', { media });
}

export interface BackupSummary {
  persons: number;
  relationships: number;
  media: number;
}

export function exportNativeBackup(destination: string): Promise<void> {
  return invoke('export_backup', { destination });
}

export function inspectNativeBackup(source: string): Promise<BackupSummary> {
  return invoke('inspect_backup', { source });
}

export function restoreNativeBackup(source: string): Promise<string> {
  return invoke('restore_backup', { source });
}
