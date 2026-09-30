/** The recognition contract. Every recognizer (demo, remote, on-device) implements MachineRecognizer. */
import type { Exercise } from '../../types';

export interface RecognitionInput {
  photo: Blob;
  /** The user's exercise list - results are always mapped onto these. */
  exercises: Exercise[];
  /** Exercises the user is likely doing right now (e.g. unfinished ones in today's workout). A hint, not a filter. */
  likelyExerciseIds?: string[];
}

export interface MachineSuggestion {
  exerciseId: string;
  /** 0-1, best first. */
  confidence: number;
}

export interface RecognitionResult {
  suggestions: MachineSuggestion[];
  /** 'demo' results are examples, not real image analysis - the UI says so. */
  source: 'demo' | 'remote';
}

export interface MachineRecognizer {
  identify(input: RecognitionInput): Promise<RecognitionResult>;
}

/** How many suggestions the "What are you using?" screen shows (plus "Other"). */
export const MAX_SUGGESTIONS = 3;
