import React, { useState, useRef, useEffect } from 'react';
import { Person, MediaItem, FaceTag, FaceBox } from '../../types/genealogy';
import { formatFullName } from '../../utils/kinship';
import { 
  detectFacesInPhoto, 
  collectKnownFaceReferences, 
  matchFaceToPersons,
  cropFaceToAvatar
} from '../../services/faceRecognition';
import { 
  Scan, 
  Check, 
  X, 
  User, 
  Sparkles, 
  Plus, 
  Trash2, 
  Eye, 
  EyeOff, 
  Loader2, 
  ExternalLink,
  HelpCircle,
  CheckCircle2,
  UserCheck
} from 'lucide-react';

interface PhotoFaceViewerProps {
  media: MediaItem;
  allPersons: Person[];
  onUpdateFaces: (updatedFaces: FaceTag[]) => void;
  onSelectPerson?: (personId: string) => void;
  className?: string;
  autoScanOnMount?: boolean;
  targetPersonId?: string;
  onSetAvatar?: (avatarUrl: string, personId?: string, faceBox?: FaceBox) => void;
}

export const PhotoFaceViewer: React.FC<PhotoFaceViewerProps> = ({
  media,
  allPersons,
  onUpdateFaces,
  onSelectPerson,
  className = '',
  autoScanOnMount = false,
  targetPersonId,
  onSetAvatar
}) => {
  const [faces, setFaces] = useState<FaceTag[]>(media.faces || []);
  const [isScanning, setIsScanning] = useState(false);
  const [isCroppingAvatar, setIsCroppingAvatar] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [syncNotice, setSyncNotice] = useState<string | null>(null);
  const [activeFaceId, setActiveFaceId] = useState<string | null>(null);
  const [showBoxes, setShowBoxes] = useState(true);
  const [isAddingManualBox, setIsAddingManualBox] = useState(false);
  const imageContainerRef = useRef<HTMLDivElement>(null);

  // Sync internal state with prop
  useEffect(() => {
    setFaces(media.faces || []);
  }, [media.faces]);

  // Optional auto-scan if photo has no faces yet
  useEffect(() => {
    if (autoScanOnMount && (!media.faces || media.faces.length === 0) && media.dataUrl) {
      handleScanFaces();
    }
  }, [autoScanOnMount]);

  // Run face detection on this photo
  const handleScanFaces = async () => {
    if (isScanning || !media.dataUrl) return;
    setIsScanning(true);
    setScanError(null);

    try {
      const detectedFaces = await detectFacesInPhoto(media.dataUrl, media.id);
      
      // Attempt auto-matching against known tree members
      const knownRefs = collectKnownFaceReferences(allPersons);
      
      const enrichedFaces: FaceTag[] = detectedFaces.map((f) => {
        if (f.descriptor && knownRefs.length > 0) {
          const match = matchFaceToPersons(f.descriptor, knownRefs);
          if (match.suggestedPersonId) {
            return {
              ...f,
              suggestedPersonId: match.suggestedPersonId,
              suggestedScore: match.suggestedScore
            };
          }
        }
        return f;
      });

      // Merge with any existing confirmed faces by checking overlap
      const mergedFaces: FaceTag[] = [];
      const existing = faces.filter((f) => f.isConfirmed);

      existing.forEach((ex) => mergedFaces.push(ex));

      enrichedFaces.forEach((detected) => {
        // If it doesn't heavily overlap with an existing confirmed face, add it
        const overlaps = existing.some((ex) => {
          const dx = Math.abs(ex.box.x - detected.box.x);
          const dy = Math.abs(ex.box.y - detected.box.y);
          return dx < 15 && dy < 15;
        });
        if (!overlaps) {
          mergedFaces.push(detected);
        }
      });

      setFaces(mergedFaces);
      onUpdateFaces(mergedFaces);
    } catch (err: any) {
      console.error('Scan error:', err);
      setScanError(err?.message || 'Не удалось распознать лица на фото');
    } finally {
      setIsScanning(false);
    }
  };

  // Confirm an AI match suggestion
  const handleConfirmSuggestion = (faceId: string, personId: string) => {
    const updated = faces.map((f) => {
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
    setFaces(updated);
    onUpdateFaces(updated);
    setActiveFaceId(null);

    const targetPerson = allPersons.find((p) => p.id === personId);
    if (targetPerson) {
      setSyncNotice(`✓ Лицо подтверждено! Фото прикреплено к карточке: ${formatFullName(targetPerson)}`);
    }
  };

  // Manually assign a person to a face
  const handleAssignPerson = (faceId: string, personId: string) => {
    const updated = faces.map((f) => {
      if (f.id === faceId) {
        return {
          ...f,
          personId: personId || undefined,
          isConfirmed: Boolean(personId),
          suggestedPersonId: undefined
        };
      }
      return f;
    });
    setFaces(updated);
    onUpdateFaces(updated);
    setActiveFaceId(null);

    if (personId) {
      const targetPerson = allPersons.find((p) => p.id === personId);
      if (targetPerson) {
        setSyncNotice(`✓ Фото прикреплено к карточке: ${formatFullName(targetPerson)}`);
      }
    }
  };

  // Delete a face tag
  const handleDeleteFace = (faceId: string) => {
    const updated = faces.filter((f) => f.id !== faceId);
    setFaces(updated);
    onUpdateFaces(updated);
    if (activeFaceId === faceId) setActiveFaceId(null);
  };

  // Crop this face and set as avatar for a person
  const handleMakeAvatar = async (face: FaceTag, destPersonId?: string) => {
    if (!onSetAvatar) return;
    setIsCroppingAvatar(true);
    try {
      const cropped = await cropFaceToAvatar(media.dataUrl, face.box);
      const targetId = destPersonId || face.personId || targetPersonId;
      onSetAvatar(cropped, targetId, face.box);
      const pObj = allPersons.find((p) => p.id === targetId);
      setSyncNotice(
        pObj 
          ? `✓ Лицо успешно кадрировано и установлено как портрет для: ${formatFullName(pObj)}`
          : '✓ Лицо успешно кадрировано и установлено как портрет!'
      );
    } catch (err) {
      console.error('Failed to crop avatar:', err);
    } finally {
      setIsCroppingAvatar(false);
    }
  };

  // Click on image to place a manual face box
  const handleContainerClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isAddingManualBox || !imageContainerRef.current) return;

    const rect = imageContainerRef.current.getBoundingClientRect();
    const clickX = ((e.clientX - rect.left) / rect.width) * 100;
    const clickY = ((e.clientY - rect.top) / rect.height) * 100;

    const boxW = 16; // default 16% width
    const boxH = 20; // default 20% height

    const newFace: FaceTag = {
      id: `face-manual-${Date.now()}`,
      mediaId: media.id,
      box: {
        x: Math.max(0, Math.min(100 - boxW, clickX - boxW / 2)),
        y: Math.max(0, Math.min(100 - boxH, clickY - boxH / 2)),
        width: boxW,
        height: boxH
      },
      isConfirmed: false,
      createdAt: Date.now()
    };

    const updated = [...faces, newFace];
    setFaces(updated);
    onUpdateFaces(updated);
    setActiveFaceId(newFace.id);
    setIsAddingManualBox(false);
  };

  return (
    <div className={`relative flex flex-col bg-stone-950 text-white rounded-2xl overflow-hidden select-none ${className}`}>
      {/* Top Toolbar */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-stone-900/90 backdrop-blur-md border-b border-stone-800 text-xs z-20">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-stone-200">
            Лица на фото ({faces.length})
          </span>
          {faces.some((f) => f.suggestedPersonId && !f.isConfirmed) && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 font-medium text-[11px] border border-amber-500/30">
              <Sparkles className="w-3 h-3" />
              <span>Есть предложения</span>
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowBoxes(!showBoxes)}
            className="p-1.5 rounded-lg text-stone-400 hover:text-white hover:bg-stone-800 transition"
            title={showBoxes ? 'Скрыть рамки лиц' : 'Показать рамки лиц'}
          >
            {showBoxes ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4 text-stone-500" />}
          </button>

          <button
            type="button"
            onClick={() => setIsAddingManualBox(!isAddingManualBox)}
            className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition flex items-center gap-1.5 ${
              isAddingManualBox 
                ? 'bg-amber-600 text-white' 
                : 'bg-stone-800 text-stone-300 hover:bg-stone-700 hover:text-white'
            }`}
            title="Кликните по фото, чтобы выделить лицо вручную"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>{isAddingManualBox ? 'Кликните по лицу' : 'Выделить лицо'}</span>
          </button>

          <button
            type="button"
            disabled={isScanning}
            onClick={handleScanFaces}
            className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-stone-950 font-semibold text-xs transition flex items-center gap-1.5 shadow-sm disabled:opacity-50"
          >
            {isScanning ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Сканирование...</span>
              </>
            ) : (
              <>
                <Scan className="w-3.5 h-3.5" />
                <span>Найти лица нейросетью</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Scan Error Alert */}
      {scanError && (
        <div className="px-4 py-2 bg-rose-950/80 border-b border-rose-800 text-xs text-rose-200 flex items-center justify-between">
          <span>{scanError}</span>
          <button onClick={() => setScanError(null)} className="text-rose-400 hover:text-white">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Sync Success Alert */}
      {syncNotice && (
        <div className="px-4 py-2 bg-emerald-950/90 border-b border-emerald-800 text-xs text-emerald-200 flex items-center justify-between animate-in fade-in">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span className="font-medium">{syncNotice}</span>
          </div>
          <button onClick={() => setSyncNotice(null)} className="text-emerald-400 hover:text-white">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Main Image Area with Face Bounding Boxes */}
      <div 
        ref={imageContainerRef}
        onClick={handleContainerClick}
        className={`relative flex items-center justify-center min-h-[360px] max-h-[70vh] bg-stone-950 overflow-hidden ${
          isAddingManualBox ? 'cursor-crosshair' : 'cursor-default'
        }`}
      >
        <img
          src={media.dataUrl}
          alt={media.name}
          className="max-h-[70vh] w-auto max-w-full object-contain pointer-events-none"
        />

        {/* Overlay Bounding Boxes */}
        {showBoxes && faces.map((face) => {
          const isSelected = activeFaceId === face.id;
          const assignedPerson = allPersons.find((p) => p.id === face.personId);
          const suggestedPerson = allPersons.find((p) => p.id === face.suggestedPersonId);

          let borderColor = 'border-stone-400/80 hover:border-stone-200';
          let bgColor = 'bg-stone-500/10';

          if (face.isConfirmed && assignedPerson) {
            borderColor = 'border-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.3)]';
            bgColor = 'bg-emerald-500/10';
          } else if (suggestedPerson) {
            borderColor = 'border-amber-400 animate-pulse shadow-[0_0_12px_rgba(251,191,36,0.4)]';
            bgColor = 'bg-amber-500/15';
          }

          if (isSelected) {
            borderColor = 'border-amber-300 ring-2 ring-amber-400/60 shadow-lg';
          }

          return (
            <div
              key={face.id}
              onClick={(e) => {
                e.stopPropagation();
                setActiveFaceId(isSelected ? null : face.id);
              }}
              style={{
                left: `${face.box.x}%`,
                top: `${face.box.y}%`,
                width: `${face.box.width}%`,
                height: `${face.box.height}%`
              }}
              className={`absolute border-2 rounded-xl transition cursor-pointer pointer-events-auto ${borderColor} ${bgColor}`}
            >
              {/* Badge on top of bounding box */}
              <div className="absolute -top-6 left-1/2 -translate-x-1/2 whitespace-nowrap pointer-events-none">
                {assignedPerson ? (
                  <span className="px-2 py-0.5 rounded-full bg-emerald-950/90 text-emerald-200 border border-emerald-500/50 text-[10px] font-bold shadow-md">
                    {formatFullName(assignedPerson, { format: 'short' })}
                  </span>
                ) : suggestedPerson ? (
                  <span className="px-2 py-0.5 rounded-full bg-amber-950/90 text-amber-200 border border-amber-500/50 text-[10px] font-bold flex items-center gap-1 shadow-md">
                    <Sparkles className="w-2.5 h-2.5 text-amber-400" />
                    <span>{formatFullName(suggestedPerson, { format: 'short' })}?</span>
                  </span>
                ) : (
                  <span className="px-1.5 py-0.5 rounded bg-black/75 text-stone-300 text-[10px] font-medium backdrop-blur-xs">
                    Лицо
                  </span>
                )}
              </div>

              {/* Active Popup Card for this Face */}
              {isSelected && (
                <div 
                  onClick={(e) => e.stopPropagation()}
                  className="absolute top-full left-1/2 -translate-x-1/2 mt-2 w-64 bg-stone-900 border border-stone-750 rounded-xl p-3 shadow-2xl z-30 text-stone-200 animate-in fade-in"
                >
                  {/* If there is an AI Match Suggestion */}
                  {suggestedPerson && !face.isConfirmed && (
                    <div className="mb-2.5 p-2 rounded-lg bg-amber-500/15 border border-amber-500/30 text-amber-200 text-xs space-y-1.5">
                      <div className="flex items-center justify-between font-semibold">
                        <span className="flex items-center gap-1 text-[11px] text-amber-300">
                          <Sparkles className="w-3 h-3 text-amber-400" />
                          <span>Найдено сходство:</span>
                        </span>
                        <span className="text-[11px] bg-amber-500/30 text-amber-200 px-1.5 py-0.2 rounded font-mono">
                          {face.suggestedScore || 85}%
                        </span>
                      </div>
                      <p className="font-bold text-white text-xs">
                        {formatFullName(suggestedPerson)}
                      </p>
                      <button
                        type="button"
                        onClick={() => handleConfirmSuggestion(face.id, suggestedPerson.id)}
                        className="w-full py-1.5 px-2 rounded-lg bg-amber-500 text-stone-950 font-bold hover:bg-amber-400 text-xs transition flex items-center justify-center gap-1 mt-1 shadow-sm"
                      >
                        <Check className="w-3.5 h-3.5" />
                        <span>Подтвердить персону</span>
                      </button>
                    </div>
                  )}

                  {/* Confirmed Person Info */}
                  {assignedPerson && (
                    <div className="mb-2.5 flex items-center justify-between pb-2 border-b border-stone-800">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="w-7 h-7 rounded-full bg-stone-700 flex items-center justify-center text-xs font-bold font-serif shrink-0">
                          {assignedPerson.avatarUrl ? (
                            <img src={assignedPerson.avatarUrl} alt="" className="w-full h-full object-cover rounded-full" />
                          ) : assignedPerson.firstName[0]}
                        </div>
                        <div className="min-w-0">
                          <p className="font-bold text-xs text-white truncate">{formatFullName(assignedPerson)}</p>
                          <span className="text-[10px] text-emerald-400 font-medium flex items-center gap-1">
                            <CheckCircle2 className="w-2.5 h-2.5" /> Подтверждено
                          </span>
                        </div>
                      </div>
                      {onSelectPerson && (
                        <button
                          type="button"
                          onClick={() => onSelectPerson(assignedPerson.id)}
                          className="p-1 rounded text-stone-400 hover:text-white"
                          title="Перейти к персоналии"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  )}

                  {/* Person Selector Dropdown */}
                  <div className="space-y-1">
                    <label className="block text-[11px] font-medium text-stone-400">
                      {assignedPerson ? 'Сменить персоналию:' : 'Указать человека из древа:'}
                    </label>
                    <select
                      value={face.personId || ''}
                      onChange={(e) => handleAssignPerson(face.id, e.target.value)}
                      className="w-full px-2.5 py-1.5 text-xs rounded-lg bg-stone-800 border border-stone-700 text-white focus:outline-none focus:ring-1 focus:ring-amber-500"
                    >
                      <option value="">-- Не выбрано (неизвестное лицо) --</option>
                      {allPersons.map((p) => (
                        <option key={p.id} value={p.id}>
                          {formatFullName(p, { format: 'natural' })}
                          {p.birthDate ? ` (${p.birthDate.slice(0, 4)})` : ''}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Make Avatar action */}
                  {onSetAvatar && (
                    <button
                      type="button"
                      disabled={isCroppingAvatar}
                      onClick={() => handleMakeAvatar(face, face.personId || targetPersonId)}
                      className="w-full mt-2.5 py-1.5 px-2.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 font-semibold text-xs transition flex items-center justify-center gap-1.5 disabled:opacity-50 shadow-xs"
                      title="Вырезать овал лица и установить главным портретом в карточку"
                    >
                      <UserCheck className="w-3.5 h-3.5 text-amber-400" />
                      <span>{isCroppingAvatar ? 'Кадрирование...' : 'Сделать это лицо портретом'}</span>
                    </button>
                  )}

                  {/* Actions footer */}
                  <div className="mt-2.5 pt-2 border-t border-stone-800 flex items-center justify-between text-[11px]">
                    <button
                      type="button"
                      onClick={() => handleDeleteFace(face.id)}
                      className="text-stone-400 hover:text-rose-400 flex items-center gap-1 transition"
                    >
                      <Trash2 className="w-3 h-3" />
                      <span>Удалить рамку</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveFaceId(null)}
                      className="text-stone-400 hover:text-white"
                    >
                      Закрыть
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Bottom List of Tagged People */}
      {faces.length > 0 && (
        <div className="p-3 bg-stone-900 border-t border-stone-800 flex flex-wrap items-center gap-2 text-xs">
          <span className="text-stone-400 font-medium">Отмечены на фото:</span>
          {faces.map((face) => {
            const p = allPersons.find((x) => x.id === face.personId);
            const sug = allPersons.find((x) => x.id === face.suggestedPersonId);
            return (
              <button
                key={face.id}
                type="button"
                onClick={() => setActiveFaceId(face.id)}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs transition border ${
                  face.isConfirmed && p
                    ? 'bg-emerald-950/70 border-emerald-700/60 text-emerald-200'
                    : sug
                    ? 'bg-amber-950/70 border-amber-600/70 text-amber-200 animate-pulse'
                    : 'bg-stone-800 border-stone-700 text-stone-300'
                }`}
              >
                <User className="w-3 h-3 text-stone-400" />
                <span>
                  {p
                    ? formatFullName(p, { format: 'short' })
                    : sug
                    ? `${formatFullName(sug, { format: 'short' })}? (${face.suggestedScore}%)`
                    : 'Неопознанное лицо'}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};
