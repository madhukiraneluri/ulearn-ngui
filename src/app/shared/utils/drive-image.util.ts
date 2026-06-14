/** Convert a Google Drive share link to a hotlinkable thumbnail URL. */
export function driveThumbnailUrl(driveUrl: string, size = 256): string {
  const id = driveUrl.match(/\/d\/([^/]+)/)?.[1];
  if (!id) return driveUrl;
  return `https://drive.google.com/thumbnail?id=${id}&sz=w${size}`;
}
