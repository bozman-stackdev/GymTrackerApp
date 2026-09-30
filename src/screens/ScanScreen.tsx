import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ExerciseRow } from '../components/ExercisePicker';
import { Screen } from '../components/Screen';
import { addExerciseToWorkout, saveExercise } from '../data/actions';
import { useStore } from '../data/store';
import { machineRecognizer, toThumbnail, type MachineSuggestion } from '../services/machineRecognition';
import type { Exercise } from '../types';

type Step = 'capture' | 'analysing' | 'choose';

/**
 * Photo -> "which machine is this?" flow.
 * Uses the phone's camera via a file input (works in every mobile browser, no permissions code needed).
 */
export function ScanScreen() {
  const { data, update } = useStore();
  const navigate = useNavigate();
  const input = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<Step>('capture');
  const [photo, setPhoto] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<MachineSuggestion[]>([]);
  const [savePhoto, setSavePhoto] = useState(true);

  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);

  const onPhoto = async (file: File | undefined) => {
    if (!file) return;
    setPhoto(file);
    setPreviewUrl(URL.createObjectURL(file));
    setStep('analysing');
    try {
      setSuggestions(await machineRecognizer.identify(file, data.exercises));
    } catch (err) {
      console.error('Recognition failed', err);
      setSuggestions([]);
    }
    setStep('choose');
  };

  const choose = async (exercise: Exercise) => {
    let thumb: string | undefined;
    if (savePhoto && photo) {
      try { thumb = await toThumbnail(photo); } catch { /* keep going without the photo */ }
    }
    update((d) => {
      let next = thumb ? saveExercise(d, { ...exercise, photo: thumb }) : d;
      if (next.activeWorkout) next = addExerciseToWorkout(next, exercise.id);
      return next;
    });
    navigate(data.activeWorkout ? '/workout' : `/exercises/${exercise.id}`, { replace: true });
  };

  const byId = (id: string) => data.exercises.find((e) => e.id === id);
  const best = suggestions.filter((s) => s.confidence >= 0.5);
  const rest = suggestions.filter((s) => s.confidence < 0.5);

  return (
    <Screen title="Identify machine" back full>
      <input ref={input} type="file" accept="image/*" capture="environment" hidden data-testid="photo-input"
        onChange={(e) => onPhoto(e.target.files?.[0])} />

      {previewUrl ? (
        <img className="photo-preview" src={previewUrl} alt="Your photo of the machine" />
      ) : (
        <button className="btn primary huge" style={{ minHeight: 200 }} onClick={() => input.current?.click()}>
          📷 Take photo
        </button>
      )}

      {step === 'capture' && (
        <p className="muted center small">Take a photo of the machine and we'll help you find the exercise.</p>
      )}

      {step === 'analysing' && <p className="center" aria-live="polite">Looking at your photo…</p>}

      {step === 'choose' && (
        <>
          {best.length > 0 && (
            <>
              <h2>Best match</h2>
              <div className="list">
                {best.map((s) => byId(s.exerciseId) && (
                  <ExerciseRow key={s.exerciseId} exercise={byId(s.exerciseId)!} detail={`${Math.round(s.confidence * 100)}% match`} onClick={() => choose(byId(s.exerciseId)!)} />
                ))}
              </div>
            </>
          )}
          <h2>Which machine is this?</h2>
          <label className="row small muted">
            <input type="checkbox" checked={savePhoto} onChange={(e) => setSavePhoto(e.target.checked)} style={{ width: 22, height: 22 }} />
            Save photo with the exercise
          </label>
          <div className="list">
            {rest.map((s) => byId(s.exerciseId) && (
              <ExerciseRow key={s.exerciseId} exercise={byId(s.exerciseId)!} onClick={() => choose(byId(s.exerciseId)!)} />
            ))}
          </div>
          <Link to={data.activeWorkout ? '/exercises/new?from=workout' : '/exercises/new'} className="btn block">Not listed? Create exercise</Link>
          <button className="btn block ghost" onClick={() => input.current?.click()}>Retake photo</button>
        </>
      )}
    </Screen>
  );
}
