import React, { useState, useMemo, useRef } from 'react';
import { Person, MediaItem, MediaType, FaceTag } from '../../types/genealogy';
import { formatFullName, formatDisplayDate } from '../../utils/kinship';
import { 
  updateFaceSuggestionsAcrossTree, 
  syncTaggedMediaAcrossPersons,
  detectFacesInPhoto 
} from '../../services/faceRecognition';
import { PhotoFaceViewer } from '../media/PhotoFaceViewer';
import { SmartFaceRecognitionModal } from '../modals/SmartFaceRecognitionModal';
import { 
  Image as ImageIcon, 
  FileText, 
  Film, 
  Search, 
  Filter, 
  Download, 
  ExternalLink, 
  Plus, 
  Upload, 
  Trash2, 
  X, 
  FileCheck, 
  Scan, 
  Sparkles, 
  User, 
  UserCheck, 
  Unlink, 
  Check, 
  ChevronDown,
  FolderOpen
} from 'lucide-react';
import { getPortraitFaceStyle } from '../modals/PersonDetailDrawer';

interface ArchiveMediaViewProps {
  persons: Person[];
  mediaArchive?: MediaItem[];
  onSelectPerson: (personId: string) => void;
  onUpdatePersons?: (updatedPersons: Person[]) => void;
  onAddMediaToArchive?: (newItems: MediaItem[]) => void;
  onDeleteMediaFromArchive?: (mediaId: string) => void;
}

