/** First-time guide and first-use tips: pure state changes on AppData.guide (see help/). */
import type { AppData } from '../types';

/** New data from the welcome screen: the guide shows once. */
export const withGuidePending = (data: AppData): AppData => ({ ...data, guide: { pending: true } });

export const guidePending = (data: AppData): boolean => !!data.guide?.pending;

/** Finished or skipped: never shown on its own again (replay from Help). Dismissed tips are kept. */
export function completeGuide(data: AppData, now = new Date()): AppData {
  const { pending: _p, ...rest } = data.guide ?? {};
  return { ...data, guide: { ...rest, doneAt: now.toISOString() } };
}

/** Tips are only for people who started with the guide (not long-time users), and each only until dismissed. */
export const tipActive = (data: AppData, id: string): boolean => !!data.guide && !data.guide.pending && !(data.guide.tips ?? []).includes(id);

export function dismissTip(data: AppData, id: string): AppData {
  if (!data.guide || data.guide.tips?.includes(id)) return data;
  return { ...data, guide: { ...data.guide, tips: [...(data.guide.tips ?? []), id] } };
}
