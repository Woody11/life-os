const MAX_DIMENSION = 2048;
const JPEG_QUALITY = 0.85;

// Re-encodes a photo to a downscaled JPEG before upload — keeps mobile-camera
// photos (often 4000px+, several MB, sometimes HEIC) small and in a format
// the extraction pipeline always accepts. Falls back to the original file if
// the browser can't decode it (e.g. an unsupported HEIC variant) so a photo
// is never silently dropped.
export async function downscalePhoto(file) {
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    canvas.getContext('2d').drawImage(bitmap, 0, 0, width, height);
    bitmap.close();

    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY));
    if (!blob) return file;

    const name = file.name.replace(/\.[^.]+$/, '') + '.jpg';
    return new File([blob], name, { type: 'image/jpeg' });
  } catch {
    return file;
  }
}

export async function downscalePhotos(files) {
  return Promise.all(files.map(downscalePhoto));
}
