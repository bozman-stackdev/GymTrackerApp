import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ExercisePicker } from '../components/ExercisePicker';
import { Screen } from '../components/Screen';
import { saveExercise, startExercise } from '../data/actions';
import { useStore } from '../data/store';
import { likelyExerciseIds } from '../logic/history';
import { toThumbnail } from '../services/image';
import { recognizer, type RecognitionResult } from '../services/recognition';
import type { Exercise } from '../types';

type Step = 'capture' | 'analysing' | 'choose' | 'other';

/**
 * "Take a photo" → "What are you using?" → pick → Start → tracking.
 * Recognition is behind services/recognition, so this screen doesn't care whether it's the demo or a real AI service.
 */
export function ScanScreen() {
  const { data, update } = useStore();
  const navigate = useNavigate();
  const camera = useRef<HTMLInputElement>(null);
  const library = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<Step>('capture');
  const [photo, setPhoto] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [result, setResult] = useState<RecognitionResult | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [savePhoto, setSavePhoto] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);

  const onPhoto = async (file: File | undefined) => {
    if (!file) return;
    setPhoto(file);
    setPreviewUrl(URL.createObjectURL(file));
    setFailed(false);
    setStep('analysing');
    try {
      const res = await recognizer.identify({ photo: file, exercises: data.exercises, likelyExerciseIds: likelyExerciseIds(data) });
      setResult(res);
      setSelectedId(res.suggestions[0]?.exerciseId ?? null);
      setStep(res.suggestions.length ? 'choose' : 'other');
    } catch (err) {
      console.error('Recognition failed', err);
      setFailed(true);
      setStep('other'); // still let the user pick by hand
    }
  };

  const start = async (exercise: Exercise) => {
    let thumb: string | undefined;
    if (savePhoto && photo) {
      try { thumb = await toThumbnail(photo); } catch { /* start anyway, without the photo */ }
    }
    update((d) => startExercise(thumb ? saveExercise(d, { ...exercise, photo: thumb }) : d, exercise.id));
    navigate('/workout', { replace: true });
  };

  const byId = (id: string) => data.exercises.find((e) => e.id === id);
  const options = (result?.suggestions ?? []).map((s) => byId(s.exerciseId)).filter((e): e is Exercise => !!e);
  const selected = selectedId ? byId(selectedId) : undefined;
  const retake = () => camera.current?.click();

  return (
    <Screen title={step === 'choose' ? 'What are you using?' : step === 'other' ? 'Pick the exercise' : 'Scan a machine'} back full>
      <input ref={camera} type="file" accept="image/*" capture="environment" hidden data-testid="photo-input" onChange={(e) => onPhoto(e.target.files?.[0])} />
      <input ref={library} type="file" accept="image/*" hidden data-testid="library-input" onChange={(e) => onPhoto(e.target.files?.[0])} />

      {step === 'capture' && (
        <>
          <button className="btn primary huge scan-shutter" onClick={() => camera.current?.click()}>📷 Take a photo</button>
          <button className="btn block" onClick={() => library.current?.click()}>Choose from photos</button>
          <p className="muted center small">Point at the machine you're about to use.</p>
        </>
      )}

      {previewUrl && step !== 'capture' && (
        <img className={`scan-photo${step === 'analysing' ? ' big' : ''}`} src={previewUrl} alt="Your photo" />
      )}

      {step === 'analysing' && <p className="center" aria-live="polite">Looking at your photo…</p>}

      {step === 'choose' && (
        <>
          <div className="options" role="radiogroup" aria-label="Suggested exercises">
            {options.map((e) => (
              <button key={e.id} role="radio" aria-checked={e.id === selectedId} className={`option${e.id === selectedId ? ' on' : ''}`} onClick={() => setSelectedId(e.id)}>
                {e.photo && <img className="thumb" src={e.photo} alt="" />}
                <span className="grow">{e.name}</span>
                <span className="option-check" aria-hidden>{e.id === selectedId ? '✓' : ''}</span>
              </button>
            ))}
            <button className="option other" onClick={() => setStep('other')}>Other…</button>
          </div>
          {result?.source === 'demo' && (
            <p className="muted small center demo-note">Demo: these are example suggestions. Real photo recognition isn't switched on yet.</p>
          )}
          <button className="btn primary huge" disabled={!selected} onClick={() => selected && start(selected)}>
            Start{selected ? ` ${selected.name}` : ''}
          </button>
          <div className="row">
            <label className="row small muted grow">
              <input type="checkbox" checked={savePhoto} onChange={(e) => setSavePhoto(e.target.checked)} style={{ width: 22, height: 22 }} />
              Save photo
            </label>
            <button className="btn ghost" onClick={retake}>Retake</button>
          </div>
        </>
      )}

      {step === 'other' && (
        <>
          {failed && <p className="warn center">Couldn't analyse the photo. Pick the exercise below.</p>}
          {options.length > 0 && <button className="btn block ghost" onClick={() => setStep('choose')}>← Back to suggestions</button>}
          <ExercisePicker exercises={data.exercises} onPick={start} />
          <Link to="/exercises/new?start=1" className="btn block">+ Create new exercise</Link>
        </>
      )}
    </Screen>
  );
}
