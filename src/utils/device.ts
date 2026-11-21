/**
 * Device and browser capability detection utilities
 */

export function isMobileDevice(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
  return (
    /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
    (navigator.maxTouchPoints > 1 && /Macintosh/i.test(navigator.userAgent)) ||
    (typeof window.matchMedia === 'function' && window.matchMedia('(max-width: 768px)').matches)
  );
}

export function supportsDisplayMediaAudio(): boolean {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getDisplayMedia) {
    return false;
  }
  // iOS Safari / iPadOS WebKit does not support audio capture in getDisplayMedia
  if (
    /iPhone|iPad|iPod/i.test(navigator.userAgent) ||
    (navigator.maxTouchPoints > 1 && /Macintosh/i.test(navigator.userAgent))
  ) {
    return false;
  }
  // Mobile devices generally sandbox system audio capture from other native apps
  return !isMobileDevice();
}
