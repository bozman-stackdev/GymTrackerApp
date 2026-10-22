/**
 * "Add to Home Screen" guide support: which phone this is, whether the app already runs installed, whether the guide
 * was seen, and the browser's own install prompt (Chrome/Android, when the browser offers one).
 * The app itself is a PWA already (manifest + service worker in vite.config.ts); this only helps people install it.
 */
import { useSyncExternalStore } from 'react';

export type InstallPlatform = 'ios' | 'ios-other' | 'android' | 'other';

/** iPhone/iPad in Safari, iPhone/iPad in another browser (Chrome, Firefox, Edge...), Android, or anything else. */
export function detectPlatform(ua: string, maxTouchPoints = 0): InstallPlatform {
  const ios = /iPhone|iPad|iPod/i.test(ua) || (/Macintosh/i.test(ua) && maxTouchPoints > 1); // iPadOS asks for desktop sites
  if (ios) return /CriOS|FxiOS|EdgiOS|OPiOS|GSA\/|DuckDuckGo|YaBrowser/i.test(ua) ? 'ios-other' : 'ios';
  if (/Android/i.test(ua)) return 'android';
  return 'other';
}

export const currentPlatform = (): InstallPlatform =>
  typeof navigator === 'undefined' ? 'other' : detectPlatform(navigator.userAgent, navigator.maxTouchPoints ?? 0);

/** Opened from the home screen already (no point in showing how to install). */
export function isInstalled(): boolean {
  if (typeof window === 'undefined') return false;
  return !!window.matchMedia?.('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

const SEEN_KEY = 'gymtracker:install-guide-seen';

export function installGuideSeen(): boolean {
  try { return localStorage.getItem(SEEN_KEY) !== null; } catch { return true; } // storage blocked: don't nag
}
export function markInstallGuideSeen(): void {
  try { localStorage.setItem(SEEN_KEY, new Date().toISOString()); } catch { /* storage blocked */ }
}

/** Show the guide by itself? Only on a first visit, and never inside the installed app. */
export const shouldAutoShowInstallGuide = (): boolean => !installGuideSeen() && !isInstalled();

// ---------- The browser's own install prompt (Chrome, Edge, Samsung Internet on Android) ----------

interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferred: InstallPromptEvent | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

/** Call once at startup: keeps the browser's install offer so the guide can show a real "Install app" button. */
export function listenForInstallPrompt(): void {
  if (typeof window === 'undefined') return;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); // no automatic mini-infobar; the guide offers it instead
    deferred = e as InstallPromptEvent;
    notify();
  });
  window.addEventListener('appinstalled', () => { deferred = null; notify(); });
}

/** The browser's install prompt if it offered one (else null), and a function to show it. */
export function useInstallPrompt(): { available: boolean; install: () => Promise<boolean> } {
  const available = useSyncExternalStore(
    (l) => { listeners.add(l); return () => listeners.delete(l); },
    () => deferred !== null,
    () => false,
  );
  return {
    available,
    install: async () => {
      const e = deferred;
      if (!e) return false;
      await e.prompt();
      const { outcome } = await e.userChoice;
      deferred = null;
      notify();
      return outcome === 'accepted';
    },
  };
}
