/**
 * "Take your workouts with you": how to add the app to the home screen, for iPhone/iPad (Safari) and Android (Chrome).
 * Shown once on a first visit (welcome screen) and any time from Help or Profile. On iOS it can only be done by hand;
 * on Android the browser's own "Install app" prompt is offered when (and only when) the browser makes it available.
 */
import { useState, type ReactNode } from 'react';
import { currentPlatform, isInstalled, markInstallGuideSeen, useInstallPrompt, type InstallPlatform } from '../help/install';
import { Icon } from './Icon';
import { Sheet } from './Sheet';

type Tab = 'ios' | 'android';

/** Safari's Share icon: a square with an arrow pointing up. */
const ShareIcon = ({ size = 20 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M12 3v12" /><path d="m8 7 4-4 4 4" /><path d="M7 10H5.5A1.5 1.5 0 0 0 4 11.5v8A1.5 1.5 0 0 0 5.5 21h13a1.5 1.5 0 0 0 1.5-1.5v-8a1.5 1.5 0 0 0-1.5-1.5H17" />
  </svg>
);
/** "Add to Home Screen": a rounded square with a plus. */
const AddSquareIcon = ({ size = 20 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden>
    <rect x="3.5" y="3.5" width="17" height="17" rx="4" /><path d="M12 8v8" /><path d="M8 12h8" />
  </svg>
);
/** Chrome's menu: three vertical dots. */
const MenuDots = ({ size = 20 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
    <circle cx="12" cy="5" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="12" cy="19" r="2" />
  </svg>
);
/** Install: a phone with an arrow down into it. */
const InstallIcon = ({ size = 20 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <rect x="6" y="2.5" width="12" height="19" rx="2.5" /><path d="M12 7v7" /><path d="m9 11 3 3 3-3" />
  </svg>
);

function Step({ n, title, children, picture }: { n: number; title: ReactNode; children?: ReactNode; picture?: ReactNode }) {
  return (
    <li className="install-step">
      <span className="install-step-n" aria-hidden>{n}</span>
      <div className="grow">
        <div className="install-step-title">{title}</div>
        {children && <div className="muted small">{children}</div>}
        {picture && <div className="install-picture" aria-hidden>{picture}</div>}
      </div>
    </li>
  );
}

/** A mock menu row, like the one to look for in the browser. */
const MenuRow = ({ icon, label }: { icon: ReactNode; label: string }) => (
  <span className="install-menu-row">{label}<span className="install-menu-icon">{icon}</span></span>
);

function IosSteps({ otherBrowser }: { otherBrowser: boolean }) {
  return (
    <>
      {otherBrowser && (
        <p className="install-note small flush" data-testid="install-ios-other">
          You're in another browser. The steps there may be different - Safari is the recommended way to add the app.
        </p>
      )}
      <ol className="install-steps" data-testid="install-ios">
        <Step n={1} title="Open this page in Safari" />
        <Step n={2} title={<>Tap the Share button <span className="install-inline"><ShareIcon size={18} /></span></>}
          picture={<span className="install-toolbar"><span className="install-toolbar-btn"><ShareIcon size={22} /></span></span>}>
          At the bottom of the screen on iPhone, at the top on iPad.
        </Step>
        <Step n={3} title={<>Choose <strong>Add to Home Screen</strong></>} picture={<MenuRow icon={<AddSquareIcon size={20} />} label="Add to Home Screen" />}>
          Not in the list? Scroll down the menu, or tap Edit Actions to find it.
        </Step>
        <Step n={4} title={<>Tap <strong>Add</strong></>}>The app appears on your home screen.</Step>
      </ol>
      <p className="muted small flush">iPhone and iPad can't add apps from websites automatically - these few taps are needed once.</p>
    </>
  );
}

function AndroidSteps() {
  const { available, install } = useInstallPrompt();
  const [result, setResult] = useState<'done' | 'dismissed' | null>(null);
  return (
    <>
      {available && (
        <div className="stack tight">
          <button type="button" className="btn primary block" onClick={() => void install().then((ok) => setResult(ok ? 'done' : 'dismissed'))}>
            <InstallIcon size={20} /> Install app
          </button>
          <p className="muted small flush center">Your browser can install it straight away - or follow the steps below.</p>
        </div>
      )}
      {result === 'done' && <p className="small flush" role="status">Installed - look for Gym Tracker on your home screen.</p>}
      <ol className="install-steps" data-testid="install-android">
        <Step n={1} title="Open this page in Chrome" />
        <Step n={2} title={<>Tap the menu <span className="install-inline"><MenuDots size={18} /></span></>}
          picture={<span className="install-toolbar right"><span className="install-toolbar-btn"><MenuDots size={22} /></span></span>}>
          The three dots at the top right.
        </Step>
        <Step n={3} title={<>Choose <strong>Install app</strong> or <strong>Add to Home screen</strong></>}
          picture={<MenuRow icon={<InstallIcon size={20} />} label="Install app" />}>
          Chrome shows one of the two, depending on your phone. Both put the app on your home screen.
        </Step>
        <Step n={4} title="Confirm">Tap Install (or Add) in the message that appears.</Step>
      </ol>
      <p className="muted small flush">In another browser the menu may look different; look for Install or Add to Home screen.</p>
    </>
  );
}

/** The guide's content (used in the sheet). */
export function InstallGuideContent({ platform = currentPlatform() }: { platform?: InstallPlatform }) {
  const [tab, setTab] = useState<Tab>(platform === 'android' ? 'android' : 'ios');
  if (isInstalled()) {
    return <p className="flush with-icon" data-testid="install-installed"><Icon name="check" size={18} className="accent" /> You're already using the installed app.</p>;
  }
  return (
    <div className="stack" data-testid="install-guide">
      <p className="flush">Add Gym Tracker to your home screen: it opens full-screen like a normal app, one tap away - and it works offline at the gym.</p>
      <div className="seg" role="tablist" aria-label="Your phone">
        {([['ios', 'iPhone / iPad'], ['android', 'Android']] as const).map(([t, label]) => (
          <button key={t} type="button" role="tab" aria-selected={tab === t} className={`seg-btn${tab === t ? ' on' : ''}`} onClick={() => setTab(t)}>{label}</button>
        ))}
      </div>
      {tab === 'ios' ? <IosSteps otherBrowser={platform === 'ios-other'} /> : <AndroidSteps />}
    </div>
  );
}

/** The guide in a bottom sheet. Any way of closing it counts as seen, so it doesn't come back by itself. */
export function InstallGuideSheet({ onClose }: { onClose: () => void }) {
  const close = () => { markInstallGuideSeen(); onClose(); };
  return (
    <Sheet title="Take your workouts with you" onClose={close} testId="install-sheet">
      <InstallGuideContent />
      <div className="row">
        <button type="button" className="btn ghost grow" onClick={close}>Maybe later</button>
        <button type="button" className="btn primary grow" onClick={close}>Got it</button>
      </div>
    </Sheet>
  );
}

/** A button that opens the guide (Help, Profile). */
export function InstallGuideButton({ className = 'btn block' }: { className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)}><InstallIcon size={18} /> Add to Home Screen</button>
      {open && <InstallGuideSheet onClose={() => setOpen(false)} />}
    </>
  );
}
