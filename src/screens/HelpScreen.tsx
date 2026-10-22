import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArticleBody } from '../components/Help';
import { Icon } from '../components/Icon';
import { Screen } from '../components/Screen';
import { HELP_CATEGORIES, searchHelp } from '../help/content';

/** /help (?topic=<id>) - searchable help topics by category, and the guide again. Back returns to where you were. */
export function HelpScreen() {
  const [params] = useSearchParams();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState<string | null>(params.get('topic'));
  const results = searchHelp(query);
  const searching = query.trim() !== '';

  return (
    <Screen title="Help" back>
      <Link to="/guide" className="btn block"><Icon name="play" size={18} /> Replay the guide</Link>
      <input className="input" type="search" placeholder="Search help" aria-label="Search help" value={query} onChange={(e) => setQuery(e.target.value)} />
      {results.length === 0 && <p className="muted center flush" role="status">Nothing found. Try another word, like "timer" or "XP".</p>}
      {/* Browsing: by category. Searching: one list, best matches first. */}
      {(searching ? [{ category: 'Results', articles: results }] : HELP_CATEGORIES.map((c) => ({ category: c, articles: results.filter((a) => a.category === c) })))
        .filter((g) => g.articles.length > 0)
        .map(({ category, articles }) => {
        return (
          <section key={category} className="stack tight" aria-label={category}>
            <h2 className="flush">{category}</h2>
            <div className="list">
              {articles.map((a) => {
                const isOpen = open === a.id || (searching && results.length === 1);
                return (
                  <div key={a.id} className={`help-item${isOpen ? ' open' : ''}`} data-testid="help-item">
                    <button type="button" className="list-item" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : a.id)}>
                      <span className="grow title">{a.title}</span>
                      <Icon name={isOpen ? 'chevronUp' : 'chevronDown'} className="muted" />
                    </button>
                    {isOpen && <div className="help-item-body"><ArticleBody article={a} /></div>}
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}
    </Screen>
  );
}