export const ArchiveMediaView: React.FC<ArchiveMediaViewProps> = ({
  persons,
  mediaArchive = [],
  onSelectPerson,
  onUpdatePersons,
  onAddMediaToArchive,
  onDeleteMediaFromArchive
}) => {
  const [selectedType, setSelectedType] = useState<MediaType | 'all'>('all');
  const [selectedPersonFilter, setSelectedPersonFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [lightboxMedia, setLightboxMedia] = useState<MediaItem | null>(null);
  const [isFaceRecognitionModalOpen, setIsFaceRecognitionModalOpen] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [showAttachDropdownMediaId, setShowAttachDropdownMediaId] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Master merged media archive pool (mediaArchive + any media currently attached to persons)
  const allMedia = useMemo(() => {
    const mediaMap = new Map<string, MediaItem>();

    // 1. From mediaArchive
    if (Array.isArray(mediaArchive)) {
      mediaArchive.forEach((m) => mediaMap.set(m.id, { ...m }));
    }

    // 2. From all persons' mediaFiles (merge faces/data if present)
    persons.forEach((p) => {
      if (Array.isArray(p.mediaFiles)) {
        p.mediaFiles.forEach((m) => {
          if (!mediaMap.has(m.id)) {
            mediaMap.set(m.id, { ...m });
          } else {
            const existing = mediaMap.get(m.id)!;
            if (m.faces && m.faces.length > 0 && (!existing.faces || existing.faces.length === 0)) {
              mediaMap.set(m.id, { ...existing, faces: m.faces });
            }
          }
        });
      }
    });

    return Array.from(mediaMap.values());
  }, [mediaArchive, persons]);

  // Helper to get all persons attached to a given media item
  const getAttachedPersons = (mediaId: string, itemFaces?: FaceTag[]): Person[] => {
    return persons.filter((p) => {
      const isInFiles = p.mediaFiles?.some((m) => m.id === mediaId);
      const isTaggedInFaces = itemFaces?.some((f) => f.personId === p.id);
      return Boolean(isInFiles || isTaggedInFaces);
    });
  };

  // Count pending face suggestions across all media
  const pendingSuggestionsCount = useMemo(() => {
    let count = 0;
    allMedia.forEach((m) => {
      if (m.faces) {
        m.faces.forEach((f) => {
          if (!f.isConfirmed && f.suggestedPersonId) count++;
        });
      }
    });
    return count;
  }, [allMedia]);

  // Filter media based on type, person, search
  const filteredMedia = useMemo(() => {
    return allMedia.filter((m) => {
      if (selectedType !== 'all' && m.type !== selectedType) return false;

      const attached = getAttachedPersons(m.id, m.faces);

      if (selectedPersonFilter === 'unattached') {
        if (attached.length > 0) return false;
      } else if (selectedPersonFilter !== 'all') {
        if (!attached.some((p) => p.id === selectedPersonFilter)) return false;
      }

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesName = m.name.toLowerCase().includes(q);
        const matchesCap = m.caption?.toLowerCase().includes(q);
        const matchesPerson = attached.some((p) =>
          formatFullName(p).toLowerCase().includes(q)
        );
        if (!matchesName && !matchesCap && !matchesPerson) return false;
      }

      return true;
    });
  }, [allMedia, selectedType, selectedPersonFilter, searchQuery, persons]);

  // Upload handler for multiple files
  const processUploadedFiles = async (files: FileList | File[]) => {
    if (!files || files.length === 0) return;
    setIsUploading(true);

    const newMediaItems: MediaItem[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const dataUrl = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target?.result as string);
        reader.readAsDataURL(file);
      });

      let type: MediaType = 'document';
      if (file.type.startsWith('image/')) type = 'photo';
      else if (file.type.startsWith('video/')) type = 'video';
      else if (file.type.startsWith('audio/')) type = 'audio';

      const mediaId = 'media-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6);
      let detectedFaces: FaceTag[] = [];

      // If photo, attempt quick background face scan
      if (type === 'photo') {
        try {
          detectedFaces = await detectFacesInPhoto(dataUrl, mediaId);
        } catch {
          // Ignore detector errors
        }
      }

      newMediaItems.push({
        id: mediaId,
        type,
        name: file.name.replace(/\.[^/.]+$/, ''),
        date: new Date().toISOString().slice(0, 10),
        dataUrl,
        mimeType: file.type,
        size: file.size,
        faces: detectedFaces
      });
    }

    if (onAddMediaToArchive) {
      onAddMediaToArchive(newMediaItems);
    }
    setIsUploading(false);
  };

  // Drag and drop handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      await processUploadedFiles(e.dataTransfer.files);
    }
  };

  // Attach a person to media
  const handleAttachPersonToMedia = (media: MediaItem, personId: string) => {
    if (!onUpdatePersons) return;

    const targetPerson = persons.find((p) => p.id === personId);
    if (!targetPerson) return;

    const alreadyAttached = targetPerson.mediaFiles?.some((m) => m.id === media.id);
    if (alreadyAttached) return;

    const updatedMedia = targetPerson.mediaFiles ? [...targetPerson.mediaFiles, media] : [media];
    const nextPersons = persons.map((p) => (p.id === personId ? { ...p, mediaFiles: updatedMedia } : p));
    const synced = syncTaggedMediaAcrossPersons(nextPersons);
    onUpdatePersons(synced);
    setShowAttachDropdownMediaId(null);
  };

  // Detach a person from media
  const handleDetachPersonFromMedia = (mediaId: string, personId: string) => {
    if (!onUpdatePersons) return;

    const nextPersons = persons.map((p) => {
      if (p.id !== personId) return p;
      const filtered = (p.mediaFiles || []).filter((m) => m.id !== mediaId);
      return { ...p, mediaFiles: filtered };
    });

    // Also remove face assignment if tagged
    const cleanedPersons = nextPersons.map((p) => {
      if (!p.mediaFiles) return p;
      return {
        ...p,
        mediaFiles: p.mediaFiles.map((m) => {
          if (m.id === mediaId && m.faces) {
            return {
              ...m,
              faces: m.faces.map((f) => (f.personId === personId ? { ...f, personId: undefined, isConfirmed: false } : f))
            };
          }
          return m;
        })
      };
    });

    const synced = syncTaggedMediaAcrossPersons(cleanedPersons);
    onUpdatePersons(synced);
  };

  // Delete media permanently from archive
  const handleDeleteMedia = (mediaId: string) => {
    if (onDeleteMediaFromArchive) {
      onDeleteMediaFromArchive(mediaId);
    }
    setConfirmDeleteId(null);
    if (lightboxMedia?.id === mediaId) {
      setLightboxMedia(null);
    }
  };

  return (
    <div 
      className="relative w-full h-full flex flex-col bg-stone-100 overflow-hidden"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Drag & Drop Overlay */}
      {isDragging && (
        <div className="absolute inset-0 z-40 bg-amber-500/20 backdrop-blur-xs border-4 border-dashed border-amber-600 flex flex-col items-center justify-center pointer-events-none animate-in fade-in">
          <Upload className="w-16 h-16 text-amber-700 animate-bounce mb-3" />
          <p className="text-lg font-bold text-stone-900 font-serif">
            Отпустите файлы для загрузки в медиаархив
          </p>
          <p className="text-xs text-stone-600 mt-1">
            Фотографии, сканы документов, видео и аудиофайлы
          </p>
        </div>
      )}

      {/* Top Filter and Actions Bar */}
      <div className="p-4 sm:p-5 bg-white border-b border-stone-200 flex flex-wrap items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
          <button
            type="button"
            onClick={() => setSelectedType('all')}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition whitespace-nowrap ${
              selectedType === 'all'
                ? 'bg-stone-900 text-stone-100'
                : 'bg-stone-100 text-stone-600 hover:text-stone-900 hover:bg-stone-200'
            }`}
          >
            Все материалы ({allMedia.length})
          </button>
          <button
            type="button"
            onClick={() => setSelectedType('photo')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition whitespace-nowrap ${
              selectedType === 'photo'
                ? 'bg-stone-900 text-stone-100'
                : 'bg-stone-100 text-stone-600 hover:text-stone-900 hover:bg-stone-200'
            }`}
          >
            <ImageIcon className="w-3.5 h-3.5" />
            <span>Фотографии</span>
          </button>
          <button
            type="button"
            onClick={() => setSelectedType('document')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition whitespace-nowrap ${
              selectedType === 'document'
                ? 'bg-stone-900 text-stone-100'
                : 'bg-stone-100 text-stone-600 hover:text-stone-900 hover:bg-stone-200'
            }`}
          >
            <FileCheck className="w-3.5 h-3.5" />
            <span>Документы & Сканы</span>
          </button>
          <button
            type="button"
            onClick={() => setSelectedType('video')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition whitespace-nowrap ${
              selectedType === 'video'
                ? 'bg-stone-900 text-stone-100'
                : 'bg-stone-100 text-stone-600 hover:text-stone-900 hover:bg-stone-200'
            }`}
          >
            <Film className="w-3.5 h-3.5" />
            <span>Видео</span>
          </button>
        </div>

        <div className="flex items-center gap-2 flex-1 sm:flex-initial justify-end flex-wrap">
          {/* Main Upload Button */}
          <label className="cursor-pointer inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-semibold text-xs shadow-xs transition whitespace-nowrap">
            <Upload className="w-3.5 h-3.5" />
            <span>{isUploading ? 'Загрузка...' : '+ Загрузить в архив'}</span>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              disabled={isUploading}
              accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.txt"
              onChange={(e) => {
                if (e.target.files) {
                  processUploadedFiles(e.target.files);
                  e.target.value = '';
                }
              }}
              className="hidden"
            />
          </label>

          {/* Smart Face Recognition Trigger Button */}
          <button
            type="button"
            onClick={() => setIsFaceRecognitionModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/40 text-amber-900 font-semibold text-xs transition shadow-2xs"
            title="Открыть умное распознавание лиц (AI)"
          >
            <Scan className="w-3.5 h-3.5 text-amber-700" />
            <span>Распознавание лиц (AI)</span>
            {pendingSuggestionsCount > 0 && (
              <span className="px-1.5 py-0.2 rounded-full bg-amber-600 text-white text-[10px] font-bold animate-pulse">
                +{pendingSuggestionsCount}
              </span>
            )}
          </button>

          {/* Search box */}
          <div className="relative flex-1 sm:w-48">
            <Search className="absolute left-2.5 top-2 w-3.5 h-3.5 text-stone-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Поиск по архиву..."
              className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg bg-stone-50 border border-stone-200 text-stone-900 focus:outline-none focus:ring-1 focus:ring-amber-500"
            />
          </div>

          {/* Person filter */}
          <select
            value={selectedPersonFilter}
            onChange={(e) => setSelectedPersonFilter(e.target.value)}
            className="py-1.5 px-2.5 text-xs rounded-lg bg-stone-50 border border-stone-200 text-stone-800"
          >
            <option value="all">Все персоналии</option>
            <option value="unattached">Только не привязанные</option>
            {persons.map((p) => (
              <option key={p.id} value={p.id}>
                {formatFullName(p, { format: 'short' })}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Grid of Archive Media */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        {filteredMedia.length === 0 ? (
          <div className="text-center py-20 bg-white rounded-2xl border border-stone-200 p-8 max-w-lg mx-auto shadow-2xs">
            <FolderOpen className="w-14 h-14 text-stone-300 mx-auto mb-3" />
            <h3 className="text-base font-bold text-stone-800 font-serif">Медиафайлы не найдены</h3>
            <p className="text-xs text-stone-500 mt-1.5 max-w-sm mx-auto leading-relaxed">
              Нажмите кнопку <strong>«+ Загрузить в архив»</strong> выше или просто перетащите файлы с вашего компьютера в это окно.
            </p>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-stone-900 hover:bg-stone-800 text-white text-xs font-semibold shadow-xs transition"
            >
              <Upload className="w-4 h-4" />
              <span>Выбрать файлы на устройстве</span>
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {filteredMedia.map((item) => {
              const attached = getAttachedPersons(item.id, item.faces);
              const isAttachOpen = showAttachDropdownMediaId === item.id;

              return (
                <div
                  key={item.id}
                  onClick={() => setLightboxMedia(item)}
                  className="group relative cursor-pointer rounded-2xl overflow-hidden bg-white border border-stone-200 shadow-2xs hover:shadow-md transition flex flex-col"
                >
                  {/* Media Preview Box */}
                  <div className="h-44 bg-stone-100 flex items-center justify-center overflow-hidden relative">
                    {item.type === 'photo' ? (
                      <img
                        src={item.dataUrl}
                        alt={item.name}
                        className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                        style={getPortraitFaceStyle(item.faces?.[0]?.box)}
                      />
                    ) : item.type === 'video' ? (
                      <div className="flex flex-col items-center gap-1.5 text-amber-800">
                        <Film className="w-10 h-10" />
                        <span className="text-[11px] font-semibold uppercase tracking-wider">Видеозапись</span>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center gap-1.5 text-stone-700">
                        <FileCheck className="w-10 h-10" />
                        <span className="text-[11px] font-semibold uppercase tracking-wider">Документ / Скан</span>
                      </div>
                    )}

                    {/* Top right badges */}
                    <div className="absolute top-2 right-2 flex items-center gap-1">
                      {item.faces && item.faces.length > 0 && (
                        <span className="px-2 py-0.5 rounded-md bg-stone-950/85 text-white text-[10px] font-medium backdrop-blur-xs flex items-center gap-1 shadow-xs border border-white/10">
                          <User className="w-3 h-3 text-amber-400" />
                          <span>{item.faces.length}</span>
                        </span>
                      )}
                      {item.faces?.some((f) => !f.isConfirmed && f.suggestedPersonId) && (
                        <span className="px-1.5 py-0.5 rounded-md bg-amber-500 text-stone-950 text-[10px] font-bold backdrop-blur-xs flex items-center gap-0.5 animate-pulse shadow-xs">
                          <Sparkles className="w-2.5 h-2.5" />
                        </span>
                      )}
                      <span className="px-2 py-0.5 rounded-md bg-stone-900/80 text-white text-[10px] font-medium backdrop-blur-xs">
                        {item.type === 'photo' ? 'Фото' : item.type === 'video' ? 'Видео' : 'Документ'}
                      </span>
                    </div>

                    {/* Delete button on hover */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setConfirmDeleteId(item.id);
                      }}
                      className="absolute top-2 left-2 p-1.5 rounded-lg bg-black/60 hover:bg-rose-600 text-white/80 hover:text-white transition opacity-0 group-hover:opacity-100 shadow-xs"
                      title="Удалить файл из медиаархива"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* Details */}
                  <div className="p-3.5 flex-1 flex flex-col justify-between">
                    <div>
                      <h4 className="text-xs font-bold text-stone-900 truncate leading-snug group-hover:text-amber-900 transition">
                        {item.name}
                      </h4>
                      {item.caption && (
                        <p className="text-[11px] text-stone-600 line-clamp-2 mt-1">
                          {item.caption}
                        </p>
                      )}
                    </div>

                    {/* Attached Persons Row */}
                    <div className="pt-2.5 mt-2.5 border-t border-stone-100 space-y-1.5">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="text-stone-400 text-[10px] font-medium">Прикреплено к:</span>
                        <div className="relative">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setShowAttachDropdownMediaId(isAttachOpen ? null : item.id);
                            }}
                            className="text-[10px] font-semibold text-amber-800 hover:text-amber-950 flex items-center gap-0.5 transition"
                            title="Привязать к персоне из древа"
                          >
                            <Plus className="w-3 h-3" />
                            <span>Привязать</span>
                          </button>

                          {/* Quick attach dropdown */}
                          {isAttachOpen && (
                            <div 
                              onClick={(e) => e.stopPropagation()}
                              className="absolute right-0 bottom-full mb-1 w-52 bg-white rounded-xl shadow-xl border border-stone-200 p-2 z-30 max-h-48 overflow-y-auto"
                            >
                              <p className="text-[10px] font-bold text-stone-500 uppercase px-2 py-1">
                                Выберите персону:
                              </p>
                              {persons.map((p) => {
                                const isAlready = attached.some((a) => a.id === p.id);
                                return (
                                  <button
                                    key={p.id}
                                    type="button"
                                    onClick={() => handleAttachPersonToMedia(item, p.id)}
                                    className={`w-full text-left px-2 py-1.5 text-xs rounded-lg flex items-center justify-between transition ${
                                      isAlready ? 'bg-amber-50 text-amber-900 font-semibold' : 'hover:bg-stone-100 text-stone-800'
                                    }`}
                                  >
                                    <span className="truncate">{formatFullName(p, { format: 'short' })}</span>
                                    {isAlready && <Check className="w-3 h-3 text-amber-600" />}
                                  </button>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Chips of attached persons */}
                      {attached.length === 0 ? (
                        <p className="text-[10px] text-stone-400 italic">Не привязано к персоналиям</p>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {attached.map((p) => (
                            <span
                              key={p.id}
                              onClick={(e) => {
                                e.stopPropagation();
                                onSelectPerson(p.id);
                              }}
                              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] bg-amber-50 border border-amber-200/80 text-amber-900 font-medium hover:bg-amber-100 transition"
                              title={`Открыть карточку ${formatFullName(p)}`}
                            >
                              <User className="w-2.5 h-2.5 text-amber-700" />
                              <span className="truncate max-w-[100px]">{formatFullName(p, { format: 'short' })}</span>
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Delete Confirmation Modal */}
      {confirmDeleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-2xs animate-in fade-in">
          <div className="w-full max-w-sm bg-white rounded-2xl shadow-xl p-5 border border-stone-200">
            <div className="w-10 h-10 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center mb-3">
              <Trash2 className="w-5 h-5" />
            </div>
            <h3 className="text-sm font-bold text-stone-900">Удалить файл из архива?</h3>
            <p className="text-xs text-stone-500 mt-1 leading-relaxed">
              Файл будет полностью удален из общего медиаархива и откреплен от всех связанных персоналий.
            </p>
            <div className="flex items-center justify-end gap-2 mt-4">
              <button
                type="button"
                onClick={() => setConfirmDeleteId(null)}
                className="px-3 py-1.5 text-xs font-medium text-stone-600 hover:text-stone-900 hover:bg-stone-100 rounded-lg transition"
              >
                Отмена
              </button>
              <button
                type="button"
                onClick={() => handleDeleteMedia(confirmDeleteId)}
                className="px-3.5 py-1.5 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-lg shadow-xs transition"
              >
                Удалить
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Lightbox Viewer with Attached Persons Manager */}
      {lightboxMedia && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4 animate-in fade-in"
          onClick={() => setLightboxMedia(null)}
        >
          <div
            className="w-full max-w-4xl max-h-[92vh] bg-stone-950 rounded-2xl overflow-hidden border border-stone-800 flex flex-col text-white"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Lightbox header */}
            <div className="flex items-center justify-between px-5 py-3 border-b border-stone-800">
              <div className="min-w-0 pr-3">
                <h3 className="text-sm font-semibold truncate">{lightboxMedia.name}</h3>
                <p className="text-xs text-stone-400">
                  {lightboxMedia.date ? formatDisplayDate(lightboxMedia.date) : 'Без даты'}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setConfirmDeleteId(lightboxMedia.id)}
                  className="p-1.5 text-stone-400 hover:text-rose-400 hover:bg-stone-800 rounded-lg transition"
                  title="Удалить из архива"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
                <a
                  href={lightboxMedia.dataUrl}
                  download={lightboxMedia.name}
                  className="p-1.5 text-stone-400 hover:text-white hover:bg-stone-800 rounded-lg transition"
                  title="Скачать файл"
                >
                  <Download className="w-4 h-4" />
                </a>
                <button
                  type="button"
                  onClick={() => setLightboxMedia(null)}
                  className="p-1.5 text-stone-400 hover:text-white hover:bg-stone-800 rounded-lg transition"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Media content */}
            <div className="flex-1 overflow-auto max-h-[65vh]">
              {lightboxMedia.type === 'photo' ? (
                <PhotoFaceViewer
                  media={lightboxMedia}
                  allPersons={persons}
                  onSetAvatar={(croppedAvatar, destPersonId) => {
                    if (!onUpdatePersons) return;
                    const targetId = destPersonId || persons[0]?.id;
                    if (!targetId) return;
                    const updatedList = persons.map((p) =>
                      p.id === targetId ? { ...p, avatarUrl: croppedAvatar } : p
                    );
                    onUpdatePersons(updatedList);
                  }}
                  onSelectPerson={(pId) => {
                    setLightboxMedia(null);
                    onSelectPerson(pId);
                  }}
                  onUpdateFaces={(updatedFaces) => {
                    if (!onUpdatePersons) return;
                    setLightboxMedia((prev) => (prev ? { ...prev, faces: updatedFaces } : null));

                    const updatedPersons = persons.map((p) => {
                      if (!p.mediaFiles || !p.mediaFiles.some((m) => m.id === lightboxMedia.id)) return p;
                      const updatedMedia = p.mediaFiles.map((m) => {
                        if (m.id === lightboxMedia.id) {
                          return { ...m, faces: updatedFaces };
                        }
                        return m;
                      });
                      return { ...p, mediaFiles: updatedMedia };
                    });

                    const { updatedPersons: matchedPersons } = updateFaceSuggestionsAcrossTree(updatedPersons);
                    const finalPersons = syncTaggedMediaAcrossPersons(matchedPersons);
                    onUpdatePersons(finalPersons);
                  }}
                />
              ) : lightboxMedia.type === 'video' ? (
                <div className="p-4 flex items-center justify-center">
                  <video
                    src={lightboxMedia.dataUrl}
                    controls
                    className="max-h-[60vh] w-auto rounded-lg shadow-xl"
                  />
                </div>
              ) : (
                <div className="text-center p-8 bg-stone-900 rounded-xl border border-stone-800 m-4">
                  <FileCheck className="w-16 h-16 text-amber-500 mx-auto mb-3" />
                  <p className="text-sm font-medium">{lightboxMedia.name}</p>
                  {lightboxMedia.caption && (
                    <p className="text-xs text-stone-400 mt-2 max-w-md mx-auto">{lightboxMedia.caption}</p>
                  )}
                  <a
                    href={lightboxMedia.dataUrl}
                    download={lightboxMedia.name}
                    className="inline-flex items-center gap-2 mt-4 px-4 py-2 bg-stone-800 hover:bg-stone-700 rounded-lg text-xs font-medium text-white transition"
                  >
                    <Download className="w-4 h-4" />
                    <span>Скачать документ</span>
                  </a>
                </div>
              )}
            </div>

            {/* Attached Persons Management Bar in Lightbox */}
            <div className="px-5 py-3 bg-stone-900 border-t border-stone-800 flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-stone-400 font-medium">Прикреплено к карточкам:</span>
                {(() => {
                  const attached = getAttachedPersons(lightboxMedia.id, lightboxMedia.faces);
                  if (attached.length === 0) {
                    return <span className="text-stone-500 italic">Ни к кому не прикреплено</span>;
                  }
                  return attached.map((p) => (
                    <span
                      key={p.id}
                      className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-stone-800 border border-stone-700 text-stone-200 font-medium"
                    >
                      <span>{formatFullName(p, { format: 'short' })}</span>
                      <button
                        type="button"
                        onClick={() => handleDetachPersonFromMedia(lightboxMedia.id, p.id)}
                        className="text-stone-400 hover:text-rose-400 transition"
                        title="Открепить от этой персоны"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ));
                })()}
              </div>

              {/* Quick attach selector */}
              <div className="flex items-center gap-2">
                <select
                  defaultValue=""
                  onChange={(e) => {
                    if (e.target.value) {
                      handleAttachPersonToMedia(lightboxMedia, e.target.value);
                      e.target.value = '';
                    }
                  }}
                  className="px-2.5 py-1 text-xs rounded-lg bg-stone-800 border border-stone-700 text-stone-200 focus:outline-none focus:ring-1 focus:ring-amber-500"
                >
                  <option value="" disabled>
                    + Прикрепить к персоналии...
                  </option>
                  {persons.map((p) => (
                    <option key={p.id} value={p.id}>
                      {formatFullName(p, { format: 'natural' })}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Smart Face Recognition Modal */}
      {isFaceRecognitionModalOpen && (
        <SmartFaceRecognitionModal
          isOpen={isFaceRecognitionModalOpen}
          onClose={() => setIsFaceRecognitionModalOpen(false)}
          persons={persons}
          onUpdatePersons={(updated) => {
            if (onUpdatePersons) onUpdatePersons(updated);
          }}
          onSelectPerson={onSelectPerson}
        />
      )}
    </div>
  );
};
