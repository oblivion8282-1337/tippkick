/**
 * Client-seitige Bild-Komprimierung für Profilbilder (ohne Abhängigkeiten):
 * skaliert auf max. 512px Kante und encodiert als JPEG mit sinkender Qualität,
 * bis das Ergebnis unter maxBytes liegt. Avatar-Displays sind klein — mehr als
 * 512px würde niemand sehen, spart aber massiv Speicher/Bandbreite.
 */
export async function compressImage(
  file: File,
  { maxBytes = 1024 * 1024, maxDimension = 512 }: { maxBytes?: number; maxDimension?: number } = {},
): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Canvas nicht verfügbar');
  }
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  let quality = 0.85;
  let blob = await canvasToJpeg(canvas, quality);
  while (blob.size > maxBytes && quality > 0.4) {
    quality -= 0.15;
    blob = await canvasToJpeg(canvas, quality);
  }
  if (blob.size > maxBytes) {
    throw new Error('Bild lässt sich nicht genug verkleinern');
  }
  return blob;
}

function canvasToJpeg(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('Encodieren fehlgeschlagen'))),
      'image/jpeg',
      quality,
    );
  });
}
