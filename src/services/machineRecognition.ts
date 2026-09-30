/**
 * Machine recognition from a photo.
 *
 * The UI only depends on the `MachineRecognizer` interface. The MVP uses `mockRecognizer`,
 * which does no image analysis: it returns every machine/cable exercise with confidence 0,
 * so the user simply picks from the list. To add real AI later, write e.g. `apiRecognizer`
 * that uploads the photo to a vision service, then change the export at the bottom.
 */
import type { Exercise } from '../types';

export interface MachineSuggestion {
  exerciseId: string;
  /** 0-1. 0 means "not analysed" - the UI then shows the list without a "best match". */
  confidence: number;
}

export interface MachineRecognizer {
  identify(photo: Blob, exercises: Exercise[]): Promise<MachineSuggestion[]>;
}

export const mockRecognizer: MachineRecognizer = {
  async identify(_photo, exercises) {
    await new Promise((r) => setTimeout(r, 600)); // feel like a real request
    return exercises
      .filter((e) => e.equipment === 'machine' || e.equipment === 'cable')
      .map((e) => ({ exerciseId: e.id, confidence: 0 }));
  },
};

export const machineRecognizer: MachineRecognizer = mockRecognizer;

/** Shrinks a photo to a small JPEG data URL so it fits comfortably in local storage (~10-20 KB). */
export async function toThumbnail(photo: Blob, maxSize = 240): Promise<string> {
  const bitmap = await createImageBitmap(photo);
  const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas.toDataURL('image/jpeg', 0.7);
}
