import { useEffect } from 'react';

/**
 * Keeps the screen on while mounted (e.g. during a workout), so the phone doesn't lock between sets.
 * Silently does nothing in browsers without the Screen Wake Lock API.
 */
export function useWakeLock(): void {
  useEffect(() => {
    if (!('wakeLock' in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    let cancelled = false;

    const acquire = async () => {
      if (document.visibilityState !== 'visible') return;
      try {
        lock = await navigator.wakeLock.request('screen');
        if (cancelled) lock.release();
      } catch {
        // Not allowed right now (e.g. battery saver). Not important enough to bother the user.
      }
    };

    // The browser drops the lock whenever the page is hidden, so take it again on return.
    document.addEventListener('visibilitychange', acquire);
    acquire();
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', acquire);
      lock?.release().catch(() => {});
    };
  }, []);
}
