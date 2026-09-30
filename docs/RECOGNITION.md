# Machine recognition (photo → exercise)

Code: `src/services/recognition/` · Screen: `src/screens/ScanScreen.tsx`

## User flow

Train → **📷 Scan machine** → **Take a photo** (or *Choose from photos*) → **What are you using?**
→ 3 suggestions (best guess pre-selected) + **Other…** → **Start** → workout tracking screen.

- *Start* adds the exercise to the workout in progress, or starts a new workout with it (`startExercise` in `data/actions.ts`).
- *Other…* shows the full searchable list. Tapping an exercise there starts it; *Create new exercise* starts the new one.
- If recognition fails, the app goes straight to the manual list. The user is never stuck.
- The photo is saved as a small thumbnail on the exercise (can be switched off per scan).
- Also reachable from *Add exercise* during a workout and from the Exercises tab.

## Today: demo recognizer (`mock.ts`)

No image analysis. It returns 3 plausible suggestions:
1. exercises the user is probably doing now (unfinished ones in the current workout, else the next-up routine), then
2. machine/cable exercises chosen from a fingerprint of the photo bytes (the same photo always gives the same answer).

The screen shows "Demo: these are example suggestions…" whenever `source === 'demo'`.

## Adding real recognition

Everything goes through one interface (`types.ts`):

```ts
interface MachineRecognizer {
  identify(input: { photo: Blob; exercises: Exercise[]; likelyExerciseIds?: string[] }): Promise<{
    suggestions: { exerciseId: string; confidence: number }[]; // best first
    source: 'demo' | 'remote';
  }>;
}
```

**Option A — your own backend (recommended).** Set `VITE_RECOGNITION_URL` at build time and `http.ts` is used automatically:

```
POST <url>   multipart/form-data: photo=<jpeg ≤1024px>, exercises=<JSON array of exercise names>
200 OK       { "candidates": [ { "name": "Lat Pulldown", "confidence": 0.82 }, ... ] }
```

Names are matched to the user's exercises (case-insensitive) and unknown names are dropped.
The backend can call any vision model. **Never call an AI provider directly from the app**: its API key would be public.

**Option B — another implementation** (e.g. an on-device model in a native app): implement `MachineRecognizer` and
return it from `pickRecognizer()` in `index.ts`.

Nothing in the screens needs to change for either option.

## Ideas for later
- Log (photo, suggestions, what the user picked) to measure accuracy and build training data. This needs consent.
- Offer "Create *Hack Squat*?" when the service names a machine the user doesn't have yet.
- Use the saved exercise photos as reference images for matching.
