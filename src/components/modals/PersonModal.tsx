import React, { useState, useEffect } from 'react';
import { 
  Person, 
  RelationshipRecord, 
  SignificantDate, 
  MediaItem, 
  Gender, 
  RelationshipType,
  RelativeRole,
  PendingRelationship
} from '../../types/genealogy';
import { 
  formatFullName, 
  RELATIONSHIP_PRESETS, 
  getParents, 
  getChildren, 
  getSpouses, 
  getSiblings, 
  getDetailedParents,
  getDetailedChildren,
  getDetailedSiblings,
  getOtherRelationships,
  formatDisplayDate,
  isFormerMarriage
} from '../../utils/kinship';
import { 
  X, 
  User, 
  Calendar, 
  FileText, 
  Image as ImageIcon, 
  Users, 
  Plus, 
  Trash2, 
  Upload, 
  Heart, 
  Check, 
  MapPin, 
  Award, 
  Sparkles,
  ExternalLink,
  Film,
  FileCheck,
  Scan,
  UserCheck,
  FolderPlus,
  Unlink
} from 'lucide-react';
import { PhotoFaceViewer } from '../media/PhotoFaceViewer';
import { extractBestFaceAvatar } from '../../services/faceRecognition';
import { AttachMediaModal } from './AttachMediaModal';

export const RELATIONSHIP_ROLE_PRESETS: { role: RelativeRole; label: string; badgeLabel: string }[] = [
  { role: 'parent', label: 'Родитель для... (отец / мать)', badgeLabel: 'Родитель для' },
  { role: 'child', label: 'Ребёнок для... (сын / дочь)', badgeLabel: 'Ребёнок для' },
  { role: 'marriage', label: 'Брак для...', badgeLabel: 'Брак для' },
  { role: 'sibling', label: 'Брат / Сестра для...', badgeLabel: 'Брат / Сестра для' },
  { role: 'adoptive-parent', label: 'Приёмный родитель для...', badgeLabel: 'Приёмный родитель для' },
  { role: 'adoptive-child', label: 'Приёмный ребёнок для...', badgeLabel: 'Приёмный ребёнок для' },
  { role: 'godparent', label: 'Крёстный(ая) для...', badgeLabel: 'Крёстный(ая) для' },
  { role: 'godchild', label: 'Крестник / Крестница для...', badgeLabel: 'Крестник(ца) для' },
  { role: 'custom', label: 'Другая степень родства...', badgeLabel: 'Связь с' },
];

interface PersonModalProps {
  person: Person | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (person: Person, newRelationships?: PendingRelationship[]) => void;
  onDelete?: (personId: string) => void;
  allPersons: Person[];
  relationships: RelationshipRecord[];
  onOpenPerson?: (personId: string) => void;
  defaultRelationshipTargetId?: string;
  defaultRelationshipRole?: RelativeRole;
  mediaArchive?: MediaItem[];
  onNavigateToArchive?: () => void;
  onDeleteRelationship?: (person1Id: string, person2Id: string, type?: RelationshipType, relationshipId?: string) => void;
}

type TabType = 'general' | 'dates' | 'bio' | 'media' | 'relations';

