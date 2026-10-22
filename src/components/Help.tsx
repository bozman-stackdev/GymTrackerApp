/**
 * Contextual help: a "?" that opens a short article in a bottom sheet (tap - no hover, no long-press), and one-time
 * tips. Nothing here opens by itself except a first-use tip, which is a small inline card, never an overlay.
 * Content: help/content.ts.
 */
import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { dismissTip, tipActive } from '../data/guide';
import { useStore } from '../data/store';
import { helpArticle, type HelpArticle } from '../help/content';
import { Icon } from './Icon';
import { Sheet } from './Sheet';

/** What it does / How to use it / What happens. */
export function ArticleBody({ article }: { article: HelpArticle }) {
  return (
    <dl className="help-article">
      <dt>What it does</dt><dd>{article.what}</dd>
      <dt>How to use it</dt><dd>{article.how}</dd>
      <dt>What happens</dt><dd>{article.result}</dd>
    </dl>
  );
}

export function HelpSheet({ topic, onClose }: { topic: string; onClose: () => void }) {
  const article = helpArticle(topic);
  if (!article) return null;
  return (
    <Sheet title={article.title} onClose={onClose} testId="help-sheet">
      <ArticleBody article={article} />
      <Link to={`/help?topic=${article.id}`} className="btn ghost block" onClick={onClose}>Browse all help</Link>
    </Sheet>
  );
}

/** The "?" in a screen's header: help for that screen. */
export function HelpButton({ topic }: { topic: string }) {
  const [open, setOpen] = useState(false);
  const title = helpArticle(topic)?.title ?? 'Help';
  return (
    <>
      <button type="button" className="icon-btn help-btn" aria-label={`Help: ${title}`} aria-haspopup="dialog" onClick={() => setOpen(true)}>
        <Icon name="help" size={22} />
      </button>
      {open && <HelpSheet topic={topic} onClose={() => setOpen(false)} />}
    </>
  );
}

/** A small inline "?" beside a feature. */
export function HelpTip({ topic }: { topic: string }) {
  const [open, setOpen] = useState(false);
  const title = helpArticle(topic)?.title ?? 'Help';
  return (
    <>
      <button type="button" className="help-tip" aria-label={`Help: ${title}`} aria-haspopup="dialog" data-testid={`help-tip-${topic}`}
        onClick={(e) => { e.stopPropagation(); setOpen(true); }}>
        <Icon name="help" size={17} />
      </button>
      {open && <HelpSheet topic={topic} onClose={() => setOpen(false)} />}
    </>
  );
}

/**
 * A one-time tip, shown inline until "Got it". Only for people who started with the guide, and never again once
 * dismissed. The same explanation is in Help (`topic`).
 */
export function FirstTip({ id, topic, children }: { id: string; topic: string; children: ReactNode }) {
  const { data, update } = useStore();
  const [more, setMore] = useState(false);
  if (!tipActive(data, id)) return null;
  return (
    <div className="first-tip" role="note" data-testid={`tip-${id}`}>
      <Icon name="info" size={18} className="accent" />
      <div className="grow small">{children}</div>
      <div className="first-tip-actions">
        <button type="button" className="btn ghost small" onClick={() => setMore(true)}>More</button>
        <button type="button" className="btn small" onClick={() => update((d) => dismissTip(d, id))}>Got it</button>
      </div>
      {more && <HelpSheet topic={topic} onClose={() => setMore(false)} />}
    </div>
  );
}
