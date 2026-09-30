# My gym (personal equipment library)

Code: `src/logic/equipment.ts` (queries), `src/data/actions.ts` (save/delete/select), `src/screens/gym/`, `src/components/EquipmentCard.tsx`

## Data (`GymEquipment` in `src/types.ts`)

| Field | Notes |
|---|---|
| `name` | e.g. "Life Fitness Leg Press" (required; unique per gym) |
| `exerciseIds` | exercises done on it; a cable station can have several (at least one) |
| `type` | machine / cable / barbell / dumbbell / bodyweight |
| `gym` | location, e.g. "Anytime Fitness Leeds" (suggested from ones already used) |
| `brand`, `model` | optional |
| `settings` | e.g. "Seat 5, feet mid-platform". Shown during the workout |
| `notes` | optional |
| `photo` | **reserved, not captured** (photos aren't stored, D23) |
| `source` | `manual` today; `scan` for machines added from a photo later |

Each exercise in a workout records `equipmentId`, so **"last used" and "previous session" are derived from history**, per machine.
A new workout picks the machine used last time for that exercise (`preferredEquipmentId`).

## In the app

- **My Gym tab**: machines grouped by gym (settings, last weight, previous session), then the exercise library.
- **Workout**: one line under the exercise, e.g. "📍 Life Fitness Leg Press · Seat 5". A picker appears only with 2+ machines for that exercise.
- **Exercise page**: its machines, plus "Add equipment for this exercise".
- **Scan**: the recognizer receives the library; suggestions can point at *your* machine (`equipmentId`) and start on it.
  With no match: "Save machine to My gym".

## Future image recognition

`RecognitionInput.equipment` lets a service match a photo to the user's own machines. `MachineSuggestion.equipmentId` and
`RecognitionResult.detected` (brand/model read from the machine) are ready for "recognise → add to My gym" (`source: 'scan'`).

## Known limitation

Progression is per **exercise**, not per machine. If you do leg press on two very different machines, their weights mix in
one journey. Per-machine progression is a natural next step once people train at several gyms.
