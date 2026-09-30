import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';

/** Standard page wrapper: optional back arrow, title, and a slot for a right-hand action. */
export function Screen({ title, back, action, full, children }: {
  title: string;
  back?: boolean;
  action?: ReactNode;
  /** No space reserved for the tab bar (used on the workout screen). */
  full?: boolean;
  children: ReactNode;
}) {
  const navigate = useNavigate();
  return (
    <main className={`screen${full ? ' full' : ''}`}>
      <header className="header">
        {back && (
          <button className="icon-btn" aria-label="Back" onClick={() => navigate(-1)}>
            ←
          </button>
        )}
        <h1>{title}</h1>
        {action}
      </header>
      {children}
    </main>
  );
}
