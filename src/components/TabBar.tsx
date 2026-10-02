import { NavLink } from 'react-router-dom';
import { Icon, type IconName } from './Icon';

const TABS: { to: string; icon: IconName; label: string }[] = [
  { to: '/', icon: 'dumbbell', label: 'Train' },
  { to: '/history', icon: 'calendar', label: 'History' },
  { to: '/muscles', icon: 'body', label: 'Muscles' },
  { to: '/exercises', icon: 'pin', label: 'My Gym' },
  { to: '/profile', icon: 'user', label: 'Profile' },
];

export function TabBar() {
  return (
    <div className="tabbar">
      <nav aria-label="Main">
        {TABS.map((t) => (
          <NavLink key={t.to} to={t.to} end={t.to === '/'}>
            <Icon name={t.icon} size={24} className="ic" />
            {t.label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
