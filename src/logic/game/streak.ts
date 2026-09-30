/**
 * Weekly workout streak: consecutive weeks (Mon–Sun) with at least `minWorkoutsPerWeek` workouts.
 * Counting weeks (not days) rewards regular training without pushing anyone to train daily:
 * extra workouts in a week don't grow the streak, and the week in progress never breaks it.
 */
import { GAME_CONFIG, type GameConfig } from './config';

/** Week number (Monday-based) of a date, in the user's local time. */
export function weekIndex(date: Date | string): number {
  const d = new Date(date);
  const day = Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86_400_000); // local calendar day
  return Math.floor((day + 3) / 7); // 1970-01-01 was a Thursday
}

export class WeeklyStreak {
  private counts = new Map<number, number>();
  constructor(private config: GameConfig = GAME_CONFIG) {}

  add(date: Date | string): void {
    const w = weekIndex(date);
    this.counts.set(w, (this.counts.get(w) ?? 0) + 1);
  }

  private qualifies(week: number): boolean {
    return (this.counts.get(week) ?? 0) >= this.config.streak.minWorkoutsPerWeek;
  }

  /** Streak ending at the given week (0 if that week doesn't qualify). */
  endingAt(week: number): number {
    let n = 0;
    while (this.qualifies(week - n)) n++;
    return n;
  }

  /** Streak as of `now`: the current week counts if done; if not done yet, last week's streak is still alive. */
  current(now: Date = new Date()): number {
    const week = weekIndex(now);
    return this.qualifies(week) ? this.endingAt(week) : this.endingAt(week - 1);
  }

  /** True when this workout was the one that made its week count (so milestones fire once per week). */
  justQualified(date: Date | string): boolean {
    return (this.counts.get(weekIndex(date)) ?? 0) === this.config.streak.minWorkoutsPerWeek;
  }
}
