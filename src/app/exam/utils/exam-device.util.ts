/** True when the exam should be blocked (phones/tablets, not laptop/desktop). */
export function isMobileExamDevice(): boolean {
  if (typeof navigator === 'undefined' || typeof window === 'undefined') return false;

  const ua = navigator.userAgent || '';
  const mobileUa = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile/i.test(ua);
  const coarsePointer = window.matchMedia('(pointer: coarse)').matches;
  const narrowViewport = window.innerWidth < 1024;

  return mobileUa || (coarsePointer && narrowViewport);
}
