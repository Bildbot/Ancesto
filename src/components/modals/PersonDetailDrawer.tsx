import React, { useState, useMemo } from 'react';
import { 
  Person, 
  RelationshipRecord, 
  MediaItem, 
  FaceTag,
  FaceBox,
  RelationshipType,
  RelativeRole
} from '../../types/genealogy';
import { 
  formatFullName, 
  calculateAge, 
  getParents, 
  getChildren, 
  getSpouses, 
  getSiblings, 
  getDetailedParents,
  getDetailedChildren,
  getDetailedSiblings,
  getOtherRelationships,
  describeKinship,
  formatDisplayDate
} from '../../utils/kinship';
import { 
  X, 
  Edit3, 
  Calendar, 
  FileText, 
  Image as ImageIcon, 
  Users, 
  MapPin, 
  Plus, 
  Focus, 
  Heart, 
  ChevronRight, 
  ExternalLink,
  Award,
  Download,
  Film,
  FileCheck,
  Trash2,
  UserCheck,
  ShieldCheck,
  AlertTriangle,
  Scan,
  Sparkles,
  User,
  Check
} from 'lucide-react';
import { PhotoFaceViewer } from '../media/PhotoFaceViewer';
import { extractBestFaceAvatar } from '../../services/faceRecognition';

/**
 * Automatically calculates and applies an 'object-fit: cover' and 'object-position: center' style
 * based on the facial bounding box coordinates detected in the photo,
 * ensuring the face is always centered and cropped in the thumbnail.
 */
export function getPortraitFaceStyle(box?: FaceBox | null): React.CSSProperties {
  if (!box) {
    return {
      objectFit: 'cover',
      objectPosition: 'center',
    };
  }

  // Calculate face center coordinates in percentage (0-100%)
  const centerX = Math.max(0, Math.min(100, Math.round(box.x + box.width / 2)));
  const centerY = Math.max(0, Math.min(100, Math.round(box.y + box.height / 2)));

  // Calculate zoom scale so the face naturally fills the portrait thumbnail (approx 60-65% of thumbnail)
  const faceDimension = Math.max(box.width, box.height);
  const targetFaceRatio = 60;
  const scale = faceDimension > 0 && faceDimension < targetFaceRatio 
    ? Math.min(3.5, Math.max(1, Number((targetFaceRatio / faceDimension).toFixed(2))))
    : 1;

  // Use 'center' if already approximately centered, or precise percentage position
  const isCentered = Math.abs(centerX - 50) < 3 && Math.abs(centerY - 50) < 3;
  const objectPosition = isCentered ? 'center' : `${centerX}% ${centerY}%`;

  return {
    objectFit: 'cover',
    objectPosition,
    transformOrigin: `${centerX}% ${centerY}%`,
    transform: scale > 1 ? `scale(${scale})` : undefined,
  };
}

interface PersonDetailDrawerProps {
  person: Person | null;
  isOpen: boolean;
  onClose: () => void;
  onEdit: (person: Person) => void;
  onAddRelative: (targetPersonId: string, role: RelativeRole) => void;
  onSelectPerson: (personId: string) => void;
  allPersons: Person[];
  relationships: RelationshipRecord[];
  onFocusInTree?: (personId: string) => void;
  onDeleteRelationship?: (person1Id: string, person2Id: string, type?: RelationshipType, relationshipId?: string) => void;
  onUpdatePerson?: (updatedPerson: Person) => void;
  onUpdateAllPersons?: (allPersons: Person[]) => void;
}

