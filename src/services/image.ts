/** Browser image helpers (canvas-based). Used to shrink photos before sending them for recognition. */

/** Scales a photo down so its longest side is at most `maxSize` px, as JPEG. */
export async function resizeImage(photo: Blob, maxSize: number, quality = 0.8): Promise<Blob> {
  const bitmap = await createImageBitmap(photo);
  const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not encode image'))), 'image/jpeg', quality),
  );
}

