import React, { useEffect, useMemo, useState } from 'react';
import { Person, MediaItem, FaceTag } from '../../types/genealogy';
import { formatFullName } from '../../utils/kinship';
import {
  applyFaceReviewDecision,
  clusterUnassignedFaces,
  cropFaceToAvatar,
  detectFacesInPhoto,
  FaceReviewCandidate,
} from '../../services/faceRecognition';
import {
  AlertCircle,
  Check,
  CircleCheck,
  CircleX,
  Image as ImageIcon,
  Loader2,
  Scan,
  Sparkles,
  UserRound,
  X,
} from 'lucide-react';

interface SmartFaceRecognitionModalProps {
  isOpen: boolean;
  onClose: () => void;
  persons: Person[];
  mediaArchive: MediaItem[];
  onUpdateData: (persons: Person[], mediaArchive: MediaItem[]) => void | Promise<void>;
}

interface ActiveReview {
  clusterId: string;
  personId: string;
  candidates: FaceReviewCandidate[];
  index: number;
}

const FacePortrait: React.FC<{ media: MediaItem; face: FaceTag; className?: string }> = ({ media, face, className = '' }) => {
  const [portraitUrl, setPortraitUrl] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setPortraitUrl(null);
    void cropFaceToAvatar(media.dataUrl, face.box, 400).then((url) => {
      if (active) setPortraitUrl(url);
    });
    return () => { active = false; };
  }, [media.dataUrl, face.box]);

  return portraitUrl ? (
    <img src={portraitUrl} alt="Крупный фрагмент лица" className={`h-full w-full object-cover ${className}`} />
  ) : (
    <div className={`flex h-full w-full items-center justify-center bg-stone-200 text-stone-500 ${className}`}>
      <Loader2 className="h-5 w-5 animate-spin" />
    </div>
  );
};

