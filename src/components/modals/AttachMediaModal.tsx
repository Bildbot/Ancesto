import React, { useState, useMemo } from 'react';
import { Person, MediaItem, MediaType, FaceTag } from '../../types/genealogy';
import { formatFullName } from '../../utils/kinship';
import { 
  X, 
  Check, 
  Image as ImageIcon, 
  FileCheck, 
  Film, 
  Search, 
  FolderPlus, 
  UserCheck, 
  ExternalLink,
  Plus,
  CheckCircle2,
  Filter
} from 'lucide-react';
import { getPortraitFaceStyle } from './PersonDetailDrawer';

interface AttachMediaModalProps {
  isOpen: boolean;
  onClose: () => void;
  targetPerson: Person;
  allPersons: Person[];
  mediaArchive: MediaItem[];
  currentlyAttachedIds: string[];
  onSaveAttachments: (selectedMediaIds: string[]) => void;
  onNavigateToArchive?: () => void;
}

export const AttachMediaModal: React.FC<AttachMediaModalProps> = ({
  isOpen,
  onClose,
  targetPerson,
  allPersons,
  mediaArchive,
  currentlyAttachedIds,
  onSaveAttachments,
  onNavigateToArchive
}) => {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set(currentlyAttachedIds));
  const [filterType, setFilterType] = useState<MediaType | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [onlyUnattached, setOnlyUnattached] = useState(false);

  // Sync selectedIds when opened
  React.useEffect(() => {
    setSelectedIds(new Set(currentlyAttachedIds));
  }, [currentlyAttachedIds, isOpen]);

  // Filter archive items
  const filteredItems = useMemo(() => {
    return mediaArchive.filter((item) => {
      if (filterType !== 'all' && item.type !== filterType) return false;

      if (onlyUnattached && selectedIds.has(item.id)) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesName = item.name.toLowerCase().includes(q);
        const matchesCaption = item.caption?.toLowerCase().includes(q);
        const matchesDate = item.date?.toLowerCase().includes(q);
        if (!matchesName && !matchesCaption && !matchesDate) return false;
      }

      return true;
    });
  }, [mediaArchive, filterType, searchQuery, onlyUnattached, selectedIds]);

  if (!isOpen) return null;

  const toggleItem = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleSelectAllFiltered = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      filteredItems.forEach((item) => next.add(item.id));
      return next;
    });
  };

  const handleDeselectAllFiltered = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      filteredItems.forEach((item) => next.delete(item.id));
      return next;
    });
  };

  const handleSave = () => {
    onSaveAttachments(Array.from(selectedIds));
    onClose();
  };

  const personName = formatFullName(targetPerson);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/80 backdrop-blur-xs animate-in fade-in">
      <div 
        className="relative w-full max-w-4xl max-h-[92vh] bg-stone-50 rounded-2xl shadow-2xl flex flex-col overflow-hidden border border-stone-200"
        role="dialog"
      >
        {/* Header */}
        <div className="px-5 py-4 bg-white border-b border-stone-200 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-800 shrink-0">
              <FolderPlus className="w-5 h-5 text-amber-700" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-bold text-stone-900 truncate font-serif">
                Прикрепить медиафайлы из архива
              </h2>
              <p className="text-xs text-stone-500 truncate">
                Для персоны: <span className="font-semibold text-stone-800">{personName}</span>
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg text-stone-400 hover:text-stone-700 hover:bg-stone-100 transition"
            title="Закрыть"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Filters and search bar */}
        <div className="p-3 sm:px-5 sm:py-3 bg-white border-b border-stone-200 flex flex-wrap items-center justify-between gap-2.5">
          {/* Type filters */}
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
            <button
              type="button"
              onClick={() => setFilterType('all')}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition whitespace-nowrap ${
                filterType === 'all'
                  ? 'bg-stone-900 text-stone-100'
                  : 'bg-stone-100 text-stone-600 hover:text-stone-900 hover:bg-stone-200'
              }`}
            >
              Все файлы ({mediaArchive.length})
            </button>
            <button
              type="button"
              onClick={() => setFilterType('photo')}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition whitespace-nowrap ${
                filterType === 'photo'
                  ? 'bg-stone-900 text-stone-100'
                  : 'bg-stone-100 text-stone-600 hover:text-stone-900 hover:bg-stone-200'
              }`}
            >
              <ImageIcon className="w-3.5 h-3.5" />
              <span>Фото</span>
            </button>
            <button
              type="button"
              onClick={() => setFilterType('document')}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition whitespace-nowrap ${
                filterType === 'document'
                  ? 'bg-stone-900 text-stone-100'
                  : 'bg-stone-100 text-stone-600 hover:text-stone-900 hover:bg-stone-200'
              }`}
            >
              <FileCheck className="w-3.5 h-3.5" />
              <span>Документы</span>
            </button>
            <button
              type="button"
              onClick={() => setFilterType('video')}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition whitespace-nowrap ${
                filterType === 'video'
                  ? 'bg-stone-900 text-stone-100'
                  : 'bg-stone-100 text-stone-600 hover:text-stone-900 hover:bg-stone-200'
              }`}
            >
              <Film className="w-3.5 h-3.5" />
              <span>Видео</span>
            </button>
          </div>

          {/* Search box & toggle */}
          <div className="flex items-center gap-2 flex-1 sm:flex-initial justify-end">
            <div className="relative w-full sm:w-48">
              <Search className="absolute left-2.5 top-2 w-3.5 h-3.5 text-stone-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Поиск по названию..."
                className="w-full pl-8 pr-2.5 py-1 text-xs rounded-lg bg-stone-50 border border-stone-200 text-stone-900 focus:outline-none focus:ring-1 focus:ring-amber-500"
              />
            </div>
            <label className="flex items-center gap-1.5 text-[11px] text-stone-600 cursor-pointer select-none whitespace-nowrap">
              <input
                type="checkbox"
                checked={onlyUnattached}
                onChange={(e) => setOnlyUnattached(e.target.checked)}
                className="rounded border-stone-300 text-amber-600 focus:ring-amber-500"
              />
              <span>Неприкрепленные</span>
            </label>
          </div>
        </div>

        {/* Quick select helpers */}
        <div className="px-5 py-2 bg-stone-100/70 border-b border-stone-200 flex items-center justify-between text-xs text-stone-500">
          <span>Найдено в архиве: {filteredItems.length}</span>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleSelectAllFiltered}
              className="text-amber-800 hover:text-amber-950 font-medium hover:underline text-[11px]"
            >
              Выбрать все показанные
            </button>
            <span className="text-stone-300">·</span>
            <button
              type="button"
              onClick={handleDeselectAllFiltered}
              className="text-stone-500 hover:text-stone-800 hover:underline text-[11px]"
            >
              Снять выбор с показанных
            </button>
          </div>
        </div>

        {/* Body Grid */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5">
          {mediaArchive.length === 0 ? (
            <div className="text-center py-16 bg-white rounded-2xl border border-dashed border-stone-300 p-8 max-w-md mx-auto">
              <ImageIcon className="w-12 h-12 text-stone-300 mx-auto mb-3" />
              <h3 className="text-sm font-bold text-stone-800">Медиаархив пока пуст</h3>
              <p className="text-xs text-stone-500 mt-1.5 leading-relaxed">
                Все фотографии, документы и сканы добавляются через центральный раздел «Медиаархив» в верхнем меню.
              </p>
              {onNavigateToArchive && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onNavigateToArchive();
                  }}
                  className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold shadow-xs transition"
                >
                  <ExternalLink className="w-4 h-4" />
                  <span>Перейти в Медиаархив для загрузки</span>
                </button>
              )}
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="text-center py-12 text-stone-500 bg-white rounded-xl border border-stone-200">
              <p className="text-xs">По заданным фильтрам файлы не найдены</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {filteredItems.map((item) => {
                const isSelected = selectedIds.has(item.id);
                const isAlreadyTagged = item.faces?.some((f: FaceTag) => f.personId === targetPerson.id);
                const face = item.faces?.find((f: FaceTag) => f.personId === targetPerson.id);

                return (
                  <div
                    key={item.id}
                    onClick={() => toggleItem(item.id)}
                    className={`group relative rounded-xl overflow-hidden border cursor-pointer transition select-none flex flex-col bg-white ${
                      isSelected
                        ? 'border-amber-500 ring-2 ring-amber-500/40 shadow-sm'
                        : 'border-stone-200 hover:border-stone-300 shadow-2xs hover:shadow-xs'
                    }`}
                  >
                    {/* Thumbnail preview */}
                    <div className="h-28 bg-stone-100 flex items-center justify-center overflow-hidden relative">
                      {item.type === 'photo' ? (
                        <img
                          src={item.dataUrl}
                          alt={item.name}
                          className="w-full h-full object-cover object-center group-hover:scale-105 transition duration-200"
                          style={getPortraitFaceStyle(face?.box)}
                        />
                      ) : item.type === 'video' ? (
                        <div className="flex flex-col items-center gap-1 text-amber-700">
                          <Film className="w-7 h-7" />
                          <span className="text-[9px] font-medium uppercase">Видео</span>
                        </div>
                      ) : (
                        <div className="flex flex-col items-center gap-1 text-stone-700">
                          <FileCheck className="w-7 h-7" />
                          <span className="text-[9px] font-medium uppercase">Документ</span>
                        </div>
                      )}

                      {/* Selection checkbox overlay */}
                      <div className="absolute top-2 left-2 z-10">
                        <div
                          className={`w-5 h-5 rounded-md flex items-center justify-center transition border shadow-xs ${
                            isSelected
                              ? 'bg-amber-600 border-amber-600 text-white'
                              : 'bg-white/90 border-stone-300 text-transparent hover:border-amber-400'
                          }`}
                        >
                          <Check className="w-3.5 h-3.5 stroke-[3]" />
                        </div>
                      </div>

                      {/* Tagged face badge */}
                      {isAlreadyTagged && (
                        <span className="absolute bottom-1.5 left-1.5 px-1.5 py-0.5 rounded bg-emerald-950/85 text-emerald-300 text-[9px] font-bold shadow-xs flex items-center gap-0.5 backdrop-blur-2xs border border-emerald-500/40">
                          <UserCheck className="w-2.5 h-2.5" />
                          <span>На фото</span>
                        </span>
                      )}
                    </div>

                    {/* Metadata */}
                    <div className="p-2.5 flex-1 flex flex-col justify-between">
                      <div>
                        <p className="text-xs font-semibold text-stone-900 truncate" title={item.name}>
                          {item.name}
                        </p>
                        {item.date && (
                          <p className="text-[10px] text-stone-400 mt-0.5">{item.date}</p>
                        )}
                        {item.caption && (
                          <p className="text-[10px] text-stone-600 line-clamp-1 mt-0.5">
                            {item.caption}
                          </p>
                        )}
                      </div>

                      <div className="mt-2 pt-1 border-t border-stone-100 flex items-center justify-between text-[10px]">
                        <span className={isSelected ? 'text-amber-800 font-bold' : 'text-stone-400'}>
                          {isSelected ? 'Прикреплен' : 'Нажмите, чтобы прикрепить'}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div className="px-5 py-3.5 bg-white border-t border-stone-200 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-stone-700">
              Выбрано: <strong>{selectedIds.size}</strong> из {mediaArchive.length}
            </span>
            {onNavigateToArchive && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onNavigateToArchive();
                }}
                className="text-[11px] text-amber-800 hover:text-amber-950 font-semibold hover:underline flex items-center gap-1 ml-2"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Загрузить новые файлы в архив</span>
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-medium text-stone-600 hover:text-stone-900 hover:bg-stone-100 transition"
            >
              Отмена
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="px-5 py-2 rounded-xl text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white shadow-xs transition flex items-center gap-1.5"
            >
              <Check className="w-4 h-4" />
              <span>Сохранить привязку ({selectedIds.size})</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
