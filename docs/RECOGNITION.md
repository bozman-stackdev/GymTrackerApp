# Machine recognition (photo → exercise)

Code: `src/services/recognition/` · Screen: `src/screens/ScanScreen.tsx`

## User flow

Train → **📷 Scan machine** → **Take a photo** (or *Choose from photos*) → **What are you using?**
→ 3 suggestions (best guess pre-selected) + **Other…** → **Start** → workout tracking screen.

- *Start* adds the exercise to the workout in progress, or starts a new workout with it (`startExercise` in `data/actions.ts`).
- *Other…* shows the full searchable list. Tapping an exercise there starts it; *Create new exercise* starts the new one.
- If recognition fails, the app goes straight to the manual list. The user is never stuck.
- **The photo is not stored.** It's only used to suggest exercises, lives in memory on the scan screen, and is gone once you tap Start or leave.
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
- Log only which suggestion the user picked (not the photo) to measure accuracy.
- Offer "Create *Hack Squat*?" when the service names a machine the user doesn't have yet.

## Proposal: switching on real recognition (not built yet)

Day-1 testing showed the demo gives the same 3 suggestions for every photo (it never looks at the image). The Scan
screen now says so before the photo is taken. Real recognition needs no app changes beyond setting
`VITE_RECOGNITION_URL`: everything else is a small server function.

**How it would work**
1. The app (already) shrinks the photo to 1024 px and sends it with the user's exercise names and My Gym machine names.
2. A tiny server function (e.g. a Cloudflare Worker, free tier) holds the AI provider's API key, which must never be
   in the web app. It sends the photo and the list to Claude's vision API and asks for structured output: the 3
   best-matching names *from the list*, a confidence for each, and the brand/model if a label is readable.
3. The function answers in the existing `http.ts` contract; the app matches names and shows the 3 suggestions.

**Cost per photo (estimate, check with ~20 real photos):** about 1,000 image tokens plus ~600 text tokens in and
~300–600 out. Claude Opus 5.5 (the most accurate): roughly 1–2p per photo. Claude Sonnet 5.5: roughly 0.5–1p.
Claude Haiku 4.5: roughly 0.3p. At 10 scans a week per tester, 10 testers on Opus 5.5 is about £5–8 a month.

**Accuracy:** brand plates and machine shapes are well within what vision models read. Passing the user's own
machines (My Gym) lets it say "your Technogym Chest Press" rather than a generic name. Unusual or plate-loaded
machines may still need *Other…*, which always stays one tap away. We'd measure on real gym photos before choosing the model.

**Privacy:** the photo goes to the function and to the AI provider once and is not stored by the app (D23). The
provider's data-retention terms go in the privacy note; gym photos may contain people.

**Cost and abuse control:** a monthly spending cap on the API key, a per-device rate limit in the function, and
photos above a size limit rejected.

**What you'd need to do:** create an Anthropic API account and key, and a Cloudflare account (both have web sign-up).
I'd write the function, its tests, the setup steps, and a small accuracy test set from your own machine photos.
