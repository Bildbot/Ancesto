import { describe, expect, it, vi } from 'vitest';

vi.mock('@vladmandic/face-api', () => ({}));

import {
  applyFaceReviewDecision,
  attachMediaToPerson,
  clusterUnassignedFaces,
  detachMediaFromPerson,
  syncTaggedMediaAcrossPersons,
} from './faceRecognition';
import type { MediaItem, Person } from '../types/genealogy';

const sharedDocument: MediaItem = {
  id: 'media-1',
  type: 'document',
  name: 'Свидетельство',
  dataUrl: 'data:text/plain;base64,WA==',
  faces: [],
};

function person(id: string, mediaFiles: MediaItem[]): Person {
  return {
    id,
    firstName: id,
    lastName: 'Тестов',
    gender: 'other',
    isDeceased: false,
    bio: '',
    significantDates: [],
    mediaFiles,
    tags: [],
    createdAt: 1,
    updatedAt: 1,
  };
}

describe('MediaAttachmentService contract', () => {
  it('keeps a manual untagged attachment for every linked person', () => {
    const result = syncTaggedMediaAcrossPersons([
      person('person-a', [sharedDocument]),
      person('person-b', [sharedDocument]),
    ]);

    expect(result.map((item) => item.mediaFiles.map((media) => media.id))).toEqual([
      ['media-1'],
      ['media-1'],
    ]);
  });

  it('removes a detached person face tag from every shared copy', () => {
    const sharedPhoto: MediaItem = {
      ...sharedDocument,
      type: 'photo',
      faces: [{
        id: 'face-1',
        mediaId: 'media-1',
        box: { x: 10, y: 10, width: 20, height: 20 },
        personId: 'person-b',
        isConfirmed: true,
      }],
    };

    const result = detachMediaFromPerson([
      person('person-a', [sharedPhoto]),
      person('person-b', [sharedPhoto]),
    ], 'person-b', 'media-1');

    expect(result[0].mediaFiles).toHaveLength(1);
    expect(result[0].mediaFiles[0].faces?.[0].personId).toBeUndefined();
    expect(result[1].mediaFiles).toEqual([]);
  });

  it('keeps an explicit attachment even when the photo is tagged to another person', () => {
    const taggedPhoto: MediaItem = {
      ...sharedDocument,
      type: 'photo',
      faces: [{
        id: 'face-1',
        mediaId: 'media-1',
        box: { x: 10, y: 10, width: 20, height: 20 },
        personId: 'person-a',
        isConfirmed: true,
      }],
    };

    const result = attachMediaToPerson([
      person('person-a', [taggedPhoto]),
      person('person-b', []),
    ], 'person-b', taggedPhoto);

    expect(result[1].mediaFiles).toHaveLength(1);
    expect(result[1].mediaFiles[0].faces?.[0].personId).toBe('person-a');
    expect(result[1].mediaFiles[0].manualPersonIds).toContain('person-b');
  });

  it('detaches only the requested manual link and preserves remaining people and face tags', () => {
    const taggedPhoto: MediaItem = {
      ...sharedDocument,
      type: 'photo',
      manualPersonIds: ['person-b', 'person-c'],
      faces: [{
        id: 'face-1', mediaId: 'media-1',
        box: { x: 10, y: 10, width: 20, height: 20 },
        personId: 'person-a', isConfirmed: true,
      }],
    };
    const result = detachMediaFromPerson([
      person('person-a', [taggedPhoto]),
      person('person-b', [taggedPhoto]),
      person('person-c', [taggedPhoto]),
    ], 'person-b', 'media-1');

    expect(result[1].mediaFiles).toEqual([]);
    expect(result[0].mediaFiles[0]).toMatchObject({
      manualPersonIds: ['person-c'],
      faces: [{ personId: 'person-a', isConfirmed: true }],
    });
    expect(result[2].mediaFiles[0].manualPersonIds).toContain('person-c');
  });

  it('clusters similar unknown faces while keeping different people in separate clusters', () => {
    const descriptor = (first: number) => [first, ...Array(127).fill(0)];
    const candidate = (mediaId: string, faceId: string, first: number) => ({
      media: { ...sharedDocument, id: mediaId, type: 'photo' as const },
      face: {
        id: faceId,
        mediaId,
        box: { x: 10, y: 10, width: 20, height: 20 },
        descriptor: descriptor(first),
      },
    });

    const clusters = clusterUnassignedFaces([
      candidate('photo-a', 'face-a', 0),
      candidate('photo-b', 'face-b', 0.2),
      candidate('photo-c', 'face-c', 1.2),
      { ...candidate('photo-d', 'face-confirmed', 0.01), face: { ...candidate('photo-d', 'face-confirmed', 0.01).face, personId: 'person-a', isConfirmed: true } },
    ]);

    expect(clusters.map((cluster) => cluster.candidates.map(({ face }) => face.id))).toEqual([
      ['face-a', 'face-b'],
      ['face-c'],
    ]);
  });

  it('leaves a rejected face unassigned in the archive and remembers the rejected person', () => {
    const face = {
      id: 'face-1',
      mediaId: 'photo-1',
      box: { x: 10, y: 10, width: 20, height: 20 },
      descriptor: Array(128).fill(0),
    };
    const photo = { ...sharedDocument, id: 'photo-1', type: 'photo' as const, faces: [face] };
    const result = applyFaceReviewDecision([], [photo], 'photo-1', 'face-1', 'person-a', false);

    expect(result.mediaArchive[0].faces?.[0]).toMatchObject({
      personId: undefined,
      isConfirmed: false,
      rejectedPersonIds: ['person-a'],
    });
    expect(result.persons).toEqual([]);
  });

  it('confirms a face, attaches its photo to the selected person, and clears their rejection', () => {
    const face = {
      id: 'face-1',
      mediaId: 'photo-1',
      box: { x: 10, y: 10, width: 20, height: 20 },
      descriptor: Array(128).fill(0),
      rejectedPersonIds: ['person-a'],
    };
    const photo = { ...sharedDocument, id: 'photo-1', type: 'photo' as const, faces: [face] };
    const result = applyFaceReviewDecision(
      [person('person-a', [])], [photo], 'photo-1', 'face-1', 'person-a', true,
    );

    expect(result.mediaArchive[0].faces?.[0]).toMatchObject({ personId: 'person-a', isConfirmed: true });
    expect(result.mediaArchive[0].faces?.[0].rejectedPersonIds).toEqual([]);
    expect(result.persons[0].mediaFiles.map((media) => media.id)).toContain('photo-1');
  });
});
