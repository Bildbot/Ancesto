import * as faceapi from '@vladmandic/face-api';
import { Person, MediaItem, FaceTag, FaceBox } from '../types/genealogy';

// Model loading state
let modelsLoaded = false;
let modelsLoadingPromise: Promise<boolean> | null = null;
let modelLoadError: string | null = null;

// Paths to face-api models (cached in public/models or CDN fallback)
const MODEL_URL_LOCAL = '/models';
const MODEL_URL_CDN = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model';

/**
 * Initialize and load face-api neural network weights
 */
export async function loadFaceModels(): Promise<boolean> {
  if (modelsLoaded) return true;
  if (modelsLoadingPromise) return modelsLoadingPromise;

  modelsLoadingPromise = (async () => {
    try {
      // Try local models first
      try {
        await Promise.all([
          faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL_LOCAL),
          faceapi.nets.faceLandmark68TinyNet.loadFromUri(MODEL_URL_LOCAL),
          faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL_LOCAL)
        ]);
        modelsLoaded = true;
        modelLoadError = null;
        return true;
      } catch (localErr) {
        console.warn('Local face models not reachable, falling back to CDN...', localErr);
        // Fallback to CDN
        await Promise.all([
          faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL_CDN),
          faceapi.nets.faceLandmark68TinyNet.loadFromUri(MODEL_URL_CDN),
          faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL_CDN)
        ]);
        modelsLoaded = true;
        modelLoadError = null;
        return true;
      }
    } catch (err: any) {
      console.error('Failed to load face detection neural networks:', err);
      modelLoadError = err?.message || 'Не удалось загрузить модели распознавания лиц';
      return false;
    } finally {
      modelsLoadingPromise = null;
    }
  })();

  return modelsLoadingPromise;
}

export function isFaceModelReady(): boolean {
  return modelsLoaded;
}

export function getFaceModelError(): string | null {
  return modelLoadError;
}

/**
 * Helper to safely load an HTMLImageElement from a URL or Base64 dataUrl
 */
export function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = (e) => reject(new Error('Не удалось загрузить изображение для распознавания'));
    img.src = src;
  });
}

/**
 * Detect all faces in an image and calculate 128-d face descriptors
 */
export async function detectFacesInPhoto(
  photoUrl: string, 
  mediaId: string
): Promise<FaceTag[]> {
  const ready = await loadFaceModels();
  if (!ready) {
    throw new Error(modelLoadError || 'Модели нейросети не инициализированы');
  }

  const img = await loadImageElement(photoUrl);
  const naturalWidth = img.naturalWidth || img.width;
  const naturalHeight = img.naturalHeight || img.height;

  if (naturalWidth === 0 || naturalHeight === 0) {
    return [];
  }

  // Detect with tinyFaceDetector + tiny landmarks + face recognition descriptor
  const detectorOptions = new faceapi.TinyFaceDetectorOptions({
    inputSize: 416,
    scoreThreshold: 0.35
  });

  const detections = await faceapi
    .detectAllFaces(img, detectorOptions)
    .withFaceLandmarks(true)
    .withFaceDescriptors();

  const faces: FaceTag[] = [];

  for (let i = 0; i < detections.length; i++) {
    const d = detections[i];
    const box = d.detection.box;

    // Convert pixel coordinates to percentage (0 - 100%) so they scale responsively
    // Add a slight margin around the detected face for natural portrait box
    const marginRatio = 0.08;
    const padW = box.width * marginRatio;
    const padH = box.height * marginRatio;

    const rawX = Math.max(0, box.x - padW);
    const rawY = Math.max(0, box.y - padH);
    const rawW = Math.min(naturalWidth - rawX, box.width + padW * 2);
    const rawH = Math.min(naturalHeight - rawY, box.height + padH * 2);

    const faceBox: FaceBox = {
      x: Math.round((rawX / naturalWidth) * 10000) / 100,
      y: Math.round((rawY / naturalHeight) * 10000) / 100,
      width: Math.round((rawW / naturalWidth) * 10000) / 100,
      height: Math.round((rawH / naturalHeight) * 10000) / 100
    };

    // Store descriptor as regular array of 128 floats
    const descriptorArray = Array.from(d.descriptor);

    faces.push({
      id: `face-${mediaId}-${Date.now()}-${i}`,
      mediaId,
      box: faceBox,
      confidence: Math.round(d.detection.score * 100) / 100,
      descriptor: descriptorArray,
      isConfirmed: false,
      createdAt: Date.now()
    });
  }

  return faces;
}