export const PersonDetailDrawer: React.FC<PersonDetailDrawerProps> = ({
  person,
  isOpen,
  onClose,
  onEdit,
  onAddRelative,
  onSelectPerson,
  allPersons,
  relationships,
  onFocusInTree,
  onDeleteRelationship,
  onUpdatePerson,
  onUpdateAllPersons
}) => {
  // Always call all hooks unconditionally at top level (Rules of Hooks)
  const [activeTab, setActiveTab] = useState<'family' | 'dates' | 'bio' | 'media'>('family');
  const [lightboxMedia, setLightboxMedia] = useState<MediaItem | null>(null);
  const [confirmDeleteRel, setConfirmDeleteRel] = useState<{
    targetId: string;
    targetName: string;
    type: RelationshipType;
    roleDescription: string;
    relationshipId?: string;
  } | null>(null);

  // Collect all media for this person: direct mediaFiles + photos where this person is tagged in faces
  const displayMediaFiles = useMemo<{ media: MediaItem; isTaggedShared: boolean; ownerName?: string }[]>(() => {
    if (!person) return [];
    const mediaMap = new Map<string, { media: MediaItem; isTaggedShared: boolean; ownerName?: string }>();
    if (person.mediaFiles) {
      person.mediaFiles.forEach((m) => {
        const isFromAnother = Boolean(m.originPersonId && m.originPersonId !== person.id);
        const owner = isFromAnother ? allPersons.find((p) => p.id === m.originPersonId) : undefined;
        mediaMap.set(m.id, {
          media: m,
          isTaggedShared: isFromAnother,
          ownerName: owner ? formatFullName(owner, { format: 'short' }) : undefined
        });
      });
    }
    allPersons.forEach((otherPerson) => {
      if (otherPerson.id === person.id || !otherPerson.mediaFiles) return;
      otherPerson.mediaFiles.forEach((m) => {
        if (m.faces?.some((f: FaceTag) => f.personId === person.id)) {
          if (!mediaMap.has(m.id)) {
            mediaMap.set(m.id, { 
              media: m, 
              isTaggedShared: true,
              ownerName: formatFullName(otherPerson, { format: 'short' })
            });
          }
        }
      });
    });
    return Array.from(mediaMap.values());
  }, [person, allPersons]);

  // Direct upload from drawer media tab
  const handleDirectUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0 || !person) return;

    Array.from(files).forEach((file) => {
      const reader = new FileReader();
      reader.onload = (event) => {
        const dataUrl = event.target?.result as string;
        let type: MediaItem['type'] = 'document';
        if (file.type.startsWith('image/')) type = 'photo';
        else if (file.type.startsWith('video/')) type = 'video';

        const newMedia: MediaItem = {
          id: 'media-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
          type,
          name: file.name.replace(/\.[^/.]+$/, ''),
          date: '',
          dataUrl,
          mimeType: file.type,
          size: file.size,
          originPersonId: person.id,
          faces: []
        };

        const currentFiles = person.mediaFiles ? [...person.mediaFiles, newMedia] : [newMedia];
        const updatedPerson = { ...person, mediaFiles: currentFiles };

        if (onUpdateAllPersons) {
          const nextPersons = allPersons.map((p) => (p.id === person.id ? updatedPerson : p));
          onUpdateAllPersons(nextPersons);
        } else if (onUpdatePerson) {
          onUpdatePerson(updatedPerson);
        }

        if (type === 'photo') {
          setLightboxMedia(newMedia);
        }
      };
      reader.readAsDataURL(file);
    });
    e.target.value = '';
  };

  // Set photo as avatar, automatically cropped to the person's face
  const handleSetMediaAsAvatar = async (m: MediaItem) => {
    if (!person) return;
    try {
      const face = m.faces?.find((f) => f.personId === person.id) || m.faces?.[0];
      const cropped = await extractBestFaceAvatar(m.dataUrl, person.id, m.faces);
      const updatedPerson: Person = { 
        ...person, 
        avatarUrl: cropped,
        avatarFaceBox: face?.box
      };
      if (onUpdatePerson) {
        onUpdatePerson(updatedPerson);
      }
      if (onUpdateAllPersons) {
        const nextList = allPersons.map((p) => (p.id === person.id ? updatedPerson : p));
        onUpdateAllPersons(nextList);
      }
    } catch (err) {
      console.error('Failed to set face avatar:', err);
    }
  };

  // Set cropped face avatar for any target person from lightbox
  const handleSetAvatar = (croppedAvatar: string, destPersonId?: string, faceBox?: FaceBox) => {
    if (!person) return;
    const targetId = destPersonId || person.id;
    const targetObj = allPersons.find((p) => p.id === targetId);
    if (!targetObj) return;
    const updatedTarget: Person = { 
      ...targetObj, 
      avatarUrl: croppedAvatar,
      avatarFaceBox: faceBox || targetObj.avatarFaceBox
    };

    if (targetId === person.id && onUpdatePerson) {
      onUpdatePerson(updatedTarget);
    }
    if (onUpdateAllPersons) {
      const nextList = allPersons.map((p) => (p.id === targetId ? updatedTarget : p));
      onUpdateAllPersons(nextList);
    }
  };

  // Portrait generation & resolution logic:
  // Automatically determines portrait photo source and bounding box coordinates,
  // applying an 'object-fit: cover' and 'object-position: center' style
  // based on the facial bounding box coordinates detected in the photo, ensuring the face is always centered and cropped in the thumbnail.
  const portraitInfo = useMemo<{
    src: string;
    faceBox?: FaceBox;
    style: React.CSSProperties;
    isAutoGeneratedFromPhoto?: boolean;
  } | null>(() => {
    if (!person) return null;

    const isSvgAvatar = Boolean(
      person.avatarUrl && 
      (person.avatarUrl.startsWith('data:image/svg') || person.avatarUrl.includes('<svg'))
    );

    // Helper to find detected face for this person in a media item
    const findFaceForPerson = (media: MediaItem): FaceTag | undefined => {
      if (!media.faces || media.faces.length === 0) return undefined;
      // 1. Confirmed face tagged with this person
      const confirmed = media.faces.find((f: FaceTag) => f.personId === person.id && f.isConfirmed && f.box);
      if (confirmed) return confirmed;
      // 2. Any face tagged with this person with box
      const tagged = media.faces.find((f: FaceTag) => f.personId === person.id && f.box);
      if (tagged) return tagged;
      // 3. If photo was uploaded by this person, return first face with box
      if (media.originPersonId === person.id && media.faces[0]?.box) {
        return media.faces[0];
      }
      return undefined;
    };

    // 1. If person has an explicit custom avatar photo (not an SVG placeholder)
    if (person.avatarUrl && !isSvgAvatar) {
      if (person.avatarFaceBox) {
        return {
          src: person.avatarUrl,
          faceBox: person.avatarFaceBox,
          style: getPortraitFaceStyle(person.avatarFaceBox)
        };
      }

      // Check if avatarUrl matches any photo in media files to retrieve detected face coordinates
      const matchedMedia = displayMediaFiles.find(
        (item) => item.media.dataUrl === person.avatarUrl
      )?.media || person.mediaFiles?.find((m) => m.dataUrl === person.avatarUrl);

      if (matchedMedia) {
        const face = findFaceForPerson(matchedMedia);
        if (face?.box) {
          return {
            src: person.avatarUrl,
            faceBox: face.box,
            style: getPortraitFaceStyle(face.box)
          };
        }
      }

      // Standalone photo avatar without detected face box -> standard cover + center
      return {
        src: person.avatarUrl,
        faceBox: undefined,
        style: getPortraitFaceStyle(undefined)
      };
    }

    // 2. Automatic portrait generation: if avatar is default SVG or empty,
    // automatically search displayMediaFiles and person.mediaFiles for photos with detected faces!
    for (const item of displayMediaFiles) {
      const m = item.media;
      if (m.type === 'photo') {
        const face = findFaceForPerson(m);
        if (face?.box) {
          return {
            src: m.dataUrl,
            faceBox: face.box,
            style: getPortraitFaceStyle(face.box),
            isAutoGeneratedFromPhoto: true
          };
        }
      }
    }

    if (person.mediaFiles) {
      for (const m of person.mediaFiles) {
        if (m.type === 'photo') {
          const face = findFaceForPerson(m);
          if (face?.box) {
            return {
              src: m.dataUrl,
              faceBox: face.box,
              style: getPortraitFaceStyle(face.box),
              isAutoGeneratedFromPhoto: true
            };
          }
        }
      }
    }

    // 3. Fallback to existing SVG avatar if available
    if (person.avatarUrl) {
      return {
        src: person.avatarUrl,
        faceBox: undefined,
        style: getPortraitFaceStyle(undefined)
      };
    }

    return null;
  }, [person, displayMediaFiles]);

  if (!isOpen || !person) return null;

  const detailedParents = getDetailedParents(person.id, allPersons, relationships);
  const detailedChildren = getDetailedChildren(person.id, allPersons, relationships);
  const spouses = getSpouses(person.id, allPersons, relationships);
  const detailedSiblings = getDetailedSiblings(person.id, allPersons, relationships);
  const otherRelations = getOtherRelationships(person.id, allPersons, relationships);
  const ageInfo = calculateAge(person.birthDate, person.deathDate, person.isDeceased);

  const totalFamilyCount = detailedParents.length + detailedChildren.length + spouses.length + detailedSiblings.length + otherRelations.length;

  return (
    <>
      <div 
        className="fixed inset-0 z-40 bg-stone-950/40 backdrop-blur-2xs transition-opacity"
        onClick={onClose}
      />

      <div 
        className="fixed inset-y-0 right-0 z-40 w-full max-w-lg bg-stone-50 border-l border-stone-200 shadow-2xl flex flex-col transform transition-transform duration-200 ease-out sm:rounded-l-2xl overflow-hidden"
        role="dialog"
      >
        {/* Top Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-stone-200 bg-white">
          <div className="flex items-center gap-2">
            <span className="text-xs uppercase tracking-wider font-semibold text-stone-500 font-sans">
              Карточка персоналии
            </span>
            {person.isDeceased ? (
              <span className="text-[11px] text-stone-500">· Память</span>
            ) : (
              <span className="text-[11px] text-emerald-700 font-medium">· Жив(а)</span>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            {onFocusInTree && (
              <button
                onClick={() => {
                  onFocusInTree(person.id);
                  onClose();
                }}
                className="p-2 text-stone-600 hover:text-stone-900 hover:bg-stone-100 rounded-lg transition"
                title="Показать в центре древа"
              >
                <Focus className="w-4 h-4" />
              </button>
            )}
            <button
              onClick={() => onEdit(person)}
              className="p-2 text-stone-600 hover:text-stone-900 hover:bg-stone-100 rounded-lg transition"
              title="Редактировать персоналию"
            >
              <Edit3 className="w-4 h-4" />
            </button>
            <button
              onClick={onClose}
              className="p-2 text-stone-400 hover:text-stone-800 hover:bg-stone-100 rounded-lg transition"
              aria-label="Закрыть"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Hero Section */}
        <div className="p-5 sm:p-6 bg-gradient-to-b from-white to-stone-100/70 border-b border-stone-200">
          <div className="flex items-start gap-4">
            {/* Avatar / Portrait */}
            <div className="relative flex-shrink-0">
              <div className="w-20 h-20 rounded-2xl overflow-hidden border-2 border-stone-200 shadow-sm bg-stone-200 flex items-center justify-center">
                {portraitInfo ? (
                  <img
                    src={portraitInfo.src}
                    alt={formatFullName(person)}
                    className="w-full h-full object-cover object-center"
                    style={{
                      objectFit: 'cover',
                      objectPosition: 'center',
                      ...portraitInfo.style
                    }}
                  />
                ) : person.avatarUrl ? (
                  <img
                    src={person.avatarUrl}
                    alt={formatFullName(person)}
                    className="w-full h-full object-cover object-center"
                    style={{
                      objectFit: 'cover',
                      objectPosition: 'center'
                    }}
                  />
                ) : (
                  <div className="w-full h-full bg-stone-800 text-amber-200 flex items-center justify-center font-serif text-xl font-bold">
                    {person.firstName[0]}
                    {person.lastName[0]}
                  </div>
                )}
              </div>
              {person.gender === 'female' ? (
                <span className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-rose-500 text-white flex items-center justify-center text-[10px] font-bold shadow-xs">
                  ♀
                </span>
              ) : (
                <span className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-sky-600 text-white flex items-center justify-center text-[10px] font-bold shadow-xs">
                  ♂
                </span>
              )}
            </div>

            {/* Name and main titles */}
            <div className="flex-1 min-w-0">
              <h2 className="text-xl sm:text-2xl font-serif font-bold text-stone-900 tracking-tight leading-snug">
                {formatFullName(person, { format: 'formal' })}
              </h2>

              {person.maidenName && (
                <p className="text-xs text-stone-500 italic mt-0.5">
                  Урождённая: {person.maidenName}
                </p>
              )}

              <p className="text-xs font-mono font-medium text-amber-900 mt-1">
                {ageInfo.text}
              </p>

              {person.occupation && (
                <p className="text-xs text-stone-700 font-medium mt-1">
                  {person.occupation}
                </p>
              )}

              {person.birthPlace && (
                <div className="flex items-center gap-1 text-xs text-stone-500 mt-1">
                  <MapPin className="w-3 h-3 text-stone-400 shrink-0" />
                  <span className="truncate">{person.birthPlace}</span>
                </div>
              )}
            </div>
          </div>

          {/* Tags */}
          {person.tags && person.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-4 text-xs text-stone-600">
              {person.tags.map((tag, idx) => (
                <span key={idx} className="bg-stone-200/80 text-stone-700 px-2 py-0.5 rounded-md text-[11px]">
                  {tag}
                </span>
              ))}
            </div>
          )}

          {/* Quick Relationship Actions */}
          <div className="grid grid-cols-4 gap-2 mt-4 pt-3 border-t border-stone-200">
            <button
              onClick={() => onAddRelative(person.id, 'parent')}
              className="py-1.5 px-2 text-center rounded-lg bg-white hover:bg-stone-200/80 border border-stone-200 text-stone-700 text-[11px] font-medium transition"
              title={`Добавить родителя (отца или мать) для ${formatFullName(person, { format: 'short' })}`}
            >
              + Родитель
            </button>
            <button
              onClick={() => onAddRelative(person.id, 'spouse')}
              className="py-1.5 px-2 text-center rounded-lg bg-white hover:bg-stone-200/80 border border-stone-200 text-stone-700 text-[11px] font-medium transition"
              title={`Добавить супруга/супругу для ${formatFullName(person, { format: 'short' })}`}
            >
              + Супруг(а)
            </button>
            <button
              onClick={() => onAddRelative(person.id, 'child')}
              className="py-1.5 px-2 text-center rounded-lg bg-white hover:bg-stone-200/80 border border-stone-200 text-stone-700 text-[11px] font-medium transition"
              title={`Добавить ребёнка (сына или дочь) для ${formatFullName(person, { format: 'short' })}`}
            >
              + Ребёнок
            </button>
            <button
              onClick={() => onAddRelative(person.id, 'sibling')}
              className="py-1.5 px-2 text-center rounded-lg bg-white hover:bg-stone-200/80 border border-stone-200 text-stone-700 text-[11px] font-medium transition"
              title={`Добавить брата или сестру для ${formatFullName(person, { format: 'short' })}`}
            >
              + Брат/Сестра
            </button>
          </div>
        </div>

        {/* Tab Controls */}
        <div className="flex items-center px-4 bg-stone-100 border-b border-stone-200 gap-1 overflow-x-auto no-scrollbar">
          <button
            onClick={() => setActiveTab('family')}
            className={`py-2.5 px-3 text-xs font-medium border-b-2 transition whitespace-nowrap ${
              activeTab === 'family'
                ? 'border-amber-600 text-stone-900 font-semibold'
                : 'border-transparent text-stone-500 hover:text-stone-800'
            }`}
          >
            Семья и связи ({totalFamilyCount})
          </button>

          <button
            onClick={() => setActiveTab('dates')}
            className={`py-2.5 px-3 text-xs font-medium border-b-2 transition whitespace-nowrap ${
              activeTab === 'dates'
                ? 'border-amber-600 text-stone-900 font-semibold'
                : 'border-transparent text-stone-500 hover:text-stone-800'
            }`}
          >
            Вехи жизни ({person.significantDates?.length || 0})
          </button>

          <button
            onClick={() => setActiveTab('bio')}
            className={`py-2.5 px-3 text-xs font-medium border-b-2 transition whitespace-nowrap ${
              activeTab === 'bio'
                ? 'border-amber-600 text-stone-900 font-semibold'
                : 'border-transparent text-stone-500 hover:text-stone-800'
            }`}
          >
            Биография
          </button>

          <button
            onClick={() => setActiveTab('media')}
            className={`py-2.5 px-3 text-xs font-medium border-b-2 transition whitespace-nowrap ${
              activeTab === 'media'
                ? 'border-amber-600 text-stone-900 font-semibold'
                : 'border-transparent text-stone-500 hover:text-stone-800'
            }`}
          >
            Медиа & Документы ({displayMediaFiles.length})
          </button>
        </div>

        {/* Tab Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* TAB: SIGNIFICANT DATES */}
          {activeTab === 'dates' && (
            <div className="space-y-4">
              {(!person.significantDates || person.significantDates.length === 0) ? (
                <div className="text-center py-10 text-stone-500">
                  <Calendar className="w-8 h-8 mx-auto text-stone-400 mb-2" />
                  <p className="text-xs">Значимые даты пока не внесены</p>
                  <button
                    onClick={() => onEdit(person)}
                    className="mt-3 px-3 py-1.5 text-xs font-medium rounded-lg bg-stone-900 text-white hover:bg-stone-800"
                  >
                    Добавить событие
                  </button>
                </div>
              ) : (
                <div className="relative pl-6 space-y-6 before:absolute before:left-2 before:top-2 before:bottom-2 before:w-0.5 before:bg-stone-200">
                  {person.significantDates
                    .slice()
                    .sort((a, b) => (a.date > b.date ? 1 : -1))
                    .map((item) => (
                      <div key={item.id} className="relative group">
                        {/* Dot indicator */}
                        <div className="absolute -left-[27px] top-1 w-3.5 h-3.5 rounded-full bg-amber-500 ring-4 ring-white border-2 border-stone-800" />

                        <div className="p-3.5 rounded-xl bg-white border border-stone-200 shadow-2xs">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-mono font-bold text-amber-800">
                              {formatDisplayDate(item.date)}
                            </span>
                            {item.location && (
                              <span className="text-[11px] text-stone-500 flex items-center gap-1">
                                <MapPin className="w-3 h-3 text-stone-400" />
                                {item.location}
                              </span>
                            )}
                          </div>
                          <h4 className="text-sm font-semibold text-stone-900 mt-1">
                            {item.title}
                          </h4>
                          {item.description && (
                            <p className="text-xs text-stone-600 mt-1 leading-relaxed">
                              {item.description}
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                </div>
              )}
            </div>
          )}

          {/* TAB: BIOGRAPHY */}
          {activeTab === 'bio' && (
            <div className="space-y-4">
              {person.bio ? (
                <div className="prose prose-stone text-sm leading-relaxed text-stone-800 bg-white p-5 rounded-xl border border-stone-200 shadow-2xs whitespace-pre-line font-serif">
                  {person.bio}
                </div>
              ) : (
                <div className="text-center py-10 text-stone-500">
                  <FileText className="w-8 h-8 mx-auto text-stone-400 mb-2" />
                  <p className="text-xs">Подробная биография еще не заполнена</p>
                  <button
                    onClick={() => onEdit(person)}
                    className="mt-3 px-3 py-1.5 text-xs font-medium rounded-lg bg-stone-900 text-white hover:bg-stone-800"
                  >
                    Написать биографию
                  </button>
                </div>
              )}
            </div>
          )}

          {/* TAB: MEDIA & DOCUMENTS */}
          {activeTab === 'media' && (
            <div className="space-y-4">
              {/* Media Section Toolbar */}
              <div className="flex items-center justify-between pb-3 border-b border-stone-200">
                <div>
                  <h3 className="text-xs font-bold text-stone-800 uppercase tracking-wider font-sans">
                    Медиафайлы и сканы ({displayMediaFiles.length})
                  </h3>
                  <p className="text-[11px] text-stone-500">
                    Персональные фото и групповые снимки, где персона отмечена
                  </p>
                </div>
                <label className="cursor-pointer inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-amber-600 hover:bg-amber-700 text-white shadow-xs transition">
                  <Plus className="w-3.5 h-3.5" />
                  <span>Загрузить фото</span>
                  <input
                    type="file"
                    multiple
                    accept="image/*,application/pdf"
                    onChange={handleDirectUpload}
                    className="hidden"
                  />
                </label>
              </div>

              {displayMediaFiles.length === 0 ? (
                <div className="text-center py-10 text-stone-500 bg-stone-100/60 rounded-xl border border-dashed border-stone-300 p-6">
                  <ImageIcon className="w-9 h-9 mx-auto text-stone-400 mb-2" />
                  <p className="text-xs font-medium text-stone-700">Медиафайлы и документы пока не прикреплены</p>
                  <p className="text-[11px] text-stone-500 mt-1 max-w-xs mx-auto">
                    Загрузите портрет или групповое фото. Если на фото есть несколько человек, отметьте их — фото появится в карточке каждого!
                  </p>
                  <label className="mt-3.5 cursor-pointer inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg bg-stone-900 text-white hover:bg-stone-800 transition shadow-xs">
                    <Plus className="w-3.5 h-3.5" />
                    <span>Выбрать фото на устройстве</span>
                    <input
                      type="file"
                      multiple
                      accept="image/*,application/pdf"
                      onChange={handleDirectUpload}
                      className="hidden"
                    />
                  </label>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  {displayMediaFiles.map(({ media: m, isTaggedShared, ownerName }: { media: MediaItem; isTaggedShared: boolean; ownerName?: string }) => (
                    <div
                      key={m.id}
                      onClick={() => setLightboxMedia(m)}
                      className="group cursor-pointer rounded-xl overflow-hidden border border-stone-200 bg-white shadow-2xs hover:shadow-md transition flex flex-col"
                    >
                      <div className="h-32 bg-stone-100 flex items-center justify-center overflow-hidden relative">
                        {m.type === 'photo' ? (
                          <img
                            src={m.dataUrl}
                            alt={m.name}
                            className="w-full h-full object-cover object-center group-hover:scale-105 transition duration-300"
                            style={(() => {
                              const face = m.faces?.find((f: FaceTag) => f.personId === person.id) || m.faces?.[0];
                              return getPortraitFaceStyle(face?.box);
                            })()}
                          />
                        ) : m.type === 'video' ? (
                          <div className="flex flex-col items-center gap-1 text-amber-700">
                            <Film className="w-8 h-8" />
                            <span className="text-[10px] font-medium uppercase">Видеозапись</span>
                          </div>
                        ) : (
                          <div className="flex flex-col items-center gap-1 text-stone-700">
                            <FileCheck className="w-8 h-8" />
                            <span className="text-[10px] font-medium uppercase">Скан документа</span>
                          </div>
                        )}

                        {/* Tagged from another relative badge */}
                        {isTaggedShared && (
                          <span className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded bg-amber-500 text-stone-950 text-[9px] font-bold shadow-xs flex items-center gap-1">
                            <UserCheck className="w-2.5 h-2.5" />
                            <span>Отмечен(а) на фото</span>
                          </span>
                        )}

                        {/* Face Badge */}
                        {m.faces && m.faces.length > 0 && (
                          <div className="absolute top-1.5 right-1.5 flex items-center gap-1">
                            <span className="px-1.5 py-0.5 rounded bg-black/75 text-white text-[10px] font-medium flex items-center gap-1 backdrop-blur-xs">
                              <User className="w-2.5 h-2.5 text-amber-400" />
                              <span>{m.faces.length}</span>
                            </span>
                            {m.faces.some((f: FaceTag) => !f.isConfirmed && f.suggestedPersonId) && (
                              <span className="p-0.5 rounded bg-amber-500 text-stone-950 text-[10px] animate-pulse">
                                <Sparkles className="w-2.5 h-2.5" />
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                      <div className="p-2.5 flex-1 flex flex-col justify-between">
                        <div>
                          <p className="text-xs font-semibold text-stone-900 truncate">{m.name}</p>
                          {isTaggedShared && ownerName && (
                            <p className="text-[10px] text-amber-800 font-medium truncate mt-0.5">
                              Из архива: {ownerName}
                            </p>
                          )}
                          {m.date && <p className="text-[10px] text-stone-400 mt-0.5">{m.date}</p>}
                          {m.caption && <p className="text-[11px] text-stone-600 line-clamp-2 mt-1">{m.caption}</p>}
                        </div>

                        {/* Avatar action on photo */}
                        {m.type === 'photo' && (
                          <div className="flex items-center justify-between mt-2 pt-1.5 border-t border-stone-100">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleSetMediaAsAvatar(m);
                              }}
                              className="text-[10px] font-semibold text-amber-800 hover:text-amber-950 flex items-center gap-1 transition"
                              title="Обрезать лицо на фото и сделать главным портретом персоны"
                            >
                              <UserCheck className="w-3 h-3 text-amber-600" />
                              <span>Портрет лица</span>
                            </button>
                            <span className="text-[10px] text-stone-400">Лица ({m.faces?.length || 0})</span>
                          </div>
                        )}

                        {/* People tagged on this photo */}
                        {m.faces && m.faces.filter((f: FaceTag) => f.personId).length > 0 && (
                          <div className="flex flex-wrap items-center gap-1 mt-2 pt-1.5 border-t border-stone-100">
                            <span className="text-[9px] text-stone-400 font-medium">На фото:</span>
                            {m.faces
                              .filter((f: FaceTag) => f.personId)
                              .map((f: FaceTag) => {
                                const taggedPerson = allPersons.find((p) => p.id === f.personId);
                                if (!taggedPerson) return null;
                                const isSelf = taggedPerson.id === person.id;
                                return (
                                  <span
                                    key={f.id}
                                    className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-medium transition ${
                                      isSelf
                                        ? 'bg-amber-100 text-amber-900 border border-amber-300 font-bold'
                                        : 'bg-stone-100 text-stone-700 hover:bg-amber-100 hover:text-amber-900 cursor-pointer'
                                    }`}
                                    onClick={(e) => {
                                      if (!isSelf) {
                                        e.stopPropagation();
                                        onSelectPerson(taggedPerson.id);
                                      }
                                    }}
                                    title={!isSelf ? `Перейти к ${formatFullName(taggedPerson)}` : 'Текущая персона'}
                                  >
                                    <User className="w-2.5 h-2.5" />
                                    <span>{taggedPerson.firstName} {taggedPerson.lastName}</span>
                                  </span>
                                );
                              })}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB: FAMILY & RELATIVES */}
          {activeTab === 'family' && (
            <div className="space-y-4">
              {/* Delete Relationship Confirmation Alert */}
              {confirmDeleteRel && (
                <div className="p-3.5 bg-red-50 border border-red-200 rounded-xl space-y-2.5 animate-in fade-in shadow-2xs">
                  <div className="flex items-start gap-2.5 text-red-900">
                    <Trash2 className="w-4 h-4 text-red-600 mt-0.5 shrink-0" />
                    <div>
                      <p className="text-xs font-semibold">
                        Удалить родственную связь: {confirmDeleteRel.roleDescription} «{confirmDeleteRel.targetName}»?
                      </p>
                      <p className="text-[11px] text-red-700/90 mt-0.5 leading-relaxed">
                        Сама персона «{confirmDeleteRel.targetName}» останется в базе древа, будет удалена только связь между ней и «{formatFullName(person, { format: 'short' })}».
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center justify-end gap-2 pt-1 border-t border-red-200/60">
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteRel(null)}
                      className="px-3 py-1.5 text-xs rounded-lg border border-stone-300 bg-white text-stone-700 hover:bg-stone-50 font-medium transition"
                    >
                      Отмена
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (onDeleteRelationship) {
                          onDeleteRelationship(
                            person.id, 
                            confirmDeleteRel.targetId, 
                            confirmDeleteRel.type,
                            confirmDeleteRel.relationshipId
                          );
                        }
                        setConfirmDeleteRel(null);
                      }}
                      className="px-3.5 py-1.5 text-xs rounded-lg bg-red-600 text-white font-medium hover:bg-red-700 shadow-2xs transition"
                    >
                      Да, разорвать связь
                    </button>
                  </div>
                </div>
              )}

              {/* Parents */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold uppercase tracking-wider text-stone-500">
                    Родители ({detailedParents.length})
                  </span>
                  <button
                    type="button"
                    onClick={() => onAddRelative(person.id, 'parent')}
                    className="text-[11px] font-medium text-amber-800 hover:text-amber-900 flex items-center gap-1 hover:underline"
                  >
                    <Plus className="w-3 h-3" />
                    Добавить родителя
                  </button>
                </div>

                {detailedParents.length === 0 ? (
                  <div className="p-3 bg-white rounded-xl border border-dashed border-stone-200 text-center">
                    <p className="text-xs text-stone-400 italic">Родители пока не указаны</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {detailedParents.map(({ person: p, isAdoptive, rel }) => (
                      <div
                        key={p.id}
                        onClick={() => onSelectPerson(p.id)}
                        className="group flex items-center justify-between p-3 rounded-xl bg-white border border-stone-200 hover:border-amber-400 cursor-pointer transition shadow-2xs"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-9 h-9 rounded-lg bg-stone-200 overflow-hidden flex items-center justify-center text-xs font-bold font-serif text-stone-700 shrink-0">
                            {p.avatarUrl ? <img src={p.avatarUrl} alt="" className="w-full h-full object-cover object-center" style={getPortraitFaceStyle(p.avatarFaceBox)} /> : p.firstName[0]}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <p className="text-xs font-bold text-stone-900 truncate">{formatFullName(p)}</p>
                              {isAdoptive ? (
                                <span className="bg-violet-100 text-violet-800 border border-violet-200 text-[10px] font-semibold px-1.5 py-0.2 rounded">
                                  Приёмный
                                </span>
                              ) : (
                                <span className="bg-stone-100 text-stone-600 text-[10px] font-medium px-1.5 py-0.2 rounded">
                                  Кровный
                                </span>
                              )}
                            </div>
                            <p className="text-[11px] text-stone-500 mt-0.5">
                              {isAdoptive 
                                ? (p.gender === 'female' ? 'Приёмная мать' : 'Приёмный отец')
                                : (p.gender === 'female' ? 'Мать' : 'Отец')
                              }
                              {p.birthDate ? ` · род. ${p.birthDate.slice(0, 4)} г.` : ''}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-1 shrink-0 ml-2">
                          {onDeleteRelationship && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setConfirmDeleteRel({
                                  targetId: p.id,
                                  targetName: formatFullName(p),
                                  type: isAdoptive ? 'adoptive-parent' : 'parent',
                                  roleDescription: isAdoptive 
                                    ? (p.gender === 'female' ? 'приёмная мать' : 'приёмный отец')
                                    : (p.gender === 'female' ? 'мать' : 'отец'),
                                  relationshipId: rel.id
                                });
                              }}
                              className="p-1.5 rounded-lg text-stone-400 hover:text-red-600 hover:bg-red-50 transition"
                              title="Удалить эту родственную связь"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                          <ChevronRight className="w-4 h-4 text-stone-400 group-hover:text-stone-700 transition" />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Spouses */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold uppercase tracking-wider text-stone-500">
                    Супруг(а) ({spouses.length})
                  </span>
                  <button
                    type="button"
                    onClick={() => onAddRelative(person.id, 'spouse')}
                    className="text-[11px] font-medium text-amber-800 hover:text-amber-900 flex items-center gap-1 hover:underline"
                  >
                    <Plus className="w-3 h-3" />
                    Добавить супруга
                  </button>
                </div>

                {spouses.length === 0 ? (
                  <div className="p-3 bg-white rounded-xl border border-dashed border-stone-200 text-center">
                    <p className="text-xs text-stone-400 italic">Супруги не указаны</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {spouses.map(({ person: sp, rel }) => {
                      const isFormer = rel.type === 'former-spouse';
                      return (
                        <div
                          key={sp.id}
                          onClick={() => onSelectPerson(sp.id)}
                          className="group flex items-center justify-between p-3 rounded-xl bg-white border border-stone-200 hover:border-amber-400 cursor-pointer transition shadow-2xs"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="w-9 h-9 rounded-lg bg-stone-200 overflow-hidden flex items-center justify-center text-xs font-bold font-serif text-stone-700 shrink-0">
                              {sp.avatarUrl ? <img src={sp.avatarUrl} alt="" className="w-full h-full object-cover object-center" style={getPortraitFaceStyle(sp.avatarFaceBox)} /> : sp.firstName[0]}
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <p className="text-xs font-bold text-stone-900 truncate">{formatFullName(sp)}</p>
                                {isFormer ? (
                                  <span className="bg-stone-100 text-stone-600 text-[10px] font-medium px-1.5 py-0.2 rounded">
                                    Бывший брак
                                  </span>
                                ) : (
                                  <span className="bg-rose-50 text-rose-700 border border-rose-200 text-[10px] font-semibold px-1.5 py-0.2 rounded">
                                    В браке
                                  </span>
                                )}
                              </div>
                              <p className="text-[11px] text-stone-500 mt-0.5">
                                {isFormer
                                  ? (sp.gender === 'female' ? 'Бывшая жена' : 'Бывший муж')
                                  : (sp.gender === 'female' ? 'Жена' : 'Муж')
                                }
                                {rel.startDate ? ` · Брак с ${rel.startDate.slice(0, 4)} г.` : ''}
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center gap-1 shrink-0 ml-2">
                            {onDeleteRelationship && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setConfirmDeleteRel({
                                    targetId: sp.id,
                                    targetName: formatFullName(sp),
                                    type: rel.type,
                                    roleDescription: sp.gender === 'female' ? 'жена' : 'муж',
                                    relationshipId: rel.id
                                  });
                                }}
                                className="p-1.5 rounded-lg text-stone-400 hover:text-red-600 hover:bg-red-50 transition"
                                title="Удалить супружескую связь"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                            <ChevronRight className="w-4 h-4 text-stone-400 group-hover:text-stone-700 transition" />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Children */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold uppercase tracking-wider text-stone-500">
                    Дети ({detailedChildren.length})
                  </span>
                  <button
                    type="button"
                    onClick={() => onAddRelative(person.id, 'child')}
                    className="text-[11px] font-medium text-amber-800 hover:text-amber-900 flex items-center gap-1 hover:underline"
                  >
                    <Plus className="w-3 h-3" />
                    Добавить ребёнка
                  </button>
                </div>

                {detailedChildren.length === 0 ? (
                  <div className="p-3 bg-white rounded-xl border border-dashed border-stone-200 text-center">
                    <p className="text-xs text-stone-400 italic">Дети не указаны</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {detailedChildren.map(({ person: c, isAdoptive, rel }) => (
                      <div
                        key={c.id}
                        onClick={() => onSelectPerson(c.id)}
                        className="group flex items-center justify-between p-3 rounded-xl bg-white border border-stone-200 hover:border-amber-400 cursor-pointer transition shadow-2xs"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-9 h-9 rounded-lg bg-stone-200 overflow-hidden flex items-center justify-center text-xs font-bold font-serif text-stone-700 shrink-0">
                            {c.avatarUrl ? <img src={c.avatarUrl} alt="" className="w-full h-full object-cover object-center" style={getPortraitFaceStyle(c.avatarFaceBox)} /> : c.firstName[0]}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <p className="text-xs font-bold text-stone-900 truncate">{formatFullName(c)}</p>
                              {isAdoptive ? (
                                <span className="bg-violet-100 text-violet-800 border border-violet-200 text-[10px] font-semibold px-1.5 py-0.2 rounded">
                                  Усыновление / Приёмный
                                </span>
                              ) : (
                                <span className="bg-stone-100 text-stone-600 text-[10px] font-medium px-1.5 py-0.2 rounded">
                                  Кровный
                                </span>
                              )}
                            </div>
                            <p className="text-[11px] text-stone-500 mt-0.5">
                              {isAdoptive
                                ? (c.gender === 'female' ? 'Приёмная дочь' : 'Приёмный сын')
                                : (c.gender === 'female' ? 'Дочь' : 'Сын')
                              }
                              {c.birthDate ? ` · род. ${c.birthDate.slice(0, 4)} г.` : ''}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-1 shrink-0 ml-2">
                          {onDeleteRelationship && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setConfirmDeleteRel({
                                  targetId: c.id,
                                  targetName: formatFullName(c),
                                  type: isAdoptive ? 'adoptive-parent' : 'parent',
                                  roleDescription: isAdoptive 
                                    ? (c.gender === 'female' ? 'приёмная дочь' : 'приёмный сын')
                                    : (c.gender === 'female' ? 'дочь' : 'сын'),
                                  relationshipId: rel.id
                                });
                              }}
                              className="p-1.5 rounded-lg text-stone-400 hover:text-red-600 hover:bg-red-50 transition"
                              title="Удалить связь с ребёнком"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                          <ChevronRight className="w-4 h-4 text-stone-400 group-hover:text-stone-700 transition" />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Siblings */}
              {detailedSiblings.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold uppercase tracking-wider text-stone-500">
                      Братья и сёстры ({detailedSiblings.length})
                    </span>
                    <button
                      type="button"
                      onClick={() => onAddRelative(person.id, 'sibling')}
                      className="text-[11px] font-medium text-amber-800 hover:text-amber-900 flex items-center gap-1 hover:underline"
                    >
                      <Plus className="w-3 h-3" />
                      Добавить
                    </button>
                  </div>
                  <div className="space-y-2">
                    {detailedSiblings.map(({ person: s, rel, isDirectLink }) => (
                      <div
                        key={s.id}
                        onClick={() => onSelectPerson(s.id)}
                        className="group flex items-center justify-between p-3 rounded-xl bg-white border border-stone-200 hover:border-amber-400 cursor-pointer transition shadow-2xs"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-9 h-9 rounded-lg bg-stone-200 overflow-hidden flex items-center justify-center text-xs font-bold font-serif text-stone-700 shrink-0">
                            {s.avatarUrl ? <img src={s.avatarUrl} alt="" className="w-full h-full object-cover object-center" style={getPortraitFaceStyle(s.avatarFaceBox)} /> : s.firstName[0]}
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs font-bold text-stone-900 truncate">{formatFullName(s)}</p>
                            <p className="text-[11px] text-stone-500 mt-0.5">
                              {s.gender === 'female' ? 'Сестра' : 'Брат'}
                              {s.birthDate ? ` · род. ${s.birthDate.slice(0, 4)} г.` : ''}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-1 shrink-0 ml-2">
                          {onDeleteRelationship && rel && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setConfirmDeleteRel({
                                  targetId: s.id,
                                  targetName: formatFullName(s),
                                  type: 'sibling',
                                  roleDescription: s.gender === 'female' ? 'сестра' : 'брат',
                                  relationshipId: rel.id
                                });
                              }}
                              className="p-1.5 rounded-lg text-stone-400 hover:text-red-600 hover:bg-red-50 transition"
                              title="Удалить прямую связь"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                          <ChevronRight className="w-4 h-4 text-stone-400 group-hover:text-stone-700 transition" />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Other Relations (Godparents, Custom, etc.) */}
              {otherRelations.length > 0 && (
                <div>
                  <span className="text-xs font-semibold uppercase tracking-wider text-stone-500 block mb-2">
                    Другие связи ({otherRelations.length})
                  </span>
                  <div className="space-y-2">
                    {otherRelations.map(({ person: o, rel, roleLabel }) => (
                      <div
                        key={o.id}
                        onClick={() => onSelectPerson(o.id)}
                        className="group flex items-center justify-between p-3 rounded-xl bg-white border border-stone-200 hover:border-amber-400 cursor-pointer transition shadow-2xs"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-9 h-9 rounded-lg bg-stone-200 overflow-hidden flex items-center justify-center text-xs font-bold font-serif text-stone-700 shrink-0">
                            {o.avatarUrl ? <img src={o.avatarUrl} alt="" className="w-full h-full object-cover object-center" style={getPortraitFaceStyle(o.avatarFaceBox)} /> : o.firstName[0]}
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs font-bold text-stone-900 truncate">{formatFullName(o)}</p>
                            <p className="text-[11px] text-amber-900 font-medium mt-0.5">
                              {roleLabel}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-1 shrink-0 ml-2">
                          {onDeleteRelationship && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setConfirmDeleteRel({
                                  targetId: o.id,
                                  targetName: formatFullName(o),
                                  type: rel.type,
                                  roleDescription: roleLabel,
                                  relationshipId: rel.id
                                });
                              }}
                              className="p-1.5 rounded-lg text-stone-400 hover:text-red-600 hover:bg-red-50 transition"
                              title="Удалить эту связь"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                          <ChevronRight className="w-4 h-4 text-stone-400 group-hover:text-stone-700 transition" />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Lightbox Modal for Media Viewing */}
      {lightboxMedia && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4 animate-in fade-in"
          onClick={() => setLightboxMedia(null)}
        >
          <div 
            className="max-w-4xl max-h-[90vh] bg-stone-950 rounded-2xl overflow-hidden border border-stone-800 flex flex-col text-white"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-3 border-b border-stone-800">
              <h3 className="text-sm font-semibold truncate pr-4">{lightboxMedia.name}</h3>
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
                  allPersons={allPersons}
                  targetPersonId={person.id}
                  onSetAvatar={handleSetAvatar}
                  onSelectPerson={(pId) => {
                    setLightboxMedia(null);
                    onSelectPerson(pId);
                  }}
                  onUpdateFaces={(updatedFaces) => {
                    const nextMedia = { ...lightboxMedia, faces: updatedFaces };
                    setLightboxMedia(nextMedia);

                    if (onUpdateAllPersons) {
                      const updatedPersons = allPersons.map((p) => {
                        let mediaList = p.mediaFiles ? [...p.mediaFiles] : [];
                        const isCurrent = p.id === person.id;
                        const hasMedia = mediaList.some((m) => m.id === lightboxMedia.id);
                        if (isCurrent && !hasMedia) {
                          mediaList.push(nextMedia);
                          return { ...p, mediaFiles: mediaList };
                        }
                        if (hasMedia) {
                          const updatedMediaList = mediaList.map((m) =>
                            m.id === lightboxMedia.id ? nextMedia : m
                          );
                          return { ...p, mediaFiles: updatedMediaList };
                        }
                        return p;
                      });
                      onUpdateAllPersons(updatedPersons);
                    } else if (onUpdatePerson) {
                      const updatedMedia = person.mediaFiles ? person.mediaFiles.map((m) => {
                        if (m.id === lightboxMedia.id) {
                          return nextMedia;
                        }
                        return m;
                      }) : [nextMedia];
                      onUpdatePerson({ ...person, mediaFiles: updatedMedia });
                    }
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
    </>
  );
};
