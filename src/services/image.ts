/** Browser image helpers (canvas-based). */

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

/** Small JPEG data URL (~10-20 KB) that fits comfortably in local storage. */
export async function toThumbnail(photo: Blob, maxSize = 240): Promise<string> {
  const small = await resizeImage(photo, maxSize, 0.7);
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(small);
  });
}