/**
 * Known labeled reference descriptors in the family tree
 */
export interface LabeledFaceReference {
  personId: string;
  descriptor: number[];
  faceId?: string;
  mediaId?: string;
}

/**
 * Collect all confirmed face descriptors across all persons in the database
 */
export function collectKnownFaceReferences(persons: Person[]): LabeledFaceReference[] {
  const references: LabeledFaceReference[] = [];

  persons.forEach((person) => {
    if (!person.mediaFiles) return;

    person.mediaFiles.forEach((media) => {
      if (!media.faces) return;

      media.faces.forEach((face) => {
        // Must be assigned to this person (or marked personId) and confirmed, with a valid 128-float descriptor
        const assignedId = face.personId || (face.isConfirmed ? person.id : undefined);
        if (assignedId && face.descriptor && face.descriptor.length === 128) {
          references.push({
            personId: assignedId,
            descriptor: face.descriptor,
            faceId: face.id,
            mediaId: media.id
          });
        }
      });
    });
  });

  return references;
}

/**
 * Match a target face descriptor against known family members
 * Returns suggested personId and similarity score (0 to 100)
 */
export function matchFaceToPersons(
  targetDescriptor: number[],
  knownReferences: LabeledFaceReference[]
): { suggestedPersonId?: string; suggestedScore?: number; distance?: number } {
  if (!targetDescriptor || targetDescriptor.length !== 128 || knownReferences.length === 0) {
    return {};
  }

  // Calculate distance to all known references and group by personId
  const personDistances: { [personId: string]: number[] } = {};

  for (const ref of knownReferences) {
    const dist = faceapi.euclideanDistance(targetDescriptor, ref.descriptor);
    if (!personDistances[ref.personId]) {
      personDistances[ref.personId] = [];
    }
    personDistances[ref.personId].push(dist);
  }

  let bestPersonId: string | undefined;
  let bestDistance = Infinity;

  // Threshold standard for face-api 128-d descriptors is ~0.6 (lower distance = closer match)
  const MATCH_THRESHOLD = 0.58;

  Object.entries(personDistances).forEach(([personId, distances]) => {
    // Take minimum distance (best sample match for this person)
    const minDistance = Math.min(...distances);
    if (minDistance < bestDistance) {
      bestDistance = minDistance;
      bestPersonId = personId;
    }
  });

  if (bestPersonId && bestDistance <= MATCH_THRESHOLD) {
    // Convert distance to intuitive similarity percentage:
    // Distance 0.0 -> 100% match
    // Distance 0.3 -> ~85% match
    // Distance 0.55 -> ~60% match
    const rawScore = 1 - (bestDistance / 0.65);
    const scorePercentage = Math.round(Math.max(50, Math.min(99, rawScore * 100)));

    return {
      suggestedPersonId: bestPersonId,
      suggestedScore: scorePercentage,
      distance: Math.round(bestDistance * 1000) / 1000
    };
  }

  return {};
}

/**
 * Re-evaluate and match all unconfirmed faces across all persons
 * using all currently confirmed face references.
 * This delivers the Tonfotos experience: user tags 1-2 photos, and all other photos update with suggestions!
 */
export function updateFaceSuggestionsAcrossTree(persons: Person[]): {
  updatedPersons: Person[];
  newSuggestionsCount: number;
} {
  const references = collectKnownFaceReferences(persons);
  let newSuggestionsCount = 0;

  const updatedPersons = persons.map((person) => {
    if (!person.mediaFiles || person.mediaFiles.length === 0) return person;

    let personMediaChanged = false;

    const updatedMedia = person.mediaFiles.map((media) => {
      if (!media.faces || media.faces.length === 0) return media;

      let mediaFacesChanged = false;

      const updatedFaces = media.faces.map((face) => {
        // If already confirmed by human, keep as is
        if (face.isConfirmed && face.personId) return face;

        if (face.descriptor && face.descriptor.length === 128 && references.length > 0) {
          // Filter out matching against the face's own reference if any
          const validRefs = references.filter((r) => r.faceId !== face.id);
          const match = matchFaceToPersons(face.descriptor, validRefs);

          if (match.suggestedPersonId) {
            if (
              face.suggestedPersonId !== match.suggestedPersonId ||
              face.suggestedScore !== match.suggestedScore
            ) {
              mediaFacesChanged = true;
              if (!face.suggestedPersonId) {
                newSuggestionsCount++;
              }
              return {
                ...face,
                suggestedPersonId: match.suggestedPersonId,
                suggestedScore: match.suggestedScore
              };
            }
          } else if (face.suggestedPersonId) {
            // No longer matches within threshold
            mediaFacesChanged = true;
            return {
              ...face,
              suggestedPersonId: undefined,
              suggestedScore: undefined
            };
          }
        }

        return face;
      });

      if (mediaFacesChanged) {
        personMediaChanged = true;
        return { ...media, faces: updatedFaces };
      }

      return media;
    });

    if (personMediaChanged) {
      return { ...person, mediaFiles: updatedMedia };
    }

    return person;
  });

  return { updatedPersons, newSuggestionsCount };
}

