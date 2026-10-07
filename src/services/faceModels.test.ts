import { beforeEach, expect, it, vi } from 'vitest';

const load = vi.hoisted(() => vi.fn());
vi.mock('@vladmandic/face-api', () => ({
  nets: {
    tinyFaceDetector: { loadFromUri: load },
    faceLandmark68TinyNet: { loadFromUri: load },
    faceRecognitionNet: { loadFromUri: load },
  },
}));

beforeEach(() => { vi.resetModules(); load.mockReset(); });

it('reports missing bundled models without trying an external CDN', async () => {
  load.mockRejectedValue(new Error('Local model missing'));
  const { loadFaceModels, getFaceModelError } = await import('./faceRecognition');
  expect(await loadFaceModels()).toBe(false);
  expect(load).toHaveBeenCalledTimes(3);
  expect(load.mock.calls.every(([url]) => url === '/models')).toBe(true);
  expect(getFaceModelError()).toContain('Local model missing');
});

it('matches known descriptors without initializing neural networks', async () => {
  const { matchFaceToPersons } = await import('./faceRecognition');
  const descriptor = Array(128).fill(0);
  const reference = [...descriptor];
  reference[0] = 0.3;
  expect(matchFaceToPersons(descriptor, [{ personId: 'person-1', descriptor: reference }]).distance).toBe(0.3);
  expect(load).not.toHaveBeenCalled();
});
