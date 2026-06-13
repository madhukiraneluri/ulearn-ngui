const BLOCKED_EXTENSIONS = new Set(['heic', 'heif', 'heics', 'heifs']);
const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

export function isSupportedBlogImage(file: File): boolean {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  if (BLOCKED_EXTENSIONS.has(ext)) return false;
  if (file.type && !ALLOWED_MIME.has(file.type) && file.type !== '') return false;
  return true;
}

export function unsupportedImageMessage(): string {
  return 'Please upload JPG, PNG, or WebP images. HEIC/HEIF (iPhone photos) are not supported in browsers.';
}

/** Resize and convert to JPEG so uploads preview and display reliably in all browsers. */
export function prepareBlogImage(file: File, maxDim = 1400): Promise<File> {
  if (!isSupportedBlogImage(file)) {
    return Promise.reject(new Error(unsupportedImageMessage()));
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(maxDim / img.width, maxDim / img.height, 1);
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Could not process image'));
          return;
        }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        canvas.toBlob(
          (blob) => {
            if (!blob) {
              reject(new Error('Could not convert image'));
              return;
            }
            const base = file.name.replace(/\.[^.]+$/, '') || 'image';
            resolve(new File([blob], `${base}.jpg`, { type: 'image/jpeg' }));
          },
          'image/jpeg',
          0.88
        );
      };
      img.onerror = () => reject(new Error('Could not load image. Try JPG or PNG.'));
      img.src = reader.result as string;
    };
    reader.onerror = () => reject(new Error('Could not read image file'));
    reader.readAsDataURL(file);
  });
}
