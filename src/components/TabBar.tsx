import { NavLink } from 'react-router-dom';

const TABS = [
  { to: '/', icon: '🏋️', label: 'Train' },
  { to: '/history', icon: '📅', label: 'History' },
  { to: '/exercises', icon: '📈', label: 'Exercises' },
  { to: '/profile', icon: '👤', label: 'Profile' },
];

export function TabBar() {
  return (
    <div className="tabbar">
      <nav>
        {TABS.map((t) => (
          <NavLink key={t.to} to={t.to} end={t.to === '/'}>
            <span className="ic" aria-hidden>{t.icon}</span>
            {t.label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
