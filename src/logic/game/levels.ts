import { GAME_CONFIG, type GameConfig } from './config';

export interface LevelInfo {
  level: number;
  xp: number;
  /** XP at which the current level started and the next one starts. */
  levelStartXp: number;
  nextLevelXp: number;
  /** 0–1 progress towards the next level. */
  progress: number;
}

/** XP needed to reach a level (1-based). */
export function xpForLevel(level: number, config: GameConfig = GAME_CONFIG): number {
  const { levels, xpPerLevelAfterList } = config;
  if (level <= levels.length) return levels[level - 1];
  return levels.at(-1)! + (level - levels.length) * xpPerLevelAfterList;
}

export function levelFor(xp: number, config: GameConfig = GAME_CONFIG): LevelInfo {
  let level = 1;
  while (xp >= xpForLevel(level + 1, config)) level++;
  const levelStartXp = xpForLevel(level, config);
  const nextLevelXp = xpForLevel(level + 1, config);
  return { level, xp, levelStartXp, nextLevelXp, progress: (xp - levelStartXp) / (nextLevelXp - levelStartXp) };
}
