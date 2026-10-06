import React, { useState, useMemo } from 'react';
import { Person, MediaItem, FaceTag } from '../../types/genealogy';
import { formatFullName } from '../../utils/kinship';
import { 
  detectFacesInPhoto, 
  collectKnownFaceReferences, 
  matchFaceToPersons,
  updateFaceSuggestionsAcrossTree,
  syncTaggedMediaAcrossPersons
} from '../../services/faceRecognition';
import { PhotoFaceViewer } from '../media/PhotoFaceViewer';
import { 
  Scan, 
  Sparkles, 
  Check, 
  CheckCheck, 
  X, 
  User, 
  Image as ImageIcon, 
  Loader2, 
  ChevronRight,
  Filter,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';

interface SmartFaceRecognitionModalProps {
  isOpen: boolean;
  onClose: () => void;
  persons: Person[];
  onUpdatePersons: (updatedPersons: Person[]) => void;
  onSelectPerson: (personId: string) => void;
}

interface PendingSuggestionItem {
  face: FaceTag;
  media: MediaItem;
  ownerPerson: Person;
  suggestedPerson: Person;
  similarity: number;
}

export const SmartFaceRecognitionModal: React.FC<SmartFaceRecognitionModalProps> = ({
  isOpen,
  onClose,
  persons,
  onUpdatePersons,
  onSelectPerson
}) => {
  const [isScanningAll, setIsScanningAll] = useState(false);
  const [scanProgress, setScanProgress] = useState<{ current: number; total: number; currentName: string } | null>(null);
  const [selectedPhotoForInspection, setSelectedPhotoForInspection] = useState<{ media: MediaItem; person: Person } | null>(null);

  // Collect all photos from all persons in the database
  const allPhotos = useMemo(() => {
    const list: { media: MediaItem; person: Person }[] = [];
    persons.forEach((person) => {
      if (person.mediaFiles) {
        person.mediaFiles.forEach((media) => {
          if (media.type === 'photo' && media.dataUrl) {
            list.push({ media, person });
          }
        });
      }
    });
    return list;
  }, [persons]);

  // Count total detected faces, confirmed faces and pending suggestions
  const stats = useMemo(() => {
    let totalFaces = 0;
    let confirmedFaces = 0;
    const knownReferences = collectKnownFaceReferences(persons);

    allPhotos.forEach(({ media }) => {
      if (media.faces) {
        totalFaces += media.faces.length;
        media.faces.forEach((f) => {
          if (f.isConfirmed && f.personId) {
            confirmedFaces++;
          }
        });
      }
    });

    return {
      totalPhotos: allPhotos.length,
      totalFaces,
      confirmedFaces,
      referencePersonsCount: new Set(knownReferences.map((r) => r.personId)).size
    };
  }, [allPhotos, persons]);

  // Collect all pending suggestions
  const pendingSuggestions = useMemo(() => {
    const list: PendingSuggestionItem[] = [];

    allPhotos.forEach(({ media, person }) => {
      if (media.faces) {
        media.faces.forEach((face) => {
          if (!face.isConfirmed && face.suggestedPersonId) {
            const sugPerson = persons.find((p) => p.id === face.suggestedPersonId);
            if (sugPerson) {
              list.push({
                face,
                media,
                ownerPerson: person,
                suggestedPerson: sugPerson,
                similarity: face.suggestedScore || 85
              });
            }
          }
        });
      }
    });

    return list;
  }, [allPhotos, persons]);

  // Group pending suggestions by suggested person
  const groupedSuggestions = useMemo(() => {
    const map = new Map<string, { person: Person; items: PendingSuggestionItem[] }>();

    pendingSuggestions.forEach((item) => {
      const pId = item.suggestedPerson.id;
      if (!map.has(pId)) {
        map.set(pId, { person: item.suggestedPerson, items: [] });
      }
      map.get(pId)!.items.push(item);
    });

    return Array.from(map.values());
  }, [pendingSuggestions]);

  // Scan all archive photos for faces and compute suggestions
  const handleScanAllPhotos = async () => {
    if (isScanningAll || allPhotos.length === 0) return;
    setIsScanningAll(true);

    try {
      let currentPersonsState = [...persons];

      for (let i = 0; i < allPhotos.length; i++) {
        const item = allPhotos[i];
        setScanProgress({
          current: i + 1,
          total: allPhotos.length,
          currentName: item.media.name
        });

        // If media doesn't have faces yet, run detector
        if (!item.media.faces || item.media.faces.length === 0) {
          try {
            const detectedFaces = await detectFacesInPhoto(item.media.dataUrl, item.media.id);

            // Update this media in our state
            currentPersonsState = currentPersonsState.map((p) => {
              if (p.id !== item.person.id) return p;
              const updatedMedia = p.mediaFiles.map((m) => {
                if (m.id === item.media.id) {
                  return { ...m, faces: detectedFaces };
                }
                return m;
              });
              return { ...p, mediaFiles: updatedMedia };
            });
          } catch (e) {
            console.warn('Error detecting face on photo:', item.media.name, e);
          }
        }
      }

      // Re-run matching across all unconfirmed faces and sync photos to tagged persons
      const { updatedPersons } = updateFaceSuggestionsAcrossTree(currentPersonsState);
      const syncedPersons = syncTaggedMediaAcrossPersons(updatedPersons);
      onUpdatePersons(syncedPersons);
    } catch (err) {
      console.error('Batch scan failed:', err);
    } finally {
      setIsScanningAll(false);
      setScanProgress(null);
    }
  };

  // Confirm a single suggestion
  const handleConfirmSuggestion = (mediaId: string, faceId: string, personId: string) => {
    const updatedPersons = persons.map((p) => {
      if (!p.mediaFiles) return p;
      const updatedMedia = p.mediaFiles.map((m) => {
        if (m.id === mediaId && m.faces) {
          const updatedFaces = m.faces.map((f) => {
            if (f.id === faceId) {
              return {
                ...f,
                personId,
                isConfirmed: true,
                suggestedPersonId: undefined
              };
            }
            return f;
          });
          return { ...m, faces: updatedFaces };
        }
        return m;
      });
      return { ...p, mediaFiles: updatedMedia };
    });

    // Re-propagate matches with newly confirmed reference and sync photo across persons!
    const { updatedPersons: matchedPersons } = updateFaceSuggestionsAcrossTree(updatedPersons);
    const finalPersons = syncTaggedMediaAcrossPersons(matchedPersons);
    onUpdatePersons(finalPersons);
  };

  // Dismiss a suggestion (remove suggestedPersonId)
  const handleDismissSuggestion = (mediaId: string, faceId: string) => {
    const updatedPersons = persons.map((p) => {
      if (!p.mediaFiles) return p;
      const updatedMedia = p.mediaFiles.map((m) => {
        if (m.id === mediaId && m.faces) {
          const updatedFaces = m.faces.map((f) => {
            if (f.id === faceId) {
              return {
                ...f,
                suggestedPersonId: undefined,
                suggestedScore: undefined
              };
            }
            return f;
          });
          return { ...m, faces: updatedFaces };
        }
        return m;
      });
      return { ...p, mediaFiles: updatedMedia };
    });

    onUpdatePersons(updatedPersons);
  };

  // Confirm all suggestions for a specific person in 1 click
  const handleConfirmAllForPerson = (personId: string, items: PendingSuggestionItem[]) => {
    const mediaFaceMap = new Map<string, Set<string>>();
    items.forEach((item) => {
      if (!mediaFaceMap.has(item.media.id)) {
        mediaFaceMap.set(item.media.id, new Set());
      }
      mediaFaceMap.get(item.media.id)!.add(item.face.id);
    });

    const updatedPersons = persons.map((p) => {
      if (!p.mediaFiles) return p;
      const updatedMedia = p.mediaFiles.map((m) => {
        if (mediaFaceMap.has(m.id) && m.faces) {
          const faceSet = mediaFaceMap.get(m.id)!;
          const updatedFaces = m.faces.map((f) => {
            if (faceSet.has(f.id)) {
              return {
                ...f,
                personId,
                isConfirmed: true,
                suggestedPersonId: undefined
              };
            }
            return f;
          });
          return { ...m, faces: updatedFaces };
        }
        return m;
      });
      return { ...p, mediaFiles: updatedMedia };
    });

    // Propagate learning to all remaining photos and sync photo across all tagged cards!
    const { updatedPersons: matchedPersons } = updateFaceSuggestionsAcrossTree(updatedPersons);
    const finalPersons = syncTaggedMediaAcrossPersons(matchedPersons);
    onUpdatePersons(finalPersons);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/80 backdrop-blur-sm animate-in fade-in">
      <div className="relative w-full max-w-5xl max-h-[92vh] bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden border border-stone-200">
        {/* Header */}
        <div className="p-4 sm:p-5 bg-stone-900 text-white flex items-center justify-between border-b border-stone-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <Scan className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold font-serif">
                  Умное распознавание лиц (как в Tonfotos)
                </h2>
                <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 text-[10px] font-semibold uppercase tracking-wider border border-amber-500/30">
                  AI Offline
                </span>
              </div>
              <p className="text-xs text-stone-400 mt-0.5">
                Укажите человека на 1–2 фотографиях — нейросеть найдет его на остальных снимках фотоархива
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 text-stone-400 hover:text-white rounded-lg hover:bg-stone-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Status and Action Ribbon */}
        <div className="p-4 bg-stone-50 border-b border-stone-200 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-4 sm:gap-6 flex-wrap text-stone-600">
            <div>
              <span className="text-stone-400 block text-[11px]">Фотографий:</span>
              <strong className="text-stone-900 font-bold">{stats.totalPhotos}</strong>
            </div>
            <div className="w-px h-6 bg-stone-200 hidden sm:block" />
            <div>
              <span className="text-stone-400 block text-[11px]">Обнаружено лиц:</span>
              <strong className="text-stone-900 font-bold">{stats.totalFaces}</strong>
            </div>
            <div className="w-px h-6 bg-stone-200 hidden sm:block" />
            <div>
              <span className="text-stone-400 block text-[11px]">Эталонов персон:</span>
              <strong className="text-stone-900 font-bold">{stats.referencePersonsCount}</strong>
            </div>
            <div className="w-px h-6 bg-stone-200 hidden sm:block" />
            <div>
              <span className="text-stone-400 block text-[11px]">Ожидают подтверждения:</span>
              <strong className="text-amber-800 font-bold">
                {pendingSuggestions.length}
              </strong>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={isScanningAll || allPhotos.length === 0}
              onClick={handleScanAllPhotos}
              className="px-4 py-2 rounded-xl bg-stone-900 text-stone-100 font-semibold hover:bg-stone-800 transition flex items-center gap-2 shadow-xs disabled:opacity-50"
            >
              {isScanningAll ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-amber-400" />
                  <span>
                    Обработка {scanProgress?.current || 0} из {scanProgress?.total || 0}...
                  </span>
                </>
              ) : (
                <>
                  <Scan className="w-4 h-4 text-amber-400" />
                  <span>Сканировать все фото архива</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Progress Bar (if active) */}
        {isScanningAll && scanProgress && (
          <div className="bg-amber-500/10 border-b border-amber-500/20 px-4 py-2">
            <div className="flex items-center justify-between text-xs text-amber-950 font-medium mb-1">
              <span>Анализ фото: {scanProgress.currentName}</span>
              <span>{Math.round((scanProgress.current / scanProgress.total) * 100)}%</span>
            </div>
            <div className="w-full h-1.5 bg-amber-200/60 rounded-full overflow-hidden">
              <div 
                className="h-full bg-amber-600 rounded-full transition-all duration-200"
                style={{ width: `${(scanProgress.current / scanProgress.total) * 100}%` }}
              />
            </div>
          </div>
        )}

        {/* Body Content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
          {/* Inspection Lightbox if a photo was selected */}
          {selectedPhotoForInspection && (
            <div className="p-4 rounded-2xl bg-stone-900 border border-stone-800 space-y-3">
              <div className="flex items-center justify-between text-white text-xs">
                <div>
                  <span className="font-semibold text-stone-200">
                    Разметка фото: {selectedPhotoForInspection.media.name}
                  </span>
                  <p className="text-[11px] text-stone-400">
                    Персоналия: {formatFullName(selectedPhotoForInspection.person)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedPhotoForInspection(null)}
                  className="px-2.5 py-1 rounded-lg bg-stone-800 text-stone-300 hover:text-white"
                >
                  Свернуть просмотрщик
                </button>
              </div>

              <PhotoFaceViewer
                media={selectedPhotoForInspection.media}
                allPersons={persons}
                onSelectPerson={onSelectPerson}
                onUpdateFaces={(updatedFaces) => {
                  const updatedPersons = persons.map((p) => {
                    if (p.id !== selectedPhotoForInspection.person.id) return p;
                    const updatedMedia = p.mediaFiles.map((m) => {
                      if (m.id === selectedPhotoForInspection.media.id) {
                        return { ...m, faces: updatedFaces };
                      }
                      return m;
                    });
                    return { ...p, mediaFiles: updatedMedia };
                  });

                  // Re-propagate to other photos
                  const { updatedPersons: finalPersons } = updateFaceSuggestionsAcrossTree(updatedPersons);
                  onUpdatePersons(finalPersons);
                }}
              />
            </div>
          )}

          {/* Grouped Suggestions Section */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-amber-600" />
                <h3 className="text-sm font-bold text-stone-900">
                  Найденные совпадения лиц в архиве ({pendingSuggestions.length})
                </h3>
              </div>
              <span className="text-xs text-stone-500">
                Сгруппировано по персонам
              </span>
            </div>

            {groupedSuggestions.length === 0 ? (
              <div className="p-8 text-center bg-stone-50 rounded-2xl border border-dashed border-stone-300 max-w-lg mx-auto">
                <div className="w-12 h-12 rounded-2xl bg-amber-500/10 text-amber-700 flex items-center justify-center mx-auto mb-3">
                  <Scan className="w-6 h-6" />
                </div>
                <h4 className="text-sm font-bold text-stone-800">
                  Пока нет предложений совпадений
                </h4>
                <p className="text-xs text-stone-500 mt-1 leading-relaxed">
                  1. Нажмите <strong>«Сканировать все фото архива»</strong>, чтобы нейросеть выделила все лица.<br />
                  2. Откройте любую фотографию и укажите родственника вручную — система сразу найдёт его на всех остальных фотографиях!
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {groupedSuggestions.map(({ person, items }) => (
                  <div
                    key={person.id}
                    className="p-4 rounded-2xl bg-white border border-stone-200 shadow-2xs hover:shadow-xs transition space-y-3"
                  >
                    {/* Person Header */}
                    <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-stone-100">
                      <div className="flex items-center gap-2.5">
                        <div className="w-9 h-9 rounded-xl bg-stone-200 overflow-hidden flex items-center justify-center text-xs font-bold font-serif text-stone-700 shrink-0">
                          {person.avatarUrl ? (
                            <img src={person.avatarUrl} alt="" className="w-full h-full object-cover" />
                          ) : (
                            person.firstName[0]
                          )}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-sm text-stone-900">
                              {formatFullName(person)}
                            </span>
                            <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 text-[11px] font-semibold">
                              Найдено {items.length} совпадений
                            </span>
                          </div>
                          <p className="text-[11px] text-stone-500">
                            {person.birthDate ? `род. ${person.birthDate.slice(0, 4)} г.` : 'Год рождения не указан'}
                          </p>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleConfirmAllForPerson(person.id, items)}
                        className="px-3.5 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold text-xs transition flex items-center gap-1.5 shadow-2xs"
                      >
                        <CheckCheck className="w-4 h-4" />
                        <span>Подтвердить все ({items.length})</span>
                      </button>
                    </div>

                    {/* Matching Photos Cards */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                      {items.map(({ face, media, similarity }) => (
                        <div
                          key={face.id}
                          className="group rounded-xl overflow-hidden bg-stone-50 border border-stone-200 flex flex-col justify-between"
                        >
                          {/* Image preview with bounding box zoom */}
                          <div 
                            onClick={() => setSelectedPhotoForInspection({ media, person })}
                            className="relative h-32 bg-stone-200 overflow-hidden cursor-pointer"
                            title="Открыть для детального просмотра"
                          >
                            <img
                              src={media.dataUrl}
                              alt={media.name}
                              className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                            />
                            {/* Overlay tag for the face box */}
                            <div
                              style={{
                                left: `${face.box.x}%`,
                                top: `${face.box.y}%`,
                                width: `${face.box.width}%`,
                                height: `${face.box.height}%`
                              }}
                              className="absolute border-2 border-amber-400 bg-amber-500/20 rounded shadow-md pointer-events-none"
                            />

                            <span className="absolute top-2 right-2 px-1.5 py-0.5 rounded-md bg-stone-950/80 text-amber-300 text-[10px] font-mono font-bold backdrop-blur-xs">
                              {similarity}% сходство
                            </span>
                          </div>

                          {/* Footer action buttons */}
                          <div className="p-2.5 flex items-center justify-between text-xs gap-1 bg-white">
                            <span className="text-[11px] text-stone-600 truncate max-w-[120px]" title={media.name}>
                              {media.name}
                            </span>
                            <div className="flex items-center gap-1 shrink-0">
                              <button
                                type="button"
                                onClick={() => handleConfirmSuggestion(media.id, face.id, person.id)}
                                className="p-1 rounded-lg bg-emerald-100 text-emerald-800 hover:bg-emerald-200 transition"
                                title="Подтвердить персоналию"
                              >
                                <Check className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDismissSuggestion(media.id, face.id)}
                                className="p-1 rounded-lg bg-stone-100 text-stone-500 hover:text-rose-600 hover:bg-rose-50 transition"
                                title="Отклонить совпадение"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Quick instructions / tips */}
          <div className="p-4 rounded-xl bg-amber-500/5 border border-amber-500/20 text-xs text-stone-700 flex items-start gap-3">
            <AlertCircle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
            <div className="leading-relaxed">
              <span className="font-bold text-amber-900">Как это работает на практике: </span>
              Загрузите пачку фото (портреты, групповые карточки, семейные праздники). Откройте 1–2 фотографии и привяжите лицо к нужному родственнику. Встроенная нейросеть запомнит математический слепок лица и автоматически проставит предложения на всех остальных снимках.
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="p-3 bg-stone-100 border-t border-stone-200 flex items-center justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-stone-900 text-white font-medium text-xs hover:bg-stone-800 transition"
          >
            Закрыть
          </button>
        </div>
      </div>
    </div>
  );
};
