import { describe, expect, it, vi } from 'vitest';

vi.mock('@vladmandic/face-api', () => ({}));

import { attachMediaToPerson, detachMediaFromPerson, syncTaggedMediaAcrossPersons } from './faceRecognition';
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
  });
});