export const PersonModal: React.FC<PersonModalProps> = ({
  person,
  isOpen,
  onClose,
  onSave,
  onDelete,
  allPersons,
  relationships,
  mediaArchive = [],
  onNavigateToArchive,
  onOpenPerson,
  defaultRelationshipTargetId,
  defaultRelationshipRole,
  onDeleteRelationship
}) => {
  const isEditing = !!person;

  // Active tab
  const [activeTab, setActiveTab] = useState<TabType>('general');
  const [isAttachModalOpen, setIsAttachModalOpen] = useState(false);
  const [confirmDeleteRel, setConfirmDeleteRel] = useState<{
    targetId: string;
    targetName: string;
    type: RelationshipType;
    roleDescription: string;
    relationshipId?: string;
  } | null>(null);

  // Link spouse option when adding child
  const [linkSpouseMode, setLinkSpouseMode] = useState<'none' | 'adoptive' | 'biological'>('none');

  // Form states
  const [firstName, setFirstName] = useState(person?.firstName || '');
  const [lastName, setLastName] = useState(person?.lastName || '');
  const [patronymic, setPatronymic] = useState(person?.patronymic || '');
  const [maidenName, setMaidenName] = useState(person?.maidenName || '');
  const [gender, setGender] = useState<Gender>(person?.gender || 'male');
  const [birthDate, setBirthDate] = useState(person?.birthDate ? formatDisplayDate(person.birthDate) : '');
  const [birthPlace, setBirthPlace] = useState(person?.birthPlace || '');
  const [isDeceased, setIsDeceased] = useState(person?.isDeceased ?? false);
  const [deathDate, setDeathDate] = useState(person?.deathDate ? formatDisplayDate(person.deathDate) : '');
  const [deathPlace, setDeathPlace] = useState(person?.deathPlace || '');
  const [occupation, setOccupation] = useState(person?.occupation || '');
  const [socialStatus, setSocialStatus] = useState(person?.socialStatus || '');
  const [bio, setBio] = useState(person?.bio || '');
  const [tagsInput, setTagsInput] = useState(person?.tags?.join(', ') || '');
  const [avatarUrl, setAvatarUrl] = useState(person?.avatarUrl || '');

  // Significant dates
  const [significantDates, setSignificantDates] = useState<SignificantDate[]>(
    person?.significantDates ? person.significantDates.map(sd => ({ ...sd, date: formatDisplayDate(sd.date) })) : []
  );

  // Media files
  const [mediaFiles, setMediaFiles] = useState<MediaItem[]>(
    person?.mediaFiles || []
  );

  // New relationship states for this person (if creating or adding)
  const [pendingRelations, setPendingRelations] = useState<PendingRelationship[]>(() => {
    if (!person && defaultRelationshipTargetId && defaultRelationshipRole) {
      return [{ targetId: defaultRelationshipTargetId, role: defaultRelationshipRole }];
    }
    return [];
  });

  useEffect(() => {
    if (isOpen) {
      if (!person && defaultRelationshipTargetId && defaultRelationshipRole) {
        setPendingRelations([{ targetId: defaultRelationshipTargetId, role: defaultRelationshipRole }]);
        setSelectedRelativeId(defaultRelationshipTargetId);
        setSelectedRelRole(defaultRelationshipRole);
      } else if (!person) {
        setPendingRelations([]);
        setSelectedRelativeId('');
        setSelectedRelRole('parent');
      }
    }
  }, [isOpen, person, defaultRelationshipTargetId, defaultRelationshipRole]);

  const [selectedRelativeId, setSelectedRelativeId] = useState(defaultRelationshipTargetId || '');
  const [selectedRelRole, setSelectedRelRole] = useState<RelativeRole>(defaultRelationshipRole || 'parent');
  const [customRelLabel, setCustomRelLabel] = useState('');
  const [relationshipStartDate, setRelationshipStartDate] = useState('');
  const [relationshipStartDateUnknown, setRelationshipStartDateUnknown] = useState(false);
  const [relationshipEndDate, setRelationshipEndDate] = useState('');
  const [relationshipEndDateUnknown, setRelationshipEndDateUnknown] = useState(false);
  const [relationshipDateError, setRelationshipDateError] = useState('');
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const [inspectingFaceMedia, setInspectingFaceMedia] = useState<MediaItem | null>(null);
  const [isProcessingAvatar, setIsProcessingAvatar] = useState(false);

  // Set photo as avatar, automatically cropping to the person's face
  const handleSetPhotoAsAvatar = async (mediaItem: MediaItem) => {
    setIsProcessingAvatar(true);
    try {
      const cropped = await extractBestFaceAvatar(mediaItem.dataUrl, person?.id, mediaItem.faces);
      setAvatarUrl(cropped);
    } catch (err) {
      setAvatarUrl(mediaItem.dataUrl);
    } finally {
      setIsProcessingAvatar(false);
    }
  };

  // Media upload handler
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    Array.from(files).forEach((file) => {
      const reader = new FileReader();
      reader.onload = (event) => {
        const dataUrl = event.target?.result as string;
        let type: MediaItem['type'] = 'document';
        if (file.type.startsWith('image/')) type = 'photo';
        else if (file.type.startsWith('video/')) type = 'video';
        else if (file.type.startsWith('audio/')) type = 'audio';

        const newMedia: MediaItem = {
          id: 'media-' + Date.now() + '-' + Math.random().toString(36).substr(2, 5),
          name: file.name,
          type,
          dataUrl,
          size: file.size,
          mimeType: file.type,
          date: new Date().toISOString().slice(0, 10),
          isPrimaryAvatar: mediaFiles.length === 0 && type === 'photo' && !avatarUrl,
          originPersonId: person?.id,
          faces: []
        };

        setMediaFiles((prev) => [...prev, newMedia]);

        // If no avatar set and this is a photo, crop face for avatar
        if (!avatarUrl && type === 'photo') {
          extractBestFaceAvatar(dataUrl, person?.id, [])
            .then((cropped) => setAvatarUrl(cropped))
            .catch(() => setAvatarUrl(dataUrl));
        }
      };
      reader.readAsDataURL(file);
    });
  };

  // Add significant date
  const handleAddDate = () => {
    const newDate: SignificantDate = {
      id: 'sd-' + Date.now(),
      title: 'Новое событие',
      date: new Date().getFullYear().toString(),
      description: '',
      location: ''
    };
    setSignificantDates((prev) => [...prev, newDate]);
  };

  const handleUpdateDate = (id: string, updates: Partial<SignificantDate>) => {
    setSignificantDates((prev) =>
      prev.map((d) => (d.id === id ? { ...d, ...updates } : d))
    );
  };

  const handleDeleteDate = (id: string) => {
    setSignificantDates((prev) => prev.filter((d) => d.id !== id));
  };

  // Add pending relationship
  const handleAddPendingRelation = () => {
    if (!selectedRelativeId) return;
    if (selectedRelativeId === person?.id) return;
    if (selectedRelRole === 'marriage' && !relationshipStartDate.trim() && !relationshipStartDateUnknown) {
      setRelationshipDateError('Укажите дату начала брака или отметьте, что она неизвестна.');
      return;
    }
    const existingPending = pendingRelations.find((r) => r.targetId === selectedRelativeId && r.role === selectedRelRole);
    if (existingPending) {
      if (selectedRelRole === 'marriage') {
        setPendingRelations((prev) => prev.map((r) => r === existingPending ? {
          ...r,
          startDate: relationshipStartDate.trim() ? formatDisplayDate(relationshipStartDate.trim()) : undefined,
          startDateUnknown: relationshipStartDateUnknown,
          endDate: relationshipEndDate.trim() ? formatDisplayDate(relationshipEndDate.trim()) : undefined,
          endDateUnknown: relationshipEndDateUnknown
        } : r));
      }
      setRelationshipDateError('');
      return;
    }

    const newItems: PendingRelationship[] = [
      {
        targetId: selectedRelativeId,
        role: selectedRelRole,
        customLabel: selectedRelRole === 'custom' ? customRelLabel : undefined,
        startDate: selectedRelRole === 'marriage' && relationshipStartDate.trim()
          ? formatDisplayDate(relationshipStartDate.trim()) : undefined,
        startDateUnknown: selectedRelRole === 'marriage' ? relationshipStartDateUnknown : undefined,
        endDate: selectedRelRole === 'marriage' && relationshipEndDate.trim()
          ? formatDisplayDate(relationshipEndDate.trim()) : undefined,
        endDateUnknown: selectedRelRole === 'marriage' ? relationshipEndDateUnknown : undefined
      }
    ];

    // If target has a spouse and role is child or adoptive-child, handle spouse option
    if ((selectedRelRole === 'child' || selectedRelRole === 'adoptive-child') && linkSpouseMode !== 'none') {
      const targetSpouses = getSpouses(selectedRelativeId, allPersons, relationships);
      if (targetSpouses.length > 0) {
        const spouseId = targetSpouses[0].person.id;
        const spouseRole: RelativeRole = linkSpouseMode === 'adoptive' ? 'adoptive-child' : 'child';
        if (!pendingRelations.some(r => r.targetId === spouseId)) {
          newItems.push({
            targetId: spouseId,
            role: spouseRole
          });
        }
      }
    }

    setPendingRelations((prev) => [...prev, ...newItems]);
    setSelectedRelativeId('');
    setCustomRelLabel('');
    setRelationshipStartDate('');
    setRelationshipStartDateUnknown(false);
    setRelationshipEndDate('');
    setRelationshipEndDateUnknown(false);
    setRelationshipDateError('');
    setLinkSpouseMode('none');
  };

  const handleRemovePendingRelation = (index: number) => {
    setPendingRelations((prev) => prev.filter((_, i) => i !== index));
  };

  // Submit save
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!firstName.trim() && !lastName.trim()) return;
    const relationsToSave = pendingRelations.map((rel) => {
      if (rel.role !== 'marriage' || rel.targetId !== selectedRelativeId || selectedRelRole !== 'marriage') return rel;
      return {
        ...rel,
        startDate: relationshipStartDate.trim() ? formatDisplayDate(relationshipStartDate.trim()) : undefined,
        startDateUnknown: relationshipStartDateUnknown,
        endDate: relationshipEndDate.trim() ? formatDisplayDate(relationshipEndDate.trim()) : undefined,
        endDateUnknown: relationshipEndDateUnknown
      };
    });
    if (relationsToSave.some((rel) => rel.role === 'marriage' && !rel.startDate && !rel.startDateUnknown)) {
      setSelectedRelRole('marriage');
      setRelationshipDateError('Укажите дату начала брака или отметьте, что она неизвестна.');
      setActiveTab('relations');
      return;
    }

    const tags = tagsInput
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);

    const savedPerson: Person = {
      id: person?.id || 'p-' + Date.now(),
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      patronymic: patronymic.trim() || undefined,
      maidenName: maidenName.trim() || undefined,
      gender,
      birthDate: birthDate.trim() ? formatDisplayDate(birthDate.trim()) : undefined,
      birthPlace: birthPlace.trim() || undefined,
      isDeceased,
      deathDate: isDeceased && deathDate.trim() ? formatDisplayDate(deathDate.trim()) : undefined,
      deathPlace: isDeceased ? (deathPlace.trim() || undefined) : undefined,
      occupation: occupation.trim() || undefined,
      socialStatus: socialStatus.trim() || undefined,
      avatarUrl: avatarUrl.trim() || undefined,
      bio,
      tags,
      significantDates: significantDates.map(sd => ({ ...sd, date: formatDisplayDate(sd.date) })),
      mediaFiles,
      createdAt: person?.createdAt || Date.now(),
      updatedAt: Date.now()
    };

    onSave(savedPerson, relationsToSave);
    onClose();
  };

  // Find existing relations if person exists
  const detailedParents = person ? getDetailedParents(person.id, allPersons, relationships) : [];
  const detailedChildren = person ? getDetailedChildren(person.id, allPersons, relationships) : [];
  const existingSpouses = person ? getSpouses(person.id, allPersons, relationships) : [];
  const detailedSiblings = person ? getDetailedSiblings(person.id, allPersons, relationships) : [];
  const otherRelations = person ? getOtherRelationships(person.id, allPersons, relationships) : [];

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-stone-950/70 backdrop-blur-xs overflow-y-auto animate-in fade-in">
      <div 
        className="w-full max-w-3xl bg-stone-50 rounded-2xl shadow-2xl border border-stone-200 overflow-hidden flex flex-col max-h-[92vh] my-auto"
        role="dialog"
        aria-modal="true"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 bg-stone-900 text-stone-100 border-b border-stone-800">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-amber-500/20 text-amber-400 flex items-center justify-center font-serif text-sm font-bold border border-amber-500/30">
              {firstName ? firstName[0] : 'П'}
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-serif font-bold text-stone-100">
                {isEditing ? formatFullName(person, { format: 'natural' }) : 'Добавление персоналии'}
              </h2>
              <p className="text-xs text-stone-400">
                {isEditing ? 'Редактирование биографии и архива' : 'Ввод данных нового члена семьи'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-stone-400 hover:text-stone-100 hover:bg-stone-800 rounded-lg transition"
            aria-label="Закрыть"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation (Segmented Controls) */}
        <div className="flex items-center gap-1 px-4 py-2 bg-stone-200/70 border-b border-stone-200 overflow-x-auto no-scrollbar">
          <button
            type="button"
            onClick={() => setActiveTab('general')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg whitespace-nowrap transition ${
              activeTab === 'general'
                ? 'bg-white text-stone-900 shadow-xs'
                : 'text-stone-600 hover:text-stone-900 hover:bg-stone-200'
            }`}
          >
            <User className="w-3.5 h-3.5" />
            <span>Основное</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('relations')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg whitespace-nowrap transition ${
              activeTab === 'relations'
                ? 'bg-white text-stone-900 shadow-xs'
                : 'text-stone-600 hover:text-stone-900 hover:bg-stone-200'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>Родственные связи</span>
            {(detailedParents.length + detailedChildren.length + existingSpouses.length + detailedSiblings.length + otherRelations.length + pendingRelations.length) > 0 && (
              <span className="text-[10px] bg-stone-100 text-stone-700 px-1.5 py-0.2 rounded-full font-mono">
                {detailedParents.length + detailedChildren.length + existingSpouses.length + detailedSiblings.length + otherRelations.length + pendingRelations.length}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('dates')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg whitespace-nowrap transition ${
              activeTab === 'dates'
                ? 'bg-white text-stone-900 shadow-xs'
                : 'text-stone-600 hover:text-stone-900 hover:bg-stone-200'
            }`}
          >
            <Calendar className="w-3.5 h-3.5" />
            <span>Значимые даты</span>
            {significantDates.length > 0 && (
              <span className="text-[10px] bg-stone-100 text-stone-700 px-1.5 py-0.2 rounded-full font-mono">
                {significantDates.length}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('bio')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg whitespace-nowrap transition ${
              activeTab === 'bio'
                ? 'bg-white text-stone-900 shadow-xs'
                : 'text-stone-600 hover:text-stone-900 hover:bg-stone-200'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Биография</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('media')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg whitespace-nowrap transition ${
              activeTab === 'media'
                ? 'bg-white text-stone-900 shadow-xs'
                : 'text-stone-600 hover:text-stone-900 hover:bg-stone-200'
            }`}
          >
            <ImageIcon className="w-3.5 h-3.5" />
            <span>Медиафайлы & Документы</span>
            {mediaFiles.length > 0 && (
              <span className="text-[10px] bg-stone-100 text-stone-700 px-1.5 py-0.2 rounded-full font-mono">
                {mediaFiles.length}
              </span>
            )}
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
          {/* TAB 1: GENERAL INFO */}
          {activeTab === 'general' && (
            <div className="space-y-5 animate-in fade-in duration-150">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-medium text-stone-700 mb-1">
                    Фамилия <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    placeholder="Морозов"
                    className="w-full px-3 py-2 text-sm rounded-lg border border-stone-300 bg-white text-stone-900 focus:outline-none focus:ring-2 focus:ring-amber-500/40 focus:border-amber-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-stone-700 mb-1">
                    Имя <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    placeholder="Алексей"
                    className="w-full px-3 py-2 text-sm rounded-lg border border-stone-300 bg-white text-stone-900 focus:outline-none focus:ring-2 focus:ring-amber-500/40 focus:border-amber-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-stone-700 mb-1">
                    Отчество
                  </label>
                  <input
                    type="text"
                    value={patronymic}
                    onChange={(e) => setPatronymic(e.target.value)}
                    placeholder="Николаевич"
                    className="w-full px-3 py-2 text-sm rounded-lg border border-stone-300 bg-white text-stone-900 focus:outline-none focus:ring-2 focus:ring-amber-500/40 focus:border-amber-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-stone-700 mb-1">
                    Девичья фамилия (если менялась)
                  </label>
                  <input
                    type="text"
                    value={maidenName}
                    onChange={(e) => setMaidenName(e.target.value)}
                    placeholder="Воронцова"
                    className="w-full px-3 py-2 text-sm rounded-lg border border-stone-300 bg-white text-stone-900 focus:outline-none focus:ring-2 focus:ring-amber-500/40 focus:border-amber-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-stone-700 mb-1">
                    Пол
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={() => setGender('male')}
                      className={`py-2 text-xs font-medium rounded-lg border transition ${
                        gender === 'male'
                          ? 'bg-sky-50 border-sky-500 text-sky-900 font-semibold'
                          : 'bg-white border-stone-300 text-stone-700 hover:bg-stone-50'
                      }`}
                    >
                      Мужской
                    </button>
                    <button
                      type="button"
                      onClick={() => setGender('female')}
                      className={`py-2 text-xs font-medium rounded-lg border transition ${
                        gender === 'female'
                          ? 'bg-rose-50 border-rose-500 text-rose-900 font-semibold'
                          : 'bg-white border-stone-300 text-stone-700 hover:bg-stone-50'
                      }`}
                    >
                      Женский
                    </button>
                    <button
                      type="button"
                      onClick={() => setGender('other')}
                      className={`py-2 text-xs font-medium rounded-lg border transition ${
                        gender === 'other'
                          ? 'bg-amber-50 border-amber-500 text-amber-900 font-semibold'
                          : 'bg-white border-stone-300 text-stone-700 hover:bg-stone-50'
                      }`}
                    >
                      Не указан
                    </button>
                  </div>
                </div>
              </div>

              {/* Birth information */}
              <div className="p-3.5 rounded-xl bg-stone-100/80 border border-stone-200 space-y-3">
                <span className="text-xs font-semibold text-stone-700 uppercase tracking-wider block">
                  Рождение
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-stone-600 mb-1">Дата рождения (ДД.ММ.ГГГГ или год)</label>
                    <input
                      type="text"
                      value={birthDate}
                      onChange={(e) => setBirthDate(e.target.value)}
                      onBlur={() => birthDate && setBirthDate(formatDisplayDate(birthDate))}
                      placeholder="15.03.1922 или 1922"
                      className="w-full px-3 py-2 text-sm rounded-lg border border-stone-300 bg-white text-stone-900 focus:outline-none focus:ring-2 focus:ring-amber-500/40"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-stone-600 mb-1">Место рождения</label>
                    <input
                      type="text"
                      value={birthPlace}
                      onChange={(e) => setBirthPlace(e.target.value)}
                      placeholder="г. Нижний Новгород"
                      className="w-full px-3 py-2 text-sm rounded-lg border border-stone-300 bg-white text-stone-900 focus:outline-none focus:ring-2 focus:ring-amber-500/40"
                    />
                  </div>
                </div>
              </div>

              {/* Status Alive / Deceased */}
              <div className="p-3.5 rounded-xl bg-stone-100/80 border border-stone-200 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-stone-700 uppercase tracking-wider">
                    Статус персоналии
                  </span>
                  <label className="inline-flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={isDeceased}
                      onChange={(e) => setIsDeceased(e.target.checked)}
                      className="w-4 h-4 rounded text-amber-600 border-stone-300 focus:ring-amber-500"
                    />
                    <span className="text-xs font-medium text-stone-800">
                      Умер(ла)
                    </span>
                  </label>
                </div>

                {isDeceased && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1 border-t border-stone-200">
                    <div>
                      <label className="block text-xs text-stone-600 mb-1">Дата смерти (ДД.ММ.ГГГГ или год)</label>
                      <input
                        type="text"
                        value={deathDate}
                        onChange={(e) => setDeathDate(e.target.value)}
                        onBlur={() => deathDate && setDeathDate(formatDisplayDate(deathDate))}
                        placeholder="11.10.1998 или 1998"
                        className="w-full px-3 py-2 text-sm rounded-lg border border-stone-300 bg-white text-stone-900 focus:outline-none focus:ring-2 focus:ring-amber-500/40"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-stone-600 mb-1">Место смерти / захоронения</label>
                      <input
                        type="text"
                        value={deathPlace}
                        onChange={(e) => setDeathPlace(e.target.value)}
                        placeholder="г. Санкт-Петербург"
                        className="w-full px-3 py-2 text-sm rounded-lg border border-stone-300 bg-white text-stone-900 focus:outline-none focus:ring-2 focus:ring-amber-500/40"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Social and Professional attributes */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-stone-700 mb-1">
                    Профессия / Род занятий
                  </label>
                  <input
                    type="text"
                    value={occupation}
                    onChange={(e) => setOccupation(e.target.value)}
                    placeholder="Архитектор, главный инженер"
                    className="w-full px-3 py-2 text-sm rounded-lg border border-stone-300 bg-white text-stone-900 focus:outline-none focus:ring-2 focus:ring-amber-500/40"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-stone-700 mb-1">
                    Сословие / Статус / Звание
                  </label>
                  <input
                    type="text"
                    value={socialStatus}
                    onChange={(e) => setSocialStatus(e.target.value)}
                    placeholder="Дворянин, Ветеран труда"
                    className="w-full px-3 py-2 text-sm rounded-lg border border-stone-300 bg-white text-stone-900 focus:outline-none focus:ring-2 focus:ring-amber-500/40"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-stone-700 mb-1">
                  Теги и метки ветви (через запятую)
                </label>
                <input
                  type="text"
                  value={tagsInput}
                  onChange={(e) => setTagsInput(e.target.value)}
                  placeholder="Ветеран ВОВ, Петербургская ветвь, Династия врачей"
                  className="w-full px-3 py-2 text-sm rounded-lg border border-stone-300 bg-white text-stone-900 focus:outline-none focus:ring-2 focus:ring-amber-500/40"
                />
              </div>
            </div>
          )}

          {/* TAB 2: RELATIONSHIPS */}
          {activeTab === 'relations' && (
            <div className="space-y-6 animate-in fade-in duration-150">
              {/* Existing computed links if person exists */}
              {isEditing && (
                <div className="space-y-4">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-stone-500">
                    Текущие зафиксированные родственные связи
                  </h3>

                  {/* Inline delete confirmation alert */}
                  {confirmDeleteRel && (
                    <div className="p-3.5 bg-red-50 border border-red-200 rounded-xl space-y-2 animate-in fade-in shadow-2xs">
                      <div className="flex items-start gap-2 text-red-900">
                        <Trash2 className="w-4 h-4 text-red-600 mt-0.5 shrink-0" />
                        <div>
                          <p className="text-xs font-semibold">
                            Удалить связь: {confirmDeleteRel.roleDescription} «{confirmDeleteRel.targetName}»?
                          </p>
                          <p className="text-[11px] text-red-700/90 mt-0.5 leading-relaxed">
                            Сама персона останется в древе, будет удалена только связь между ними.
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center justify-end gap-2 pt-1 border-t border-red-200/60">
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteRel(null)}
                          className="px-3 py-1 text-xs rounded-lg border border-stone-300 bg-white text-stone-700 hover:bg-stone-50 font-medium"
                        >
                          Отмена
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            if (onDeleteRelationship && person) {
                              onDeleteRelationship(
                                person.id,
                                confirmDeleteRel.targetId,
                                confirmDeleteRel.type,
                                confirmDeleteRel.relationshipId,
                              );
                            }
                            setConfirmDeleteRel(null);
                          }}
                          className="px-3 py-1 text-xs rounded-lg bg-red-600 text-white font-medium hover:bg-red-700 shadow-2xs"
                        >
                          Удалить связь
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Parents */}
                  <div className="p-3.5 bg-white rounded-xl border border-stone-200">
                    <span className="text-xs font-medium text-stone-500 block mb-2">
                      Родители ({detailedParents.length})
                    </span>
                    {detailedParents.length === 0 ? (
                      <p className="text-xs text-stone-400 italic">Родители пока не указаны в древе</p>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {detailedParents.map(({ person: p, isAdoptive, rel }) => (
                          <div
                            key={p.id}
                            className="inline-flex items-center rounded-lg bg-stone-100 border border-stone-200 text-xs font-medium text-stone-800 shadow-2xs overflow-hidden"
                          >
                            <button
                              type="button"
                              onClick={() => onOpenPerson && onOpenPerson(p.id)}
                              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 hover:bg-stone-200 transition"
                            >
                              <span>
                                {isAdoptive 
                                  ? (p.gender === 'female' ? 'Приёмная мать:' : 'Приёмный отец:')
                                  : (p.gender === 'female' ? 'Мать:' : 'Отец:')
                                }
                              </span>
                              <strong>{formatFullName(p, { format: 'short' })}</strong>
                              {isAdoptive && (
                                <span className="bg-violet-100 text-violet-800 text-[10px] font-semibold px-1 py-0.2 rounded">
                                  Приёмный
                                </span>
                              )}
                              <ExternalLink className="w-3 h-3 text-stone-400" />
                            </button>
                            {onDeleteRelationship && (
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteRel({
                                  targetId: p.id,
                                  targetName: formatFullName(p),
                                  type: isAdoptive ? 'adoptive-parent' : 'parent',
                                  roleDescription: isAdoptive 
                                    ? (p.gender === 'female' ? 'приёмная мать' : 'приёмный отец')
                                    : (p.gender === 'female' ? 'мать' : 'отец'),
                                  relationshipId: rel.id
                                })}
                                className="px-2 py-1.5 text-stone-400 hover:text-red-600 hover:bg-red-50 border-l border-stone-200 transition"
                                title="Удалить эту связь"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Spouses */}
                  <div className="p-3.5 bg-white rounded-xl border border-stone-200">
                    <span className="text-xs font-medium text-stone-500 block mb-2">
                      Супруг(а) ({existingSpouses.length})
                    </span>
                    {existingSpouses.length === 0 ? (
                      <p className="text-xs text-stone-400 italic">Супруги не указаны</p>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {existingSpouses.map(({ person: sp, rel }) => (
                          <div
                            key={sp.id}
                            className="inline-flex items-center rounded-lg bg-stone-100 border border-stone-200 text-xs font-medium text-stone-800 shadow-2xs overflow-hidden"
                          >
                            <button
                              type="button"
                              onClick={() => onOpenPerson && onOpenPerson(sp.id)}
                              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 hover:bg-stone-200 transition"
                            >
                              <Heart className="w-3 h-3 text-rose-500" />
                              <span>{isFormerMarriage(rel)
                                ? (sp.gender === 'female' ? 'Бывшая жена:' : 'Бывший муж:')
                                : (sp.gender === 'female' ? 'Жена:' : 'Муж:')}</span>
                              <strong>{formatFullName(sp, { format: 'short' })}</strong>
                              <span className="text-[10px] text-stone-500">
                                ({rel.startDate ? formatDisplayDate(rel.startDate) : 'начало неизвестно'}
                                {rel.endDate ? ` — ${formatDisplayDate(rel.endDate)}` : rel.endDateUnknown ? ' — окончание неизвестно' : ' — по настоящее время'})
                              </span>
                              <ExternalLink className="w-3 h-3 text-stone-400" />
                            </button>
                            {onDeleteRelationship && (
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteRel({
                                  targetId: sp.id,
                                  targetName: formatFullName(sp),
                                  type: rel.type,
                                  roleDescription: sp.gender === 'female' ? 'жена' : 'муж',
                                  relationshipId: rel.id
                                })}
                                className="px-2 py-1.5 text-stone-400 hover:text-red-600 hover:bg-red-50 border-l border-stone-200 transition"
                                title="Удалить супружескую связь"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Children */}
                  <div className="p-3.5 bg-white rounded-xl border border-stone-200">
                    <span className="text-xs font-medium text-stone-500 block mb-2">
                      Дети ({detailedChildren.length})
                    </span>
                    {detailedChildren.length === 0 ? (
                      <p className="text-xs text-stone-400 italic">Дети не указаны в древе</p>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {detailedChildren.map(({ person: c, isAdoptive, rel }) => (
                          <div
                            key={c.id}
                            className="inline-flex items-center rounded-lg bg-stone-100 border border-stone-200 text-xs font-medium text-stone-800 shadow-2xs overflow-hidden"
                          >
                            <button
                              type="button"
                              onClick={() => onOpenPerson && onOpenPerson(c.id)}
                              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 hover:bg-stone-200 transition"
                            >
                              <span>
                                {isAdoptive 
                                  ? (c.gender === 'female' ? 'Приёмная дочь:' : 'Приёмный сын:')
                                  : (c.gender === 'female' ? 'Дочь:' : 'Сын:')
                                }
                              </span>
                              <strong>{formatFullName(c, { format: 'short' })}</strong>
                              {isAdoptive && (
                                <span className="bg-violet-100 text-violet-800 text-[10px] font-semibold px-1 py-0.2 rounded">
                                  Приёмный
                                </span>
                              )}
                              <ExternalLink className="w-3 h-3 text-stone-400" />
                            </button>
                            {onDeleteRelationship && (
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteRel({
                                  targetId: c.id,
                                  targetName: formatFullName(c),
                                  type: isAdoptive ? 'adoptive-parent' : 'parent',
                                  roleDescription: isAdoptive 
                                    ? (c.gender === 'female' ? 'приёмная дочь' : 'приёмный сын')
                                    : (c.gender === 'female' ? 'дочь' : 'сын'),
                                  relationshipId: rel.id
                                })}
                                className="px-2 py-1.5 text-stone-400 hover:text-red-600 hover:bg-red-50 border-l border-stone-200 transition"
                                title="Удалить связь с ребёнком"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Siblings */}
                  {detailedSiblings.length > 0 && (
                    <div className="p-3.5 bg-white rounded-xl border border-stone-200">
                      <span className="text-xs font-medium text-stone-500 block mb-2">
                        Братья и сестры ({detailedSiblings.length})
                      </span>
                      <div className="flex flex-wrap gap-2">
                        {detailedSiblings.map(({ person: s, rel }) => (
                          <div
                            key={s.id}
                            className="inline-flex items-center rounded-lg bg-stone-100 border border-stone-200 text-xs font-medium text-stone-800 shadow-2xs overflow-hidden"
                          >
                            <button
                              type="button"
                              onClick={() => onOpenPerson && onOpenPerson(s.id)}
                              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 hover:bg-stone-200 transition"
                            >
                              <span>{s.gender === 'female' ? 'Сестра:' : 'Брат:'}</span>
                              <strong>{formatFullName(s, { format: 'short' })}</strong>
                              <ExternalLink className="w-3 h-3 text-stone-400" />
                            </button>
                            {onDeleteRelationship && rel && (
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteRel({
                                  targetId: s.id,
                                  targetName: formatFullName(s),
                                  type: 'sibling',
                                  roleDescription: s.gender === 'female' ? 'сестра' : 'брат',
                                  relationshipId: rel.id
                                })}
                                className="px-2 py-1.5 text-stone-400 hover:text-red-600 hover:bg-red-50 border-l border-stone-200 transition"
                                title="Удалить связь"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Other Relations */}
                  {otherRelations.length > 0 && (
                    <div className="p-3.5 bg-white rounded-xl border border-stone-200">
                      <span className="text-xs font-medium text-stone-500 block mb-2">
                        Другие связи ({otherRelations.length})
                      </span>
                      <div className="flex flex-wrap gap-2">
                        {otherRelations.map(({ person: o, rel, roleLabel }) => (
                          <div
                            key={o.id}
                            className="inline-flex items-center rounded-lg bg-stone-100 border border-stone-200 text-xs font-medium text-stone-800 shadow-2xs overflow-hidden"
                          >
                            <button
                              type="button"
                              onClick={() => onOpenPerson && onOpenPerson(o.id)}
                              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 hover:bg-stone-200 transition"
                            >
                              <span>{roleLabel}:</span>
                              <strong>{formatFullName(o, { format: 'short' })}</strong>
                              <ExternalLink className="w-3 h-3 text-stone-400" />
                            </button>
                            {onDeleteRelationship && (
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteRel({
                                  targetId: o.id,
                                  targetName: formatFullName(o),
                                  type: rel.type,
                                  roleDescription: roleLabel,
                                  relationshipId: rel.id
                                })}
                                className="px-2 py-1.5 text-stone-400 hover:text-red-600 hover:bg-red-50 border-l border-stone-200 transition"
                                title="Удалить эту связь"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Add / Link Relative */}
              <div className="p-4 bg-amber-500/5 rounded-xl border border-amber-500/20 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wider text-amber-900">
                    Указать связь с другой персоналией древа
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-stone-700 mb-1">
                      {person
                        ? `Кем ${person.firstName || 'эта персона'} приходится:`
                        : (firstName.trim() ? `Кем ${firstName.trim()} приходится:` : 'Роль этой персоны:')
                      }
                    </label>
                    {(() => {
                      const targetObj = allPersons.find((p) => p.id === selectedRelativeId);
                      const targetName = targetObj ? formatFullName(targetObj, { format: 'short' }) : null;
                      return (
                        <select
                          value={selectedRelRole}
                          onChange={(e) => setSelectedRelRole(e.target.value as RelativeRole)}
                          className="w-full px-3 py-2 text-xs rounded-lg border border-stone-300 bg-white text-stone-900 focus:outline-none focus:ring-2 focus:ring-amber-500 font-medium"
                        >
                          <option value="child">
                            {targetName ? `Ребёнок для ${targetName} (сын / дочь)` : 'Ребёнок для... (сын / дочь, указанный станет родителем)'}
                          </option>
                          <option value="parent">
                            {targetName ? `Родитель для ${targetName} (отец / мать)` : 'Родитель для... (отец / мать, указанный станет ребёнком)'}
                          </option>
                          <option value="marriage">
                            {targetName ? `Брак с ${targetName}` : 'Брак с...'}
                          </option>
                          <option value="sibling">
                            {targetName ? `Брат / Сестра для ${targetName}` : 'Брат / Сестра для... (родные)'}
                          </option>
                          <option value="adoptive-child">
                            {targetName ? `Приёмный ребёнок для ${targetName}` : 'Приёмный ребёнок для...'}
                          </option>
                          <option value="adoptive-parent">
                            {targetName ? `Приёмный родитель для ${targetName}` : 'Приёмный родитель для...'}
                          </option>
                          <option value="godparent">
                            {targetName ? `Крёстный(ая) для ${targetName}` : 'Крёстный(ая) для...'}
                          </option>
                          <option value="godchild">
                            {targetName ? `Крестник / Крестница для ${targetName}` : 'Крестник / Крестница для...'}
                          </option>
                          <option value="custom">
                            {targetName ? `Другая связь с ${targetName}...` : 'Другая степень родства...'}
                          </option>
                        </select>
                      );
                    })()}
                  </div>

                  {selectedRelRole === 'marriage' && (
                    <div className="sm:col-span-3 grid grid-cols-1 sm:grid-cols-2 gap-3 rounded-xl border border-rose-200 bg-rose-50/60 p-3">
                      <div>
                        <label className="block text-xs font-semibold text-stone-700 mb-1">Дата начала брака</label>
                        <input
                          type="text"
                          value={relationshipStartDate}
                          disabled={relationshipStartDateUnknown}
                          onChange={(e) => { setRelationshipStartDate(e.target.value); setRelationshipDateError(''); }}
                          placeholder="ДД.ММ.ГГГГ или год"
                          className="w-full px-3 py-2 text-xs rounded-lg border border-stone-300 bg-white text-stone-900"
                        />
                        <label className="mt-2 flex items-center gap-2 text-[11px] text-stone-600">
                          <input
                            type="checkbox"
                            checked={relationshipStartDateUnknown}
                            onChange={(e) => {
                              setRelationshipStartDateUnknown(e.target.checked);
                              if (e.target.checked) setRelationshipStartDate('');
                              setRelationshipDateError('');
                            }}
                          />
                          Дата начала неизвестна
                        </label>
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-stone-700 mb-1">Дата окончания брака</label>
                        <input
                          type="text"
                          value={relationshipEndDate}
                          disabled={relationshipEndDateUnknown}
                          onChange={(e) => setRelationshipEndDate(e.target.value)}
                          placeholder="ДД.ММ.ГГГГ или год"
                          className="w-full px-3 py-2 text-xs rounded-lg border border-stone-300 bg-white text-stone-900"
                        />
                        <label className="mt-2 flex items-center gap-2 text-[11px] text-stone-600">
                          <input
                            type="checkbox"
                            checked={relationshipEndDateUnknown}
                            onChange={(e) => {
                              setRelationshipEndDateUnknown(e.target.checked);
                              if (e.target.checked) setRelationshipEndDate('');
                            }}
                          />
                          Брак закончен, дата неизвестна
                        </label>
                        <p className="mt-1 text-[10px] text-stone-500">Оставьте поле и флажок пустыми, если брак продолжается.</p>
                      </div>
                      {relationshipDateError && <p className="sm:col-span-2 text-[11px] text-red-700">{relationshipDateError}</p>}
                    </div>
                  )}

                  <div>
                    <label className="block text-xs font-semibold text-stone-700 mb-1">
                      Кому (член семьи в древе):
                    </label>
                    <select
                      value={selectedRelativeId}
                      onChange={(e) => setSelectedRelativeId(e.target.value)}
                      className="w-full px-3 py-2 text-xs rounded-lg border border-stone-300 bg-white text-stone-900 focus:outline-none focus:ring-2 focus:ring-amber-500 font-medium"
                    >
                      <option value="">-- Выберите персоналию --</option>
                      {allPersons
                        .filter((p) => p.id !== person?.id)
                        .map((p) => (
                          <option key={p.id} value={p.id}>
                            {formatFullName(p, { format: 'natural' })}
                            {p.birthDate ? ` (${p.birthDate.slice(0, 4)})` : ''}
                          </option>
                        ))}
                    </select>
                  </div>

                  <div className="flex items-end">
                    <button
                      type="button"
                      disabled={!selectedRelativeId}
                      onClick={handleAddPendingRelation}
                      className="w-full flex items-center justify-center gap-1.5 py-2 px-3 text-xs font-medium rounded-lg bg-stone-900 text-stone-100 hover:bg-stone-800 disabled:opacity-40 transition shadow-xs"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Привязать связь</span>
                    </button>
                  </div>
                </div>

                {/* Optional Spouse Linking for Child/Adoptive-child */}
                {selectedRelativeId && (selectedRelRole === 'child' || selectedRelRole === 'adoptive-child') && (() => {
                  const targetSpouses = getSpouses(selectedRelativeId, allPersons, relationships);
                  if (targetSpouses.length === 0) return null;
                  const targetSpouse = targetSpouses[0];
                  return (
                    <div className="p-3 rounded-xl bg-white border border-amber-300 text-xs space-y-2 shadow-2xs">
                      <div className="flex items-center gap-1.5 font-semibold text-stone-800">
                        <Heart className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                        <span>Второй родитель (супруг(а) {formatFullName(targetSpouse.person, { format: 'short' })}):</span>
                      </div>
                      <p className="text-[11px] text-stone-500 leading-normal">
                        По умолчанию второй родитель <strong>не добавляется автоматически</strong>, чтобы избежать ошибок при усыновлении или детях от других союзов.
                      </p>
                      <div className="space-y-1.5 pt-1">
                        <label className="flex items-center gap-2 cursor-pointer text-stone-700 hover:text-stone-900">
                          <input
                            type="radio"
                            name="linkSpouseMode"
                            checked={linkSpouseMode === 'none'}
                            onChange={() => setLinkSpouseMode('none')}
                            className="text-amber-600 focus:ring-amber-500"
                          />
                          <span className="font-medium text-xs">Не связывать (ребёнок только этой персоны / приёмный)</span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer text-stone-700 hover:text-stone-900">
                          <input
                            type="radio"
                            name="linkSpouseMode"
                            checked={linkSpouseMode === 'adoptive'}
                            onChange={() => setLinkSpouseMode('adoptive')}
                            className="text-amber-600 focus:ring-amber-500"
                          />
                          <span className="font-medium text-xs text-violet-800">
                            Связать также с {formatFullName(targetSpouse.person, { format: 'short' })} как <strong>приёмного родителя</strong>
                          </span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer text-stone-700 hover:text-stone-900">
                          <input
                            type="radio"
                            name="linkSpouseMode"
                            checked={linkSpouseMode === 'biological'}
                            onChange={() => setLinkSpouseMode('biological')}
                            className="text-amber-600 focus:ring-amber-500"
                          />
                          <span className="font-medium text-xs">
                            Связать также с {formatFullName(targetSpouse.person, { format: 'short' })} как <strong>кровного родителя</strong>
                          </span>
                        </label>
                      </div>
                    </div>
                  );
                })()}

                {/* Live explanatory clarification box */}
                {selectedRelativeId && (() => {
                  const target = allPersons.find((p) => p.id === selectedRelativeId);
                  const currentName = person 
                    ? formatFullName(person, { format: 'natural' }) 
                    : (firstName.trim() || lastName.trim()
                      ? (patronymic.trim()
                        ? [lastName.trim(), firstName.trim(), patronymic.trim()].filter(Boolean).join(' ')
                        : [firstName.trim(), lastName.trim()].filter(Boolean).join(' '))
                      : 'Создаваемая персона');
                  const targetName = target ? formatFullName(target, { format: 'natural' }) : 'выбранный человек';

                  let explanation = '';
                  if (selectedRelRole === 'parent') {
                    explanation = `«${currentName}» будет родителем (отцом / матерью), а «${targetName}» — её ребёнком`;
                  } else if (selectedRelRole === 'child') {
                    explanation = `«${targetName}» будет родителем, а «${currentName}» — её ребёнком (сыном / дочерью)`;
                    } else if (selectedRelRole === 'marriage') {
                      explanation = `«${currentName}» и «${targetName}» будут связаны одним браком; его статус определяется датой окончания`;
                  } else if (selectedRelRole === 'sibling') {
                    explanation = `«${currentName}» и «${targetName}» будут родными братьями / сёстрами`;
                  } else if (selectedRelRole === 'adoptive-parent') {
                    explanation = `«${currentName}» будет приёмным родителем для «${targetName}»`;
                  } else if (selectedRelRole === 'adoptive-child') {
                    explanation = `«${targetName}» будет приёмным родителем для «${currentName}»`;
                  } else if (selectedRelRole === 'godparent') {
                    explanation = `«${currentName}» будет крёстным родителем для «${targetName}»`;
                  } else if (selectedRelRole === 'godchild') {
                    explanation = `«${targetName}» будет крёстным родителем для «${currentName}»`;
                  } else {
                    explanation = `«${currentName}» будет иметь степень родства «${customRelLabel || 'Связь'}» с «${targetName}»`;
                  }

                  return (
                    <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs text-amber-950 flex items-start gap-2 shadow-2xs">
                      <span className="text-base select-none leading-none mt-0.5">💡</span>
                      <div className="leading-relaxed">
                        <span className="font-bold text-amber-900">Наглядный смысл связи: </span>
                        <span>{explanation}.</span>
                      </div>
                    </div>
                  );
                })()}

                {selectedRelRole === 'custom' && (
                  <div className="pt-2">
                    <label className="block text-xs text-stone-600 mb-1">Название произвольной степени родства</label>
                    <input
                      type="text"
                      value={customRelLabel}
                      onChange={(e) => setCustomRelLabel(e.target.value)}
                      placeholder="Например: Крёстный отец, Опекун, Свояк, Троюродная сестра"
                      className="w-full px-3 py-2 text-xs rounded-lg border border-stone-300 bg-white text-stone-900"
                    />
                  </div>
                )}

                {/* Pending relationships list */}
                {pendingRelations.length > 0 && (
                  <div className="mt-3 space-y-1.5 pt-2 border-t border-amber-500/20">
                    <span className="text-[11px] font-semibold text-stone-600 block">
                      Новые связи, которые будут добавлены при сохранении:
                    </span>
                    {pendingRelations.map((rel, idx) => {
                      const target = allPersons.find((p) => p.id === rel.targetId);
                      const preset = RELATIONSHIP_ROLE_PRESETS.find((p) => p.role === rel.role);
                      const prefix = rel.customLabel ? `${rel.customLabel} для` : (preset?.badgeLabel || 'Связь с');
                      return (
                        <div
                          key={idx}
                          className="flex items-center justify-between px-3 py-2 bg-white rounded-xl border border-amber-300 text-xs shadow-2xs"
                        >
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-amber-900 bg-amber-100/90 px-2 py-0.5 rounded-md text-[11px]">
                              {prefix}:
                            </span>
                            <span className="text-stone-900 font-semibold">
                              {target ? formatFullName(target) : 'Персона ' + rel.targetId}
                            </span>
                            {rel.role === 'marriage' && (
                              <span className="text-[10px] text-stone-500">
                                {rel.startDate ? formatDisplayDate(rel.startDate) : 'начало неизвестно'}
                                {rel.endDate ? ` — ${formatDisplayDate(rel.endDate)}` : rel.endDateUnknown ? ' — окончание неизвестно' : ' — по настоящее время'}
                              </span>
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={() => handleRemovePendingRelation(idx)}
                            className="text-stone-400 hover:text-red-600 p-1"
                            title="Удалить эту связь"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 3: SIGNIFICANT DATES */}
          {activeTab === 'dates' && (
            <div className="space-y-4 animate-in fade-in duration-150">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-stone-700">
                    Значимые даты и исторические вехи
                  </h3>
                  <p className="text-xs text-stone-500">
                    Свадьбы, крещения, награждения, призыв на службу, получение образования, переезды
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleAddDate}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-stone-900 text-stone-100 hover:bg-stone-800 transition"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Добавить дату</span>
                </button>
              </div>

              {significantDates.length === 0 ? (
                <div className="text-center py-8 px-4 rounded-xl border border-dashed border-stone-300 bg-white">
                  <Calendar className="w-8 h-8 mx-auto text-stone-400 mb-2" />
                  <p className="text-xs text-stone-600 font-medium">Нет добавленных значимых дат</p>
                  <p className="text-xs text-stone-400 mt-0.5">
                    Нажмите «Добавить дату», чтобы зафиксировать важные события жизни.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {significantDates.map((item, index) => (
                    <div
                      key={item.id}
                      className="p-3.5 rounded-xl bg-white border border-stone-200 shadow-2xs space-y-2.5 relative group"
                    >
                      <button
                        type="button"
                        onClick={() => handleDeleteDate(item.id)}
                        className="absolute top-3 right-3 text-stone-400 hover:text-red-600 p-1"
                        title="Удалить веху"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pr-8">
                        <div>
                          <label className="block text-[11px] font-medium text-stone-600 mb-0.5">
                            Дата события (ДД.ММ.ГГГГ или год)
                          </label>
                          <input
                            type="text"
                            value={item.date}
                            onChange={(e) => handleUpdateDate(item.id, { date: e.target.value })}
                            onBlur={() => item.date && handleUpdateDate(item.id, { date: formatDisplayDate(item.date) })}
                            placeholder="08.07.1941 или 1941"
                            className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-stone-300 bg-white"
                          />
                        </div>
                        <div className="sm:col-span-2">
                          <label className="block text-[11px] font-medium text-stone-600 mb-0.5">
                            Название события
                          </label>
                          <input
                            type="text"
                            value={item.title}
                            onChange={(e) => handleUpdateDate(item.id, { title: e.target.value })}
                            placeholder="Награждение Орденом / Венчание / Окончание гимназии"
                            className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-stone-300 bg-white"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                        <div>
                          <label className="block text-[11px] font-medium text-stone-600 mb-0.5">
                            Место события
                          </label>
                          <input
                            type="text"
                            value={item.location || ''}
                            onChange={(e) => handleUpdateDate(item.id, { location: e.target.value })}
                            placeholder="г. Санкт-Петербург"
                            className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-stone-300 bg-white"
                          />
                        </div>
                        <div className="sm:col-span-2">
                          <label className="block text-[11px] font-medium text-stone-600 mb-0.5">
                            Подробности и архивные ссылки
                          </label>
                          <input
                            type="text"
                            value={item.description || ''}
                            onChange={(e) => handleUpdateDate(item.id, { description: e.target.value })}
                            placeholder="Выписка из приказа, реквизиты документа"
                            className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-stone-300 bg-white"
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 4: BIOGRAPHY & NOTES */}
          {activeTab === 'bio' && (
            <div className="space-y-4 animate-in fade-in duration-150">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-stone-700 mb-1">
                  Подробное описание и биография персоналии
                </label>
                <p className="text-xs text-stone-500 mb-3">
                  Зафиксируйте воспоминания родственников, историю жизни, места службы, архивные выписки и исторические свидетельства.
                </p>
                <textarea
                  rows={10}
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  placeholder="Родился в семье... Окончил... В годы войны... Хобби и увлечения... Воспоминания внуков..."
                  className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-stone-300 bg-white text-stone-900 leading-relaxed focus:outline-none focus:ring-2 focus:ring-amber-500/40"
                />
              </div>
            </div>
          )}

          {/* TAB 5: MEDIA FILES & DOCUMENTS */}
          {activeTab === 'media' && (
            <div className="space-y-5 animate-in fade-in duration-150">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 bg-stone-100 rounded-xl border border-stone-200">
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-stone-800">
                    Медиафайлы и архивные документы
                  </h3>
                  <p className="text-xs text-stone-500">
                    Прикрепленные материалы из общего медиаархива семьи.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsAttachModalOpen(true)}
                  className="flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg bg-amber-600 text-white hover:bg-amber-700 transition shadow-xs whitespace-nowrap"
                >
                  <FolderPlus className="w-3.5 h-3.5" />
                  <span>+ Прикрепить из архива</span>
                </button>
              </div>

              {mediaFiles.length === 0 ? (
                <div className="text-center py-10 px-4 rounded-xl border border-dashed border-stone-300 bg-white">
                  <ImageIcon className="w-10 h-10 mx-auto text-stone-300 mb-2" />
                  <p className="text-xs font-medium text-stone-700">Нет прикрепленных медиафайлов</p>
                  <p className="text-xs text-stone-400 mt-1 max-w-sm mx-auto leading-relaxed">
                    Все материалы загружаются через центральный раздел «Медиаархив». Здесь вы можете выбрать нужные файлы для этой персоны.
                  </p>
                  <div className="mt-4 flex items-center justify-center gap-2">
                    <button
                      type="button"
                      onClick={() => setIsAttachModalOpen(true)}
                      className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-amber-600 text-white hover:bg-amber-700 text-xs font-semibold shadow-xs transition"
                    >
                      <FolderPlus className="w-3.5 h-3.5" />
                      <span>Выбрать из медиаархива</span>
                    </button>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  {mediaFiles.map((media) => (
                    <div
                      key={media.id}
                      className="p-3 bg-white rounded-xl border border-stone-200 shadow-2xs space-y-2 relative group"
                    >
                      {/* Media preview */}
                      <div className="h-32 bg-stone-100 rounded-lg overflow-hidden flex items-center justify-center relative">
                        {media.type === 'photo' ? (
                          <img
                            src={media.dataUrl}
                            alt={media.name}
                            className="w-full h-full object-cover"
                          />
                        ) : media.type === 'video' ? (
                          <div className="flex flex-col items-center gap-1 text-stone-500">
                            <Film className="w-8 h-8 text-amber-600" />
                            <span className="text-[11px] font-medium">Видеофайл</span>
                          </div>
                        ) : (
                          <div className="flex flex-col items-center gap-1 text-stone-500">
                            <FileCheck className="w-8 h-8 text-stone-600" />
                            <span className="text-[11px] font-medium">Скан документа</span>
                          </div>
                        )}

                        {/* Avatar indicator */}
                        {avatarUrl === media.dataUrl && (
                          <span className="absolute top-2 left-2 px-2 py-0.5 rounded-md bg-amber-500 text-stone-900 text-[10px] font-bold shadow-xs">
                            Главный портрет
                          </span>
                        )}
                      </div>

                      {/* Info & Inputs */}
                      <div className="space-y-1.5">
                        <input
                          type="text"
                          value={media.name}
                          onChange={(e) => {
                            const val = e.target.value;
                            setMediaFiles((prev) =>
                              prev.map((m) => (m.id === media.id ? { ...m, name: val } : m))
                            );
                          }}
                          className="w-full font-medium text-xs text-stone-900 border-b border-transparent hover:border-stone-300 focus:border-amber-500 px-1 py-0.5 bg-transparent focus:outline-none"
                        />
                        <input
                          type="text"
                          value={media.caption || ''}
                          placeholder="Описание или подпись к фото/документу"
                          onChange={(e) => {
                            const val = e.target.value;
                            setMediaFiles((prev) =>
                              prev.map((m) => (m.id === media.id ? { ...m, caption: val } : m))
                            );
                          }}
                          className="w-full text-[11px] text-stone-600 border-b border-transparent hover:border-stone-300 focus:border-amber-500 px-1 py-0.5 bg-transparent focus:outline-none"
                        />
                      </div>

                      {/* Actions */}
                      <div className="flex items-center justify-between pt-1 border-t border-stone-100 text-xs">
                        {media.type === 'photo' && (
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              disabled={isProcessingAvatar}
                              onClick={() => handleSetPhotoAsAvatar(media)}
                              className={`text-[11px] font-medium transition flex items-center gap-1 ${
                                avatarUrl === media.dataUrl
                                  ? 'text-amber-600 font-bold'
                                  : 'text-stone-500 hover:text-stone-800'
                              }`}
                              title="Обрезать лицо и сделать главным портретом персоны"
                            >
                              <UserCheck className="w-3 h-3 text-amber-500" />
                              <span>{avatarUrl === media.dataUrl ? '✓ Портрет' : 'Портрет лица'}</span>
                            </button>
                            <span className="text-stone-300">·</span>
                            <button
                              type="button"
                              onClick={() => setInspectingFaceMedia(media)}
                              className="text-[11px] font-medium text-amber-800 hover:text-amber-950 flex items-center gap-1 transition"
                              title="Разметить лица на этом фото"
                            >
                              <Scan className="w-3 h-3 text-amber-600" />
                              <span>Лица ({media.faces?.length || 0})</span>
                            </button>
                          </div>
                        )}
                        <button
                          type="button"
                          onClick={() => {
                            setMediaFiles((prev) => prev.filter((m) => m.id !== media.id));
                            if (avatarUrl === media.dataUrl) setAvatarUrl('');
                          }}
                          className="text-stone-400 hover:text-rose-600 p-1 ml-auto flex items-center gap-1 text-[11px]"
                          title="Открепить от персоны (файл останется в архиве)"
                        >
                          <Unlink className="w-3.5 h-3.5" />
                          <span>Открепить</span>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Footer Actions */}
          <div className="pt-4 border-t border-stone-200 flex flex-col-reverse sm:flex-row items-center justify-between gap-3">
            <div>
              {isEditing && onDelete && (
                !isConfirmingDelete ? (
                  <button
                    type="button"
                    onClick={() => setIsConfirmingDelete(true)}
                    className="w-full sm:w-auto px-3.5 py-2 text-xs font-medium text-red-600 hover:bg-red-50 rounded-lg transition"
                  >
                    Удалить персоналию
                  </button>
                ) : (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-red-700 font-medium">Точно удалить?</span>
                    <button
                      type="button"
                      onClick={() => {
                        onDelete(person.id);
                        onClose();
                      }}
                      className="px-2.5 py-1.5 text-xs font-bold rounded-lg bg-red-600 hover:bg-red-700 text-white shadow-xs"
                    >
                      Да, удалить
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsConfirmingDelete(false)}
                      className="px-2.5 py-1.5 text-xs font-medium rounded-lg bg-stone-100 hover:bg-stone-200 text-stone-700"
                    >
                      Отмена
                    </button>
                  </div>
                )
              )}
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 sm:flex-initial px-4 py-2 text-xs font-medium rounded-lg border border-stone-300 bg-white text-stone-700 hover:bg-stone-50 transition"
              >
                Отмена
              </button>
              <button
                type="submit"
                className="flex-1 sm:flex-initial px-5 py-2 text-xs font-medium rounded-lg bg-stone-900 text-stone-100 hover:bg-stone-800 shadow-sm transition"
              >
                {isEditing ? 'Сохранить изменения' : 'Создать персоналию'}
              </button>
            </div>
          </div>
        </form>

        {/* Face Tagging Lightbox for uploaded media */}
        {inspectingFaceMedia && (
          <div 
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4 animate-in fade-in"
            onClick={() => setInspectingFaceMedia(null)}
          >
            <div 
              className="w-full max-w-3xl bg-stone-950 rounded-2xl overflow-hidden border border-stone-800 flex flex-col text-white shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between px-4 py-3 border-b border-stone-800">
                <h3 className="text-sm font-semibold truncate">
                  Разметка лиц: {inspectingFaceMedia.name}
                </h3>
                <button
                  type="button"
                  onClick={() => setInspectingFaceMedia(null)}
                  className="p-1.5 rounded-lg text-stone-400 hover:text-white hover:bg-stone-800 transition"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="flex-1 overflow-auto max-h-[75vh]">
                <PhotoFaceViewer
                  media={inspectingFaceMedia}
                  allPersons={allPersons}
                  targetPersonId={person?.id}
                  onSetAvatar={(croppedAvatar) => {
                    setAvatarUrl(croppedAvatar);
                  }}
                  onUpdateFaces={(updatedFaces) => {
                    setMediaFiles((prev) =>
                      prev.map((m) => (m.id === inspectingFaceMedia.id ? { ...m, faces: updatedFaces } : m))
                    );
                    setInspectingFaceMedia({ ...inspectingFaceMedia, faces: updatedFaces });
                  }}
                />
              </div>
            </div>
          </div>
        )}
        {/* Attach Media from Archive Modal */}
        {isAttachModalOpen && (
          <AttachMediaModal
            isOpen={isAttachModalOpen}
            onClose={() => setIsAttachModalOpen(false)}
            targetPerson={{
              id: person?.id || 'temp-new-person',
              firstName: firstName || 'Новая персона',
              lastName: lastName || '',
              gender,
              isDeceased,
              bio: '',
              significantDates: [],
              mediaFiles: [],
              tags: [],
              createdAt: Date.now(),
              updatedAt: Date.now()
            }}
            allPersons={allPersons}
            mediaArchive={(() => {
              const map = new Map<string, MediaItem>();
              mediaArchive.forEach((m) => map.set(m.id, m));
              mediaFiles.forEach((m) => map.set(m.id, m));
              allPersons.forEach((p) => p.mediaFiles?.forEach((m) => map.set(m.id, m)));
              return Array.from(map.values());
            })()}
            currentlyAttachedIds={mediaFiles.map((m) => m.id)}
            onSaveAttachments={(selectedIds) => {
              const pool = new Map<string, MediaItem>();
              mediaArchive.forEach((m) => pool.set(m.id, m));
              mediaFiles.forEach((m) => pool.set(m.id, m));
              allPersons.forEach((p) => p.mediaFiles?.forEach((m) => pool.set(m.id, m)));
              const nextList: MediaItem[] = [];
              selectedIds.forEach((id) => {
                const item = pool.get(id);
                if (item) nextList.push({ ...item });
              });
              setMediaFiles(nextList);
            }}
            onNavigateToArchive={() => {
              setIsAttachModalOpen(false);
              onClose();
              if (onNavigateToArchive) onNavigateToArchive();
            }}
          />
        )}
      </div>
    </div>
  );
};
