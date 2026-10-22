import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/**
 * A bottom sheet: slides up over the screen, closes with Close, Escape or a tap outside. Focus moves to Close when it
 * opens (keyboard and screen-reader users land inside it). Same look as the set editor.
 */
export function Sheet({ title, onClose, children, testId }: { title: string; onClose: () => void; children: ReactNode; testId?: string }) {
  const first = useRef<HTMLButtonElement>(null);
  const close = useRef(onClose);
  useEffect(() => { close.current = onClose; });
  useEffect(() => {
    first.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close.current();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  // Rendered at the end of <body>, so it's above everything (a sheet opened from the sticky header would otherwise
  // stay under the tab bar).
  return createPortal(
    <div className="sheet-layer">
      <button type="button" className="sheet-backdrop" aria-label="Close" tabIndex={-1} onClick={onClose} />
      <div className="sheet sheet-scroll" role="dialog" aria-modal="true" aria-label={title} data-testid={testId}>
        <div className="row between">
          <strong className="sheet-title">{title}</strong>
          <button ref={first} className="btn ghost" onClick={onClose}>Close</button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}
