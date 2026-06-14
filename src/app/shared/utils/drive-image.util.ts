/** Convert a Google Drive share link to a hotlinkable thumbnail URL. */
export function driveThumbnailUrl(driveUrl: string, size = 256): string {
  const id = driveUrl.match(/\/d\/([^/]+)/)?.[1];
  if (!id) return driveUrl;
  return `https://drive.google.com/thumbnail?id=${id}&sz=w${size}`;
}

/** Use for hero/banner images — supports Drive links or direct URLs. */
export function resolvePublicImageUrl(url: string, driveSize = 800): string {
  const trimmed = url.trim();
  if (!trimmed) return '';
  if (trimmed.includes('drive.google.com')) {
    return driveThumbnailUrl(trimmed, driveSize);
  }
  return trimmed;
}

export const DEFAULT_HOME_HERO_IMAGE = 'assets/images/students learning.png';
