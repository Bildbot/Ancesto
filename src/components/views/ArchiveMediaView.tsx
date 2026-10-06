import React, { useState, useMemo } from 'react';
import { Person, MediaItem, MediaType, FaceTag } from '../../types/genealogy';
import { formatFullName, formatDisplayDate } from '../../utils/kinship';
import { updateFaceSuggestionsAcrossTree, syncTaggedMediaAcrossPersons } from '../../services/faceRecognition';
import { PhotoFaceViewer } from '../media/PhotoFaceViewer';
import { SmartFaceRecognitionModal } from '../modals/SmartFaceRecognitionModal';
import { 
  Image as ImageIcon, 
  FileText, 
  Film, 
  Music, 
  Search, 
  Filter, 
  Download, 
  ExternalLink,
  Plus,
  X,
  FileCheck,
  Scan,
  Sparkles,
  User
} from 'lucide-react';

interface ArchiveMediaViewProps {
  persons: Person[];
  onSelectPerson: (personId: string) => void;
  onUploadMediaToPerson?: (personId: string) => void;
  onUpdatePersons?: (updatedPersons: Person[]) => void;
}

interface EnrichedMediaItem extends MediaItem {
  person: Person;
}

export const ArchiveMediaView: React.FC<ArchiveMediaViewProps> = ({
  persons,
  onSelectPerson,
  onUploadMediaToPerson,
  onUpdatePersons
}) => {
  const [selectedType, setSelectedType] = useState<MediaType | 'all'>('all');
  const [selectedPersonId, setSelectedPersonId] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [lightboxMedia, setLightboxMedia] = useState<EnrichedMediaItem | null>(null);
  const [isFaceRecognitionModalOpen, setIsFaceRecognitionModalOpen] = useState(false);

  // Flatten media items across all persons
  const allMedia = useMemo(() => {
    const list: EnrichedMediaItem[] = [];
    persons.forEach(person => {
      if (person.mediaFiles) {
        person.mediaFiles.forEach(media => {
          list.push({ ...media, person });
        });
      }
    });
    return list;
  }, [persons]);

  // Count pending face suggestions across all media
  const pendingSuggestionsCount = useMemo(() => {
    let count = 0;
    allMedia.forEach(m => {
      if (m.faces) {
        m.faces.forEach(f => {
          if (!f.isConfirmed && f.suggestedPersonId) count++;
        });
      }
    });
    return count;
  }, [allMedia]);

  // Filter media
  const filteredMedia = useMemo(() => {
    return allMedia.filter(m => {
      if (selectedType !== 'all' && m.type !== selectedType) return false;
      if (selectedPersonId !== 'all' && m.person.id !== selectedPersonId) return false;

      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const matchesName = m.name.toLowerCase().includes(q);
        const matchesCap = m.caption?.toLowerCase().includes(q);
        const matchesPerson = formatFullName(m.person).toLowerCase().includes(q);
        if (!matchesName && !matchesCap && !matchesPerson) return false;
      }

      return true;
    });
  }, [allMedia, selectedType, selectedPersonId, searchQuery]);

  return (
    <div className="w-full h-full flex flex-col bg-stone-100 overflow-hidden">
      {/* Top Filter and Actions Bar */}
      <div className="p-4 sm:p-5 bg-white border-b border-stone-200 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
          <button
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
          {/* Smart Face Recognition Trigger Button */}
          <button
            type="button"
            onClick={() => setIsFaceRecognitionModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/40 text-amber-900 font-semibold text-xs transition shadow-2xs"
            title="Открыть умное распознавание лиц (как в Tonfotos)"
          >
            <Scan className="w-3.5 h-3.5 text-amber-700" />
            <span>Распознавание лиц (AI)</span>
            {pendingSuggestionsCount > 0 && (
              <span className="px-1.5 py-0.2 rounded-full bg-amber-600 text-white text-[10px] font-bold animate-pulse">
                +{pendingSuggestionsCount}
              </span>
            )}
          </button>

          <div className="relative flex-1 sm:w-52">
            <Search className="absolute left-3 top-2.5 w-3.5 h-3.5 text-stone-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Поиск по архиву..."
              className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg bg-stone-50 border border-stone-200 text-stone-900 focus:outline-none focus:ring-2 focus:ring-amber-500/40"
            />
          </div>

          <select
            value={selectedPersonId}
            onChange={e => setSelectedPersonId(e.target.value)}
            className="py-1.5 px-2.5 text-xs rounded-lg bg-stone-50 border border-stone-200 text-stone-800"
          >
            <option value="all">Все персоналии</option>
            {persons.map(p => (
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
          <div className="text-center py-20 bg-white rounded-2xl border border-stone-200 p-6 max-w-lg mx-auto">
            <ImageIcon className="w-12 h-12 text-stone-300 mx-auto mb-3" />
            <h3 className="text-sm font-semibold text-stone-800">Медиафайлы не найдены</h3>
            <p className="text-xs text-stone-500 mt-1 max-w-sm mx-auto">
              Чтобы добавить фотографии, видеозаписи или сканы документов, откройте карточку нужной персоналии и прикрепите файлы во вкладке «Медиафайлы».
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {filteredMedia.map(item => (
              <div
                key={item.id}
                onClick={() => setLightboxMedia(item)}
                className="group cursor-pointer rounded-2xl overflow-hidden bg-white border border-stone-200 shadow-2xs hover:shadow-md transition flex flex-col"
              >
                {/* Media Preview Box */}
                <div className="h-44 bg-stone-100 flex items-center justify-center overflow-hidden relative">
                  {item.type === 'photo' ? (
                    <img
                      src={item.dataUrl}
                      alt={item.name}
                      className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
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

                  {/* Badge */}
                  <div className="absolute top-2 right-2 flex items-center gap-1">
                    {item.faces && item.faces.length > 0 && (
                      <span className="px-2 py-0.5 rounded-md bg-stone-950/85 text-white text-[10px] font-medium backdrop-blur-xs flex items-center gap-1 shadow-xs border border-white/10">
                        <User className="w-3 h-3 text-amber-400" />
                        <span>{item.faces.length} {item.faces.length === 1 ? 'лицо' : 'лиц'}</span>
                      </span>
                    )}
                    {item.faces?.some(f => !f.isConfirmed && f.suggestedPersonId) && (
                      <span className="px-1.5 py-0.5 rounded-md bg-amber-500 text-stone-950 text-[10px] font-bold backdrop-blur-xs flex items-center gap-0.5 animate-pulse shadow-xs">
                        <Sparkles className="w-2.5 h-2.5" />
                        <span>Найдено совпадение</span>
                      </span>
                    )}
                    <span className="px-2 py-0.5 rounded-md bg-stone-900/80 text-white text-[10px] font-medium backdrop-blur-xs">
                      {item.type === 'photo' ? 'Фото' : item.type === 'video' ? 'Видео' : 'Документ'}
                    </span>
                  </div>
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

                  <div className="pt-3 mt-3 border-t border-stone-100 flex items-center justify-between text-[11px] text-stone-500">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectPerson(item.person.id);
                      }}
                      className="hover:text-amber-800 font-medium truncate flex items-center gap-1"
                      title="Перейти к персоналии"
                    >
                      <span>{formatFullName(item.person, { format: 'short' })}</span>
                      <ExternalLink className="w-3 h-3 text-stone-400" />
                    </button>
                    {item.date && <span>{formatDisplayDate(item.date)}</span>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Lightbox Viewer with Face Tagging */}
      {lightboxMedia && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4 animate-in fade-in"
          onClick={() => setLightboxMedia(null)}
        >
          <div
            className="w-full max-w-4xl max-h-[92vh] bg-stone-950 rounded-2xl overflow-hidden border border-stone-800 flex flex-col text-white"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-3 border-b border-stone-800">
              <div>
                <h3 className="text-sm font-semibold truncate">{lightboxMedia.name}</h3>
                <p className="text-xs text-stone-400">
                  Персоналия: {formatFullName(lightboxMedia.person)}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <a
                  href={lightboxMedia.dataUrl}
                  download={lightboxMedia.name}
                  className="p-1.5 text-stone-400 hover:text-white hover:bg-stone-800 rounded-lg transition"
                  title="Скачать файл"
                >
                  <Download className="w-4 h-4" />
                </a>
                <button
                  onClick={() => setLightboxMedia(null)}
                  className="p-1.5 text-stone-400 hover:text-white hover:bg-stone-800 rounded-lg transition"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-auto max-h-[75vh]">
              {lightboxMedia.type === 'photo' ? (
                <PhotoFaceViewer
                  media={lightboxMedia}
                  allPersons={persons}
                  targetPersonId={lightboxMedia.person.id}
                  onSetAvatar={(croppedAvatar, destPersonId) => {
                    if (!onUpdatePersons) return;
                    const targetId = destPersonId || lightboxMedia.person.id;
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
                    const updatedPersons = persons.map((p) => {
                      if (p.id !== lightboxMedia.person.id) return p;
                      const updatedMedia = p.mediaFiles.map((m) => {
                        if (m.id === lightboxMedia.id) {
                          return { ...m, faces: updatedFaces };
                        }
                        return m;
                      });
                      return { ...p, mediaFiles: updatedMedia };
                    });

                    // Re-calculate suggestions across the entire tree and sync shared tagged photos!
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
                    className="max-h-[65vh] w-auto rounded-lg shadow-xl"
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

            {lightboxMedia.caption && lightboxMedia.type === 'photo' && (
              <div className="px-5 py-3 bg-stone-900/80 border-t border-stone-800 text-xs text-stone-300">
                {lightboxMedia.caption}
              </div>
            )}
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
