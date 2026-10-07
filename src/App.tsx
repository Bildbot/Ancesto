import React, { useState, useEffect, useCallback, useRef } from 'react';
import { 
  FamilyTreeData, 
  Person, 
  RelationshipRecord, 
  ActiveView, 
  RelationshipType,
  RelativeRole,
  PendingRelationship,
  MediaItem
} from './types/genealogy';
import { EMPTY_TREE_DATA, INITIAL_DEMO_DATA } from './data/demoFamily';
import { loadFamilyTree, saveFamilyTree } from './services/db';
import { isTauriDesktop, saveNativeArchiveMedia } from './services/nativeTreeRepository';
import { getParents, getSpouses } from './utils/kinship';
import { removeRelationship } from './utils/relationships';
import { syncTaggedMediaAcrossPersons } from './services/faceRecognition';
import { FamilyTreeView } from './components/views/FamilyTreeView';
import { NetworkGraphView } from './components/views/NetworkGraphView';
import { TimelineView } from './components/views/TimelineView';
import { ArchiveMediaView } from './components/views/ArchiveMediaView';
import { DirectoryView } from './components/views/DirectoryView';
import { PersonModal } from './components/modals/PersonModal';
import { PersonDetailDrawer } from './components/modals/PersonDetailDrawer';
import { BackupModal } from './components/modals/BackupModal';
import { PWAInstallButton } from './components/common/PWAInstallButton';
import { 
  GitFork, 
  Share2, 
  Calendar, 
  Image as ImageIcon, 
  Users, 
  Plus, 
  Database, 
  Download, 
  Menu,
  X,
  Compass
} from 'lucide-react';

