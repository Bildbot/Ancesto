import { describe, expect, it } from 'vitest';
import { faceBoxToPixels, getContainedImageRect, pointerToImagePercent } from './imageCoordinates';

describe('image coordinate conversions', () => {
  it.each([
    ['landscape in portrait container', { left: 0, top: 0, width: 300, height: 500 }, 1600, 900, { left: 0, top: 165.625, width: 300, height: 168.75 }],
    ['portrait in landscape container', { left: 10, top: 20, width: 800, height: 400 }, 900, 1600, { left: 297.5, top: 20, width: 225, height: 400 }],
    ['square in square container', { left: 0, top: 0, width: 400, height: 400 }, 800, 800, { left: 0, top: 0, width: 400, height: 400 }],
  ])('computes %s bounds', (_name, container, width, height, expected) => {
    expect(getContainedImageRect(container, width, height)).toEqual(expected);
  });

  it('maps face boxes to the displayed image rect', () => {
    expect(faceBoxToPixels({ x: 10, y: 20, width: 30, height: 40 }, { left: 50, top: 100, width: 200, height: 300 }))
      .toEqual({ left: 70, top: 160, width: 60, height: 120 });
  });

  it('converts pointer coordinates and rejects letterbox clicks', () => {
    const rect = { left: 20, top: 100, width: 200, height: 300 };
    expect(pointerToImagePercent(120, 250, rect)).toEqual({ x: 50, y: 50 });
    expect(pointerToImagePercent(10, 250, rect)).toBeNull();
    expect(pointerToImagePercent(220, 400, rect)).toEqual({ x: 100, y: 100 });
  });
});
