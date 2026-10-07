/** Leaderboard pieces: the line under the level bar, rank changes, and the rows. Calm, and never bigger than your own progress. */
import { Link } from 'react-router-dom';
import { useBoard, useLeaderboard } from '../data/leaderboard';
import { rankChange, type LeaderboardResult, type LeaderboardRow } from '../logic/leaderboard/rank';
import { Icon } from './Icon';

const MEDALS = ['🥇', '🥈', '🥉'];
const ORDINAL = ['1st', '2nd', '3rd'];

/** "↑ 3", "↓ 2", "→" since yesterday. Nothing when there's nothing to compare yet. */
export function RankChange({ me }: { me: LeaderboardResult['me'] }) {
  const change = rankChange(me);
  if (change === null) return null;
  const [cls, text, label] = change > 0 ? ['up', `↑ ${change}`, `Up ${change} ${change === 1 ? 'place' : 'places'} since yesterday`]
    : change < 0 ? ['down', `↓ ${-change}`, `Down ${-change} ${change === -1 ? 'place' : 'places'} since yesterday`]
    : ['same', '→', 'No change since yesterday'];
  return <span className={`rank-change ${cls}`} data-testid="rank-change" aria-label={label} title={label}>{text}</span>;
}

/**
 * Right under the level bar: your weekly position, or the way to join. Taps through to the full board.
 * Shows nothing in a version of the app without accounts.
 */
export function LeaderboardLine() {
  const lb = useLeaderboard();
  const board = useBoard('week');
  if (!lb.available) return null;
  if (lb.state === 'signed-out') {
    return (
      <Link to="/account?mode=signup" className="lb-line" data-testid="lb-line">
        <Icon name="trophy" size={18} /> <span className="grow">Sign up to compete on the leaderboard</span> <Icon name="forward" size={18} />
      </Link>
    );
  }
  const me = board?.result.me;
  const content =
    lb.state === 'loading' || (lb.profile?.leaderboardVisible && !board) ? <span className="grow muted">Leaderboard</span>
    : !lb.profile?.leaderboardVisible ? <span className="grow">Join the leaderboard</span>
    : me?.rank == null ? <span className="grow">Leaderboard: your next workout puts you on it</span>
    : <span className="grow">You're <strong data-testid="lb-rank">#{me.rank}</strong> this week <RankChange me={me} /></span>;
  return (
    <Link to="/leaderboard" className="lb-line" data-testid="lb-line">
      <Icon name="trophy" size={18} /> {content} <Icon name="forward" size={18} />
    </Link>
  );
}

/** "#24" for the Home progress line, when known. */
export function useWeeklyRank(): number | null {
  const lb = useLeaderboard();
  const board = useBoard('week');
  return lb.available && lb.state === 'ready' && lb.profile?.leaderboardVisible ? board?.result.me.rank ?? null : null;
}

function Row({ row, me }: { row: LeaderboardRow; me?: LeaderboardResult['me'] }) {
  const medal = row.rank <= 3 ? MEDALS[row.rank - 1] : null;
  return (
    <li className={`lb-row${row.me ? ' lb-me' : ''}`} data-testid={row.me ? 'lb-me' : 'lb-row'}>
      <span className="lb-rank">
        {medal ? <><span aria-hidden>{medal}</span><span className="sr-only">{ORDINAL[row.rank - 1]}</span></> : `#${row.rank}`}
      </span>
      <span className="lb-name">{row.me ? 'You' : row.name}</span>
      <span className="lb-points">{row.points.toLocaleString()} XP</span>
      {row.me && me && <RankChange me={me} />}
    </li>
  );
}

/** The leaders, then (if you're further down) a gap and the people either side of you. */
export function LeaderboardRows({ result }: { result: LeaderboardResult }) {
  const { top, around, me } = result;
  const gap = around.length > 0 && around[0].rank > (top.at(-1)?.rank ?? 0) + 1;
  return (
    <ol className="lb-list" data-testid="lb-list">
      {top.map((r, i) => <Row key={`t${i}`} row={r} me={me} />)}
      {gap && <li className="lb-gap" aria-hidden>…</li>}
      {around.map((r, i) => <Row key={`a${i}`} row={r} me={me} />)}
    </ol>
  );
}