export default function App() {
  const [treeData, setTreeData] = useState<FamilyTreeData>(EMPTY_TREE_DATA);
  const treeDataRef = useRef(treeData);
  treeDataRef.current = treeData;
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [activeView, setActiveView] = useState<ActiveView>('tree');

  // Selected person for detail drawer
  const [inspectedPersonId, setInspectedPersonId] = useState<string | null>(null);

  // Edit / Add modal state
  const [isPersonModalOpen, setIsPersonModalOpen] = useState(false);
  const [editingPerson, setEditingPerson] = useState<Person | null>(null);
  const [defaultRelativeTargetId, setDefaultRelativeTargetId] = useState<string | undefined>(undefined);
  const [defaultRelativeRole, setDefaultRelativeRole] = useState<RelativeRole | undefined>(undefined);

  // Backup & Export modal
  const [isBackupModalOpen, setIsBackupModalOpen] = useState(false);

  // Focused person in tree canvas
  const [treeFocusedPersonId, setTreeFocusedPersonId] = useState<string | null>(null);

  // Load from IndexedDB on startup
  useEffect(() => {
    loadFamilyTree()
      .then((data) => {
        // Automatically synchronize media across tagged persons and clean up any unlinked media
        const syncedPersons = syncTaggedMediaAcrossPersons(data.persons);
        const normalizedData: FamilyTreeData = {
          ...data,
          persons: syncedPersons
        };
        setTreeData(normalizedData);
        // Persist normalized data so any legacy child-type records and mislinked media are immediately upgraded in storage
        void saveFamilyTree(normalizedData).catch((saveErr) => {
          console.error('Failed to save normalized tree data:', saveErr);
          setSaveError('Не удалось сохранить изменения в локальном архиве. Экспортируйте резервную копию и повторите попытку.');
        });
        setIsLoading(false);
      })
      .catch((err) => {
        console.error('Failed to load tree data:', err);
        setLoadError(err instanceof Error ? err.message : String(err));
        setIsLoading(false);
      });
  }, []);

  // Auto-save on data change
  const updateTreeData = useCallback((newData: FamilyTreeData) => {
    setTreeData(newData);
    void saveFamilyTree(newData)
      .then(() => setSaveError(null))
      .catch((saveErr) => {
        console.error('Failed to save tree data:', saveErr);
        setSaveError('Не удалось сохранить изменения в локальном архиве. Экспортируйте резервную копию и повторите попытку.');
      });
  }, []);

  // Save person handler
  const handleSavePerson = (
    savedPerson: Person,
    newRelations?: PendingRelationship[]
  ) => {
    const existingIndex = treeData.persons.findIndex((p) => p.id === savedPerson.id);
    let updatedPersons: Person[];

    if (existingIndex >= 0) {
      updatedPersons = [...treeData.persons];
      updatedPersons[existingIndex] = savedPerson;
    } else {
      updatedPersons = [...treeData.persons, savedPerson];
    }

    let updatedRelationships = [...treeData.relationships];

    if (newRelations && newRelations.length > 0) {
      newRelations.forEach((rel) => {
        const uniqueId = () => 'rel-' + Date.now() + '-' + Math.random().toString(36).substr(2, 6);

        if (rel.role === 'parent') {
          // The newly created person is the PARENT of targetId
          // Therefore: person1Id = savedPerson.id (parent), person2Id = targetId (child)
          updatedRelationships.push({
            id: uniqueId(),
            person1Id: savedPerson.id,
            person2Id: rel.targetId,
            type: 'parent'
          });
        } else if (rel.role === 'child') {
          // The newly created person is the CHILD of targetId (targetId is parent)
          // Therefore: person1Id = targetId (parent), person2Id = savedPerson.id (child)
          updatedRelationships.push({
            id: uniqueId(),
            person1Id: rel.targetId,
            person2Id: savedPerson.id,
            type: 'parent'
          });
        } else if (rel.role === 'marriage') {
          updatedRelationships.push({
            id: uniqueId(),
            person1Id: rel.targetId,
            person2Id: savedPerson.id,
            type: 'marriage',
            startDate: rel.startDate,
            startDateUnknown: rel.startDateUnknown,
            endDate: rel.endDate,
            endDateUnknown: rel.endDateUnknown
          });
        } else if (rel.role === 'sibling') {
          updatedRelationships.push({
            id: uniqueId(),
            person1Id: rel.targetId,
            person2Id: savedPerson.id,
            type: 'sibling'
          });
        } else if (rel.role === 'adoptive-parent') {
          updatedRelationships.push({
            id: uniqueId(),
            person1Id: savedPerson.id,
            person2Id: rel.targetId,
            type: 'adoptive-parent'
          });
        } else if (rel.role === 'adoptive-child') {
          updatedRelationships.push({
            id: uniqueId(),
            person1Id: rel.targetId,
            person2Id: savedPerson.id,
            type: 'adoptive-parent'
          });
        } else {
          updatedRelationships.push({
            id: uniqueId(),
            person1Id: rel.targetId,
            person2Id: savedPerson.id,
            type: (rel.role as RelationshipType) || 'custom',
            customLabel: rel.customLabel
          });
        }
      });
    }

    const syncedPersons = syncTaggedMediaAcrossPersons(updatedPersons);

    const nextData: FamilyTreeData = {
      ...treeData,
      persons: syncedPersons,
      relationships: updatedRelationships
    };

    updateTreeData(nextData);

    // If inspected, keep updated
    if (inspectedPersonId === savedPerson.id) {
      setInspectedPersonId(savedPerson.id);
    }
  };

  // Delete specific relationship between two persons
  const handleDeleteRelationship = (
    person1Id: string, 
    person2Id: string, 
    type?: RelationshipType,
    relationshipId?: string
  ) => {
    const updatedRelationships = removeRelationship(
      treeData.relationships,
      person1Id,
      person2Id,
      type,
      relationshipId,
    );

    updateTreeData({
      ...treeData,
      relationships: updatedRelationships
    });
  };

  // Delete person handler
  const handleDeletePerson = (personId: string) => {
    const nextPersons = treeData.persons.filter((p) => p.id !== personId);
    const nextRelations = treeData.relationships.filter(
      (r) => r.person1Id !== personId && r.person2Id !== personId
    );

    updateTreeData({
      ...treeData,
      persons: nextPersons,
      relationships: nextRelations
    });

    if (inspectedPersonId === personId) {
      setInspectedPersonId(null);
    }
  };

  // Open add person with relative preset
  const handleAddRelative = (targetPersonId: string, role: RelativeRole) => {
    setEditingPerson(null);
    setDefaultRelativeTargetId(targetPersonId);
    setDefaultRelativeRole(role);
    setIsPersonModalOpen(true);
  };

  // Open edit modal for existing person
  const handleEditPerson = (person: Person) => {
    setEditingPerson(person);
    setDefaultRelativeTargetId(undefined);
    setDefaultRelativeRole(undefined);
    setIsPersonModalOpen(true);
  };

  // Quick select person
  const handleSelectPerson = (personId: string) => {
    setInspectedPersonId(personId);
  };

  // Master media archive operations
  const handleAddMediaToArchive = useCallback(async (newItems: MediaItem[]) => {
    const currentData = treeDataRef.current;
    const currentArchive = currentData.mediaArchive ? [...currentData.mediaArchive] : [];
    const existingIds = new Set(currentArchive.map((m) => m.id));
    const toAdd = newItems.filter((m) => !existingIds.has(m.id));
    const nextArchive = [...currentArchive, ...toAdd];
    const nextData = {
      ...currentData,
      mediaArchive: nextArchive
    };
    try {
      if (isTauriDesktop()) {
        for (const item of toAdd) await saveNativeArchiveMedia(item);
      } else {
        await saveFamilyTree(nextData);
      }
      treeDataRef.current = nextData;
      setTreeData(nextData);
      setSaveError(null);
    } catch (saveErr) {
      console.error('Failed to save media archive item:', saveErr);
      setSaveError('Не удалось сохранить файл в локальном архиве. Проверьте свободное место на диске и повторите попытку.');
      throw saveErr;
    }
  }, []);

  const handleUpdateFaceRecognitionData = useCallback(async (updatedPersons: Person[], updatedArchive: MediaItem[]) => {
    const nextData: FamilyTreeData = {
      ...treeDataRef.current,
      persons: updatedPersons,
      mediaArchive: updatedArchive,
    };
    treeDataRef.current = nextData;
    setTreeData(nextData);
    try {
      await saveFamilyTree(nextData);
      setSaveError(null);
    } catch (saveErr) {
      console.error('Failed to save face recognition changes:', saveErr);
      setSaveError('Не удалось сохранить результаты распознавания. Проверьте свободное место на диске и повторите попытку.');
      throw saveErr;
    }
  }, []);

  const handleDeleteMediaFromArchive = useCallback((mediaId: string) => {
    const nextArchive = (treeData.mediaArchive || []).filter((m) => m.id !== mediaId);
    const nextPersons = treeData.persons.map((p) => {
      if (!p.mediaFiles || !p.mediaFiles.some((m) => m.id === mediaId)) return p;
      return {
        ...p,
        mediaFiles: p.mediaFiles.filter((m) => m.id !== mediaId)
      };
    });
    updateTreeData({
      ...treeData,
      mediaArchive: nextArchive,
      persons: nextPersons
    });
  }, [treeData, updateTreeData]);

  // Focus person in tree
  const handleFocusInTree = (personId: string) => {
    setTreeFocusedPersonId(personId);
    setActiveView('tree');
  };

  // Reset to demo dynasty
  const handleResetToDemo = () => {
    setInspectedPersonId(null);
    setTreeFocusedPersonId(null);
    updateTreeData(INITIAL_DEMO_DATA);
    setActiveView('tree');
  };

  // Clear tree to start fresh
  const handleClearTree = () => {
    setInspectedPersonId(null);
    setTreeFocusedPersonId(null);
    updateTreeData(EMPTY_TREE_DATA);
    setActiveView('tree');
  };

  const inspectedPerson = treeData.persons.find((p) => p.id === inspectedPersonId) || null;

  if (loadError) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-stone-100 text-stone-700 p-6">
        <div role="alert" className="max-w-lg space-y-4">
          <h1 className="font-serif text-lg font-bold">Не удалось открыть семейный архив</h1>
          <p className="text-sm break-words">{loadError}</p>
          <p className="text-sm">Данные не заменены пустым деревом. Проверьте файлы архива и повторите загрузку.</p>
          <button onClick={() => window.location.reload()} className="rounded-lg bg-stone-900 px-4 py-2 text-sm text-white">
            Повторить загрузку
          </button>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-stone-100 text-stone-700">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-3 border-amber-600 border-t-transparent rounded-full animate-spin" />
          <p className="font-serif text-sm">Загрузка семейного архива...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-stone-100 font-sans">
      {/* 
        TOP BAR CONTRACT:
        [Brand title, one line] — [4-6 nav links, 1-2 word labels, single-line] — [1-2 primary actions]
      */}
      <header className="flex items-center justify-between px-4 sm:px-6 py-3 bg-stone-900 text-stone-100 border-b border-stone-800 z-30 select-none">
        {/* Zone 1: Single text element wordmark */}
        <div className="flex items-center gap-3">
          <a
            href={import.meta.env.BASE_URL}
            onClick={(e) => {
              e.preventDefault();
              setActiveView('tree');
            }}
            className="text-lg sm:text-xl font-serif font-bold tracking-tight text-amber-100 hover:text-white transition whitespace-nowrap"
          >
            Родословная
          </a>
        </div>

        {/* Zone 2: 4-5 clean text navigation links with subtle underline/active indicator */}
        <nav className="hidden md:flex items-center gap-6 text-xs font-medium text-stone-400">
          <button
            onClick={() => setActiveView('tree')}
            className={`transition-colors whitespace-nowrap ${
              activeView === 'tree' ? 'text-amber-300 font-semibold' : 'hover:text-stone-100'
            }`}
          >
            Древо
          </button>
          <button
            onClick={() => setActiveView('network')}
            className={`transition-colors whitespace-nowrap ${
              activeView === 'network' ? 'text-amber-300 font-semibold' : 'hover:text-stone-100'
            }`}
          >
            Карта связей
          </button>
          <button
            onClick={() => setActiveView('timeline')}
            className={`transition-colors whitespace-nowrap ${
              activeView === 'timeline' ? 'text-amber-300 font-semibold' : 'hover:text-stone-100'
            }`}
          >
            Хроника
          </button>
          <button
            onClick={() => setActiveView('archive')}
            className={`transition-colors whitespace-nowrap ${
              activeView === 'archive' ? 'text-amber-300 font-semibold' : 'hover:text-stone-100'
            }`}
          >
            Медиаархив
          </button>
          <button
            onClick={() => setActiveView('directory')}
            className={`transition-colors whitespace-nowrap ${
              activeView === 'directory' ? 'text-amber-300 font-semibold' : 'hover:text-stone-100'
            }`}
          >
            Картотека
          </button>
        </nav>

        {/* Zone 3: 1-2 primary actions */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* PWA Install Button */}
          <PWAInstallButton compact />

          {/* Backup / Export Menu trigger */}
          <button
            onClick={() => setIsBackupModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-stone-800 hover:bg-stone-700 text-stone-200 border border-stone-700 transition whitespace-nowrap"
            title="Управление архивом и Экспорт"
          >
            <Database className="w-3.5 h-3.5 text-amber-400" />
            <span className="hidden sm:inline">Архив</span>
          </button>

          {/* Primary Action CTA: Add Person */}
          <button
            onClick={() => {
              setEditingPerson(null);
              setDefaultRelativeTargetId(undefined);
              setDefaultRelativeRole(undefined);
              setIsPersonModalOpen(true);
            }}
            className="flex items-center gap-1.5 px-3 sm:px-4 py-1.5 text-xs font-medium rounded-lg bg-amber-500 hover:bg-amber-400 text-stone-950 font-semibold shadow-xs transition whitespace-nowrap active:scale-[0.98]"
          >
            <Plus className="w-4 h-4" />
            <span>Персона</span>
          </button>
        </div>
      </header>

      {saveError && (
        <div role="alert" className="px-4 py-2 text-xs font-medium bg-red-100 text-red-900 border-b border-red-200">
          {saveError}
        </div>
      )}

      {/* Main View Area */}
      <main className="flex-1 relative overflow-hidden">
        {activeView === 'tree' && (
          <FamilyTreeView
            persons={treeData.persons}
            relationships={treeData.relationships}
            onSelectPerson={handleSelectPerson}
            onAddRelative={handleAddRelative}
            focusedPersonId={treeFocusedPersonId}
            onAddFirstPerson={() => {
              setEditingPerson(null);
              setDefaultRelativeTargetId(undefined);
              setDefaultRelativeRole(undefined);
              setIsPersonModalOpen(true);
            }}
            onLoadDemo={handleResetToDemo}
          />
        )}

        {activeView === 'network' && (
          <NetworkGraphView
            persons={treeData.persons}
            relationships={treeData.relationships}
            onSelectPerson={handleSelectPerson}
            focusedPersonId={treeFocusedPersonId}
            onAddFirstPerson={() => {
              setEditingPerson(null);
              setDefaultRelativeTargetId(undefined);
              setDefaultRelativeRole(undefined);
              setIsPersonModalOpen(true);
            }}
          />
        )}

        {activeView === 'timeline' && (
          <TimelineView
            persons={treeData.persons}
            onSelectPerson={handleSelectPerson}
          />
        )}

        {activeView === 'archive' && (
          <ArchiveMediaView
            persons={treeData.persons}
            mediaArchive={treeData.mediaArchive || []}
            onSelectPerson={handleSelectPerson}
            onAddMediaToArchive={handleAddMediaToArchive}
            onDeleteMediaFromArchive={handleDeleteMediaFromArchive}
            onUpdateFaceRecognitionData={handleUpdateFaceRecognitionData}
            onUpdatePersons={(updatedPersons) => {
              updateTreeData({
                ...treeData,
                persons: updatedPersons
              });
            }}
          />
        )}

        {activeView === 'directory' && (
          <DirectoryView
            persons={treeData.persons}
            relationships={treeData.relationships}
            onSelectPerson={handleSelectPerson}
            onAddPerson={() => {
              setEditingPerson(null);
              setDefaultRelativeTargetId(undefined);
              setDefaultRelativeRole(undefined);
              setIsPersonModalOpen(true);
            }}
          />
        )}
      </main>

      {/* Mobile Fixed Bottom Navigation Bar (Natural Thumb Zone) */}
      <nav className="md:hidden grid grid-cols-5 items-center h-14 bg-stone-900 border-t border-stone-800 text-stone-400 z-30 select-none pb-safe">
        <button
          onClick={() => setActiveView('tree')}
          className={`flex flex-col items-center justify-center h-full transition ${
            activeView === 'tree' ? 'text-amber-400' : 'hover:text-stone-200'
          }`}
        >
          <GitFork className="w-4 h-4" />
          <span className="text-[10px] font-medium mt-0.5">Древо</span>
        </button>

        <button
          onClick={() => setActiveView('network')}
          className={`flex flex-col items-center justify-center h-full transition ${
            activeView === 'network' ? 'text-amber-400' : 'hover:text-stone-200'
          }`}
        >
          <Share2 className="w-4 h-4" />
          <span className="text-[10px] font-medium mt-0.5">Карта</span>
        </button>

        <button
          onClick={() => setActiveView('timeline')}
          className={`flex flex-col items-center justify-center h-full transition ${
            activeView === 'timeline' ? 'text-amber-400' : 'hover:text-stone-200'
          }`}
        >
          <Calendar className="w-4 h-4" />
          <span className="text-[10px] font-medium mt-0.5">Хроника</span>
        </button>

        <button
          onClick={() => setActiveView('archive')}
          className={`flex flex-col items-center justify-center h-full transition ${
            activeView === 'archive' ? 'text-amber-400' : 'hover:text-stone-200'
          }`}
        >
          <ImageIcon className="w-4 h-4" />
          <span className="text-[10px] font-medium mt-0.5">Архив</span>
        </button>

        <button
          onClick={() => setActiveView('directory')}
          className={`flex flex-col items-center justify-center h-full transition ${
            activeView === 'directory' ? 'text-amber-400' : 'hover:text-stone-200'
          }`}
        >
          <Users className="w-4 h-4" />
          <span className="text-[10px] font-medium mt-0.5">Люди</span>
        </button>
      </nav>

      {/* Person Detail Drawer */}
      {inspectedPerson && (
        <PersonDetailDrawer
          person={inspectedPerson}
          isOpen={!!inspectedPerson}
          onClose={() => setInspectedPersonId(null)}
          onEdit={handleEditPerson}
          onAddRelative={handleAddRelative}
          onSelectPerson={handleSelectPerson}
          allPersons={treeData.persons}
          relationships={treeData.relationships}
          mediaArchive={treeData.mediaArchive || []}
          onNavigateToArchive={() => setActiveView('archive')}
          onFocusInTree={handleFocusInTree}
          onDeleteRelationship={handleDeleteRelationship}
          onUpdatePerson={(updatedPerson) => {
            const nextPersons = treeData.persons.map((p) =>
              p.id === updatedPerson.id ? updatedPerson : p
            );
            const syncedPersons = syncTaggedMediaAcrossPersons(nextPersons);
            updateTreeData({
              ...treeData,
              persons: syncedPersons
            });
          }}
          onUpdateAllPersons={(updatedPersons) => {
            const syncedPersons = syncTaggedMediaAcrossPersons(updatedPersons);
            updateTreeData({
              ...treeData,
              persons: syncedPersons
            });
          }}
        />
      )}

      {/* Person Add / Edit Modal */}
      {isPersonModalOpen && (
        <PersonModal
          person={editingPerson}
          isOpen={isPersonModalOpen}
          onClose={() => {
            setIsPersonModalOpen(false);
            setEditingPerson(null);
            setDefaultRelativeTargetId(undefined);
            setDefaultRelativeRole(undefined);
          }}
          onSave={handleSavePerson}
          onDelete={handleDeletePerson}
          allPersons={treeData.persons}
          relationships={treeData.relationships}
          mediaArchive={treeData.mediaArchive || []}
          onNavigateToArchive={() => setActiveView('archive')}
          onOpenPerson={handleSelectPerson}
          defaultRelationshipTargetId={defaultRelativeTargetId}
          defaultRelationshipRole={defaultRelativeRole}
          onDeleteRelationship={handleDeleteRelationship}
        />
      )}

      {/* Backup and Export Modal */}
      {isBackupModalOpen && (
        <BackupModal
          isOpen={isBackupModalOpen}
          onClose={() => setIsBackupModalOpen(false)}
          treeData={treeData}
          onImportData={updateTreeData}
          onResetToDemo={handleResetToDemo}
          onClearTree={handleClearTree}
        />
      )}
    </div>
  );
}
