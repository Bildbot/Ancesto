import type { FaceBox } from '../types/genealogy';

export interface ImageRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Returns the object-contain image bounds within a container. */
export function getContainedImageRect(
  container: ImageRect,
  imageWidth: number,
  imageHeight: number,
): ImageRect | null {
  if (container.width <= 0 || container.height <= 0 || imageWidth <= 0 || imageHeight <= 0) return null;
  const scale = Math.min(container.width / imageWidth, container.height / imageHeight);
  const width = imageWidth * scale;
  const height = imageHeight * scale;
  return {
    left: container.left + (container.width - width) / 2,
    top: container.top + (container.height - height) / 2,
    width,
    height,
  };
}

/** Converts a pointer coordinate to a clamped percentage of the displayed image. */
export function pointerToImagePercent(
  clientX: number,
  clientY: number,
  rect: ImageRect,
): { x: number; y: number } | null {
  if (rect.width <= 0 || rect.height <= 0) return null;
  if (clientX < rect.left || clientX > rect.left + rect.width || clientY < rect.top || clientY > rect.top + rect.height) return null;
  return {
    x: Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100)),
    y: Math.max(0, Math.min(100, ((clientY - rect.top) / rect.height) * 100)),
  };
}

export function faceBoxToPixels(box: FaceBox, rect: ImageRect): ImageRect {
  return {
    left: rect.left + (box.x / 100) * rect.width,
    top: rect.top + (box.y / 100) * rect.height,
    width: (box.width / 100) * rect.width,
    height: (box.height / 100) * rect.height,
  };
}