/**
 * Synchronize photos across all tagged persons' mediaFiles.
 * If Person A has a photo where Person B and Person C are tagged in faces,
 * both Person B and Person C will automatically have this photo attached to their card as well.
 */
export function syncTaggedMediaAcrossPersons(persons: Person[]): Person[] {
  // Map of mediaId -> latest merged media item
  const allMediaMap = new Map<string, MediaItem>();
  // Map of mediaId -> Set of personIds tagged in this media
  const taggedPersonsPerMedia = new Map<string, Set<string>>();

  // First pass: collect all photos and merge face tags across all instances
  persons.forEach((person) => {
    if (!person.mediaFiles) return;
    person.mediaFiles.forEach((media) => {
      if (!allMediaMap.has(media.id)) {
        allMediaMap.set(media.id, {
          ...media,
          originPersonId: media.originPersonId || person.id,
          faces: media.faces ? [...media.faces] : []
        });
      } else {
        const existing = allMediaMap.get(media.id)!;
        // Merge face tags: keep whichever has personId or is confirmed
        const facesMap = new Map<string, FaceTag>();
        (existing.faces || []).forEach((f) => facesMap.set(f.id, f));
        (media.faces || []).forEach((f) => {
          const prev = facesMap.get(f.id);
          if (!prev) {
            facesMap.set(f.id, f);
          } else {
            // Merge fields; prefer assigned personId / isConfirmed
            facesMap.set(f.id, {
              ...prev,
              ...f,
              personId: f.personId || prev.personId,
              isConfirmed: f.isConfirmed || prev.isConfirmed,
              descriptor: f.descriptor || prev.descriptor
            });
          }
        });
        existing.faces = Array.from(facesMap.values());
        if (!existing.originPersonId && (media.originPersonId || person.id)) {
          existing.originPersonId = media.originPersonId || person.id;
        }
      }

      // Collect all tagged persons for this media
      const currentMedia = allMediaMap.get(media.id)!;
      if (currentMedia.faces) {
        currentMedia.faces.forEach((face) => {
          if (face.personId) {
            if (!taggedPersonsPerMedia.has(media.id)) {
              taggedPersonsPerMedia.set(media.id, new Set());
            }
            taggedPersonsPerMedia.get(media.id)!.add(face.personId);
          }
        });
      }
    });
  });

  // Second pass: ensure every tagged person has this photo attached to their card
  return persons.map((person) => {
    const existingMedia = person.mediaFiles ? [...person.mediaFiles] : [];
    const existingMediaMap = new Map(existingMedia.map((m) => [m.id, m]));
    let hasChanges = false;

    // Check all media across the family tree
    allMediaMap.forEach((canonicalMedia, mediaId) => {
      const taggedSet = taggedPersonsPerMedia.get(mediaId);
      const isTagged = taggedSet && taggedSet.has(person.id);

      if (isTagged) {
        if (!existingMediaMap.has(mediaId)) {
          // Person is tagged on this photo, but doesn't have it yet -> Attach photo to this person!
          existingMedia.push(canonicalMedia);
          existingMediaMap.set(mediaId, canonicalMedia);
          hasChanges = true;
        } else {
          // Photo already present: check if faces need updating
          const current = existingMediaMap.get(mediaId)!;
          if (JSON.stringify(current.faces) !== JSON.stringify(canonicalMedia.faces)) {
            const idx = existingMedia.findIndex((m) => m.id === mediaId);
            if (idx >= 0) {
              existingMedia[idx] = { ...current, faces: canonicalMedia.faces };
              hasChanges = true;
            }
          }
        }
      }
    });

    if (hasChanges) {
      return {
        ...person,
        mediaFiles: existingMedia,
        updatedAt: Date.now()
      };
    }

    return person;
  });
}