export const SmartFaceRecognitionModal: React.FC<SmartFaceRecognitionModalProps> = ({
  isOpen,
  onClose,
  persons,
  mediaArchive,
  onUpdateData,
}) => {
  const [isScanningAll, setIsScanningAll] = useState(false);
  const [scanProgress, setScanProgress] = useState<{ current: number; total: number; currentName: string } | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);
  const [selectedPersonByCluster, setSelectedPersonByCluster] = useState<Record<string, string>>({});
  const [activeReview, setActiveReview] = useState<ActiveReview | null>(null);
  const [isSavingReview, setIsSavingReview] = useState(false);

  const allPhotos = useMemo(() => {
    const mediaById = new Map<string, MediaItem>();
    mediaArchive.forEach((media) => {
      if (media.type === 'photo' && media.dataUrl) mediaById.set(media.id, { ...media });
    });
    persons.forEach((person) => person.mediaFiles?.forEach((media) => {
      if (media.type !== 'photo' || !media.dataUrl) return;
      const existing = mediaById.get(media.id);
      if (!existing) mediaById.set(media.id, { ...media });
      else if ((!existing.faces || existing.faces.length === 0) && media.faces?.length) {
        mediaById.set(media.id, { ...existing, faces: media.faces, faceScanComplete: media.faceScanComplete });
      }
    }));
    return Array.from(mediaById.values());
  }, [mediaArchive, persons]);

  const faceCandidates = useMemo(() => allPhotos.flatMap((media) => (
    (media.faces || [])
      .filter((face) => !face.personId && !face.isConfirmed && face.descriptor?.length === 128)
      .map((face) => ({ media, face }))
  )), [allPhotos]);

  const faceClusters = useMemo(() => clusterUnassignedFaces(faceCandidates), [faceCandidates]);
  const detectedFaceCount = useMemo(() => allPhotos.reduce((count, media) => count + (media.faces?.length || 0), 0), [allPhotos]);
  const confirmedCount = useMemo(() => allPhotos.reduce((count, media) => count + (media.faces || []).filter((face) => face.isConfirmed && face.personId).length, 0), [allPhotos]);

  const handleScanAllPhotos = async () => {
    if (isScanningAll || allPhotos.length === 0) return;
    setIsScanningAll(true);
    setScanError(null);

    const canonicalMedia = new Map<string, MediaItem>();
    mediaArchive.forEach((media) => canonicalMedia.set(media.id, { ...media }));
    allPhotos.forEach((media) => {
      const existing = canonicalMedia.get(media.id);
      if (!existing || ((!existing.faces || existing.faces.length === 0) && media.faces?.length)) {
        canonicalMedia.set(media.id, { ...media });
      }
    });

    const errors: string[] = [];
    try {
      for (let index = 0; index < allPhotos.length; index++) {
        const photo = allPhotos[index];
        const current = canonicalMedia.get(photo.id) || photo;
        setScanProgress({ current: index + 1, total: allPhotos.length, currentName: photo.name });

        if (current.faceScanComplete || current.faces?.length) {
          if (!current.faceScanComplete) canonicalMedia.set(photo.id, { ...current, faceScanComplete: true });
          continue;
        }

        try {
          const faces = await detectFacesInPhoto(current.dataUrl, current.id);
          canonicalMedia.set(photo.id, { ...current, faces, faceScanComplete: true });
        } catch (error) {
          errors.push(`${photo.name}: ${error instanceof Error ? error.message : 'не удалось распознать лица'}`);
        }
      }

      const nextArchive = Array.from(canonicalMedia.values());
      const facesByMediaId = new Map(nextArchive.map((media) => [media.id, media]));
      const nextPersons = persons.map((person) => ({
        ...person,
        mediaFiles: person.mediaFiles.map((media) => facesByMediaId.get(media.id) || media),
      }));
      await onUpdateData(nextPersons, nextArchive);
      if (errors.length) setScanError(`Не удалось обработать некоторые фото: ${errors.join('; ')}`);
    } catch (error) {
      setScanError(error instanceof Error ? error.message : 'Не удалось сохранить результат сканирования.');
    } finally {
      setIsScanningAll(false);
      setScanProgress(null);
    }
  };

  const startReview = (clusterId: string) => {
    const personId = selectedPersonByCluster[clusterId];
    const cluster = faceClusters.find((item) => item.id === clusterId);
    if (!personId || !cluster) return;
    const candidates = cluster.candidates.filter(({ face }) => !face.rejectedPersonIds?.includes(personId));
    if (candidates.length) setActiveReview({ clusterId, personId, candidates, index: 0 });
  };

  const handleReviewDecision = async (isSamePerson: boolean) => {
    if (!activeReview || isSavingReview) return;
    const candidate = activeReview.candidates[activeReview.index];
    if (!candidate) return;
    setIsSavingReview(true);
    try {
      const result = applyFaceReviewDecision(
        persons,
        mediaArchive,
        candidate.media.id,
        candidate.face.id,
        activeReview.personId,
        isSamePerson,
      );
      await onUpdateData(result.persons, result.mediaArchive);
      if (activeReview.index + 1 >= activeReview.candidates.length) {
        setActiveReview(null);
      } else {
        setActiveReview({ ...activeReview, index: activeReview.index + 1 });
      }
    } catch (error) {
      setScanError(error instanceof Error ? error.message : 'Не удалось сохранить решение.');
    } finally {
      setIsSavingReview(false);
    }
  };

  if (!isOpen) return null;

  const activeCandidate = activeReview?.candidates[activeReview.index];
  const activePerson = activeReview ? persons.find((person) => person.id === activeReview.personId) : undefined;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-3 backdrop-blur-sm sm:p-5">
      <div className="flex max-h-[94vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-2xl">
        <header className="flex items-center justify-between border-b border-stone-800 bg-stone-900 px-5 py-4 text-white">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-amber-500/30 bg-amber-500/20 text-amber-300">
              <Scan className="h-5 w-5" />
            </div>
            <div>
              <h2 className="font-serif text-base font-bold">Распознавание лиц</h2>
              <p className="mt-0.5 text-xs text-stone-400">Найдите человека на фото и подтвердите совпадения вручную</p>
            </div>
          </div>
          <button type="button" onClick={onClose} disabled={isScanningAll || isSavingReview} className="rounded-lg p-2 text-stone-400 hover:bg-stone-800 hover:text-white disabled:opacity-40" aria-label="Закрыть">
            <X className="h-5 w-5" />
          </button>
        </header>

        <section className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-200 bg-stone-50 px-5 py-3 text-xs">
          <div className="flex flex-wrap gap-x-6 gap-y-2 text-stone-600">
            <span>Фотографий: <strong className="text-stone-900">{allPhotos.length}</strong></span>
            <span>Найдено лиц: <strong className="text-stone-900">{detectedFaceCount}</strong></span>
            <span>Групп для проверки: <strong className="text-amber-800">{faceClusters.length}</strong></span>
            <span>Подтверждено: <strong className="text-emerald-700">{confirmedCount}</strong></span>
          </div>
          <button
            type="button"
            disabled={isScanningAll || isSavingReview || allPhotos.length === 0}
            onClick={() => void handleScanAllPhotos()}
            className="inline-flex items-center gap-2 rounded-xl bg-stone-900 px-4 py-2 font-semibold text-white transition hover:bg-stone-800 disabled:opacity-50"
          >
            {isScanningAll ? <Loader2 className="h-4 w-4 animate-spin text-amber-400" /> : <Scan className="h-4 w-4 text-amber-400" />}
            {isScanningAll ? `Сканирование ${scanProgress?.current || 0} из ${scanProgress?.total || 0}` : 'Сканировать весь фотоархив'}
          </button>
        </section>

        {isScanningAll && scanProgress && (
          <div className="border-b border-amber-200 bg-amber-50 px-5 py-2">
            <div className="mb-1 flex justify-between gap-3 text-xs text-amber-950">
              <span className="truncate">Анализ: {scanProgress.currentName}</span>
              <span>{Math.round((scanProgress.current / scanProgress.total) * 100)}%</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-amber-200">
              <div className="h-full rounded-full bg-amber-600 transition-all" style={{ width: `${(scanProgress.current / scanProgress.total) * 100}%` }} />
            </div>
          </div>
        )}

        {scanError && (
          <div role="alert" className="mx-5 mt-3 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span className="flex-1">{scanError}</span>
            <button type="button" onClick={() => setScanError(null)} aria-label="Скрыть ошибку"><X className="h-4 w-4" /></button>
          </div>
        )}

        <main className="flex-1 overflow-y-auto p-4 sm:p-6">
          {activeReview && activeCandidate && activePerson ? (
            <section className="mx-auto max-w-3xl space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-amber-800">Проверка совпадения</p>
                  <h3 className="mt-1 text-lg font-bold text-stone-900">Это {formatFullName(activePerson)}?</h3>
                </div>
                <span className="rounded-full bg-stone-100 px-3 py-1 text-xs text-stone-600">
                  Фото {activeReview.index + 1} из {activeReview.candidates.length}
                </span>
              </div>

              <div className="grid gap-4 sm:grid-cols-[220px_1fr]">
                <div className="flex flex-col items-center gap-2 rounded-2xl border border-amber-200 bg-amber-50 p-3">
                  <div className="h-48 w-40 overflow-hidden rounded-xl bg-stone-200 shadow-sm">
                    <FacePortrait media={activeCandidate.media} face={activeCandidate.face} />
                  </div>
                  <p className="text-center text-xs font-semibold text-stone-800">Крупный фрагмент лица</p>
                  <p className="max-w-full truncate text-[11px] text-stone-500" title={activeCandidate.media.name}>{activeCandidate.media.name}</p>
                </div>
                <div className="flex min-h-60 items-center justify-center overflow-hidden rounded-2xl border border-stone-200 bg-stone-100 p-2">
                  <div className="relative inline-block max-h-[50vh] max-w-full">
                    <img src={activeCandidate.media.dataUrl} alt={`Фото ${activeCandidate.media.name}`} className="block max-h-[50vh] max-w-full rounded-lg object-contain" />
                    <div
                      aria-hidden="true"
                      style={{
                        left: `${activeCandidate.face.box.x}%`,
                        top: `${activeCandidate.face.box.y}%`,
                        width: `${activeCandidate.face.box.width}%`,
                        height: `${activeCandidate.face.box.height}%`,
                      }}
                      className="pointer-events-none absolute rounded border-2 border-amber-400 bg-amber-400/15 shadow"
                    />
                  </div>
                </div>
              </div>

              <div className="flex flex-col-reverse justify-center gap-3 pt-1 sm:flex-row">
                <button
                  type="button"
                  disabled={isSavingReview}
                  onClick={() => void handleReviewDecision(false)}
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-stone-300 bg-white px-6 py-3 text-sm font-semibold text-stone-800 hover:bg-stone-100 disabled:opacity-50"
                >
                  <CircleX className="h-5 w-5 text-rose-600" /> Нет, не эта персона
                </button>
                <button
                  type="button"
                  disabled={isSavingReview}
                  onClick={() => void handleReviewDecision(true)}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-700 px-6 py-3 text-sm font-bold text-white hover:bg-emerald-800 disabled:opacity-50"
                >
                  {isSavingReview ? <Loader2 className="h-5 w-5 animate-spin" /> : <Check className="h-5 w-5" />}
                  Да, это {activePerson.firstName}
                </button>
              </div>
              <p className="text-center text-xs text-stone-500">При «Нет» лицо останется в архиве нераспознанным и не будет привязано к этой персоне.</p>
            </section>
          ) : faceClusters.length === 0 ? (
            <div className="mx-auto flex min-h-64 max-w-xl flex-col items-center justify-center rounded-2xl border border-dashed border-stone-300 bg-stone-50 p-8 text-center">
              {detectedFaceCount > 0 ? <CircleCheck className="mb-3 h-10 w-10 text-emerald-600" /> : <ImageIcon className="mb-3 h-10 w-10 text-stone-400" />}
              <h3 className="font-bold text-stone-900">{detectedFaceCount > 0 ? 'Нераспознанных лиц для проверки нет' : 'Сначала просканируйте фотоархив'}</h3>
              <p className="mt-2 text-sm leading-relaxed text-stone-500">
                {detectedFaceCount > 0
                  ? 'Все найденные лица уже назначены персонам или на фото не обнаружено новых лиц.'
                  : 'Сканирование охватит фотографии из общего архива и карточек персон. Найденные лица будут сгруппированы по сходству.'}
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-amber-600" />
                <h3 className="text-sm font-bold text-stone-900">Группы похожих лиц ({faceClusters.length})</h3>
                <span className="text-xs text-stone-500">Назначьте персону, затем подтвердите каждое фото</span>
              </div>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {faceClusters.map((cluster) => {
                  const selectedPersonId = selectedPersonByCluster[cluster.id] || '';
                  const availableCount = selectedPersonId
                    ? cluster.candidates.filter(({ face }) => !face.rejectedPersonIds?.includes(selectedPersonId)).length
                    : cluster.candidates.length;
                  return (
                    <article key={cluster.id} className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
                      <div className="grid grid-cols-[120px_1fr] gap-3 p-3">
                        <div className="h-32 overflow-hidden rounded-xl bg-stone-100">
                          <FacePortrait media={cluster.representative.media} face={cluster.representative.face} />
                        </div>
                        <div className="flex flex-col justify-center">
                          <p className="font-semibold text-stone-900">Нераспознанное лицо</p>
                          <p className="mt-1 text-xs text-stone-500">Найдено на {cluster.candidates.length} фото</p>
                          <p className="mt-2 truncate text-[11px] text-stone-400" title={cluster.representative.media.name}>{cluster.representative.media.name}</p>
                        </div>
                      </div>
                      <div className="space-y-2 border-t border-stone-100 p-3">
                        <label className="flex items-center gap-2 text-xs font-medium text-stone-700">
                          <UserRound className="h-4 w-4 text-amber-700" /> Кому принадлежит лицо?
                        </label>
                        <select
                          value={selectedPersonId}
                          onChange={(event) => setSelectedPersonByCluster((current) => ({ ...current, [cluster.id]: event.target.value }))}
                          className="w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-xs text-stone-800"
                        >
                          <option value="">Выберите персону из дерева</option>
                          {persons.map((person) => <option key={person.id} value={person.id}>{formatFullName(person)}</option>)}
                        </select>
                        <button
                          type="button"
                          disabled={!selectedPersonId || availableCount === 0 || isSavingReview}
                          onClick={() => startReview(cluster.id)}
                          className="w-full rounded-lg bg-amber-600 px-3 py-2 text-xs font-bold text-white hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-45"
                        >
                          Проверить {availableCount} фото
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            </div>
          )}
        </main>

        <footer className="flex items-center justify-between border-t border-stone-200 bg-stone-50 px-5 py-3 text-xs text-stone-500">
          <span>{persons.length} персон в дереве · {allPhotos.length} фото в архиве</span>
          <button type="button" onClick={onClose} disabled={isScanningAll || isSavingReview} className="rounded-lg bg-stone-900 px-4 py-2 font-semibold text-white hover:bg-stone-800 disabled:opacity-50">Закрыть</button>
        </footer>
      </div>
    </div>
  );
};
