/**
 * Free and Premium: which features each plan has. The one place that decides; screens ask can(plan, feature).
 *
 * There are no payments yet. Until there are, Premium is a preview the user can switch on for testing
 * (Profile → Plan, stored on the phone as AppData.premiumPreview). When subscriptions exist, planOf() reads the
 * subscription instead (e.g. from the account) and nothing else needs to change.
 *
 * Rule for the muscle map: the body map, muscle activity and basic progress are always free.
 * Premium adds depth: longer history, the reasons behind progress, trends, comparisons and insights.
 * The leaderboard is free for everyone with an account; Premium adds insights only, never a better position.
 */
import type { AppData } from '../types';
import type { MusclePeriod } from './muscles/analysis';

export type Plan = 'free' | 'premium';

export type PremiumFeature = 'long-periods' | 'progress-details' | 'trends' | 'comparisons' | 'insights' | 'leaderboard-insights';

export const PREMIUM_FEATURES: { id: PremiumFeature; title: string; description: string }[] = [
  { id: 'long-periods', title: 'Longer history', description: 'Last 12 weeks and all time on the muscle map' },
  { id: 'progress-details', title: 'Progress details', description: 'What is behind each muscle\'s progress: performance, challenges, mastery, consistency' },
  { id: 'trends', title: 'Training trends', description: 'Week-by-week training per muscle group' },
  { id: 'comparisons', title: 'Comparisons', description: 'Training volume compared with the period before' },
  { id: 'insights', title: 'Personal insights', description: 'Short observations about your training emphasis and progress' },
  // The leaderboard itself is free; Premium only explains it more. Nothing paid changes anyone's position.
  { id: 'leaderboard-insights', title: 'Leaderboard insights', description: 'XP to the next place, your top percentage and best weekly finish' },
];

const PLANS: Record<Plan, PremiumFeature[]> = {
  free: [],
  premium: PREMIUM_FEATURES.map((f) => f.id),
};

/** Periods every plan has; the rest need 'long-periods'. */
export const FREE_PERIODS: MusclePeriod[] = ['workout', 'week', '4w'];

export function planOf(data: Pick<AppData, 'premiumPreview'>): Plan {
  return data.premiumPreview ? 'premium' : 'free';
}

export function can(plan: Plan, feature: PremiumFeature): boolean {
  return PLANS[plan].includes(feature);
}

export function canUsePeriod(plan: Plan, period: MusclePeriod): boolean {
  return FREE_PERIODS.includes(period) || can(plan, 'long-periods');
}
