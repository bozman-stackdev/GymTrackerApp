import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { completeGuide } from '../data/guide';
import { useStore } from '../data/store';
import { GUIDE_STEPS } from '../help/guide';

/**
 * /guide - the short first-time guide (also replayable from Help or Profile). Back / Next / Skip / Finish.
 * The first time, finishing or skipping marks it done so it doesn't come back by itself; a replay changes nothing.
 */
export function GuideScreen() {
  const { data, update } = useStore();
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const firstRun = !!data.guide?.pending;
  const s = GUIDE_STEPS[step];
  const last = step === GUIDE_STEPS.length - 1;

  const leave = (to?: string) => {
    if (firstRun) {
      update((d) => completeGuide(d));
      navigate(to ?? '/', { replace: true });
    } else if (to) navigate(to, { replace: true });
    else navigate(-1);
  };

  return (
    <main className="screen full guide" aria-labelledby="guide-title">
      <header className="header">
        <span className="muted grow" aria-live="polite" data-testid="guide-progress">Step {step + 1} of {GUIDE_STEPS.length}</span>
        <button type="button" className="btn ghost" onClick={() => leave()}>Skip</button>
      </header>

      <div className="guide-body">
        <span className="guide-icon" aria-hidden><Icon name={s.icon} size={44} /></span>
        {/* A new heading per step, focused as it appears: screen readers hear each step. */}
        <h1 id="guide-title" key={step} ref={(el) => el?.focus()} tabIndex={-1}>{s.title}</h1>
        {s.lines.map((l) => <p key={l} className="guide-line">{l}</p>)}
        {step === 1 && <button type="button" className="btn ghost" onClick={() => leave('/profile')}>Set up my profile now</button>}
      </div>

      <div className="guide-dots" aria-hidden>
        {GUIDE_STEPS.map((_, i) => <span key={i} className={`guide-dot${i === step ? ' on' : ''}`} />)}
      </div>
      <div className="row guide-nav">
        <button type="button" className="btn grow" disabled={step === 0} onClick={() => setStep(step - 1)}>
          <Icon name="back" size={20} /> Back
        </button>
        {last ? (
          <button type="button" className="btn primary grow" onClick={() => leave()}>Finish</button>
        ) : (
          <button type="button" className="btn primary grow" onClick={() => setStep(step + 1)}>Next <Icon name="forward" size={20} /></button>
        )}
      </div>
    </main>
  );
}