/**
 * Crop a portrait avatar centered on a face box with studio portrait proportions.
 * Positions eyes and head naturally with proper headroom and shoulder spacing.
 */
export async function cropFaceToAvatar(
  imageUrl: string,
  box: FaceBox,
  targetSize: number = 400
): Promise<string> {
  try {
    const img = await loadImageElement(imageUrl);
    const nw = img.naturalWidth || img.width;
    const nh = img.naturalHeight || img.height;

    if (nw === 0 || nh === 0) return imageUrl;

    // Face coordinates in pixels
    const bx = (box.x / 100) * nw;
    const by = (box.y / 100) * nh;
    const bw = (box.width / 100) * nw;
    const bh = (box.height / 100) * nh;

    // Face center and eye level
    const cx = bx + bw / 2;
    const eyeY = by + bh * 0.4;

    // Portrait crop dimension (1.8x the face size for natural head & shoulder view)
    const faceSize = Math.max(bw, bh);
    let cropSize = Math.round(faceSize * 1.85);

    // Clamp crop size to image dimensions
    const maxDim = Math.min(nw, nh);
    if (cropSize > maxDim) {
      cropSize = maxDim;
    }

    // Position crop so eyes sit approximately at 38% from the top
    let cropX = Math.round(cx - cropSize / 2);
    let cropY = Math.round(eyeY - cropSize * 0.38);

    // Clamp coordinates inside image boundary
    if (cropX < 0) cropX = 0;
    if (cropY < 0) cropY = 0;
    if (cropX + cropSize > nw) cropX = nw - cropSize;
    if (cropY + cropSize > nh) cropY = nh - cropSize;

    // Boundary safeguards
    cropX = Math.max(0, cropX);
    cropY = Math.max(0, cropY);
    cropSize = Math.min(cropSize, nw - cropX, nh - cropY);

    const canvas = document.createElement('canvas');
    canvas.width = targetSize;
    canvas.height = targetSize;
    const ctx = canvas.getContext('2d');
    if (!ctx) return imageUrl;

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    ctx.drawImage(
      img,
      cropX,
      cropY,
      cropSize,
      cropSize,
      0,
      0,
      targetSize,
      targetSize
    );

    return canvas.toDataURL('image/jpeg', 0.92);
  } catch (err) {
    console.error('Failed to crop face to avatar:', err);
    return imageUrl;
  }
}

/**
 * Automatically extract the best portrait avatar from a photo.
 * If faces are already tagged:
 *   1. Prioritize face tagged with personId
 *   2. Or face with highest score
 *   3. If no faces cached, run quick AI face detector to find and crop the face.
 * Returns cropped avatar data URL or original if no face detected.
 */
export async function extractBestFaceAvatar(
  imageUrl: string,
  personId?: string,
  cachedFaces?: FaceTag[]
): Promise<string> {
  // 1. Check existing face tags
  if (cachedFaces && cachedFaces.length > 0) {
    if (personId) {
      const match = cachedFaces.find((f) => f.personId === personId);
      if (match) {
        return cropFaceToAvatar(imageUrl, match.box);
      }
    }
    // If only one face on photo, use that face
    if (cachedFaces.length === 1) {
      return cropFaceToAvatar(imageUrl, cachedFaces[0].box);
    }
    // If multiple faces, find the largest / most prominent face
    let bestFace = cachedFaces[0];
    let maxArea = 0;
    cachedFaces.forEach((f) => {
      const area = f.box.width * f.box.height;
      if (area > maxArea) {
        maxArea = area;
        bestFace = f;
      }
    });
    return cropFaceToAvatar(imageUrl, bestFace.box);
  }

  // 2. Try running face detection on the photo
  try {
    const detected = await detectFacesInPhoto(imageUrl, 'avatar-crop');
    if (detected.length > 0) {
      // Find largest face (usually the subject of portrait)
      let bestFace = detected[0];
      let maxArea = 0;
      detected.forEach((f) => {
        const area = f.box.width * f.box.height;
        if (area > maxArea) {
          maxArea = area;
          bestFace = f;
        }
      });
      return cropFaceToAvatar(imageUrl, bestFace.box);
    }
  } catch (err) {
    console.warn('Face detection for avatar crop was skipped:', err);
  }

  return imageUrl;
}
