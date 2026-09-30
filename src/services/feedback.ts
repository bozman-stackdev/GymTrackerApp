/**
 * "Send feedback" for testers. Goes to an email address if VITE_FEEDBACK_EMAIL is set at build time,
 * otherwise to a new issue on the project's GitHub repo. Only app/device basics are included - never workout data.
 */
import { getUnits } from '../logic/units';

const EMAIL = import.meta.env.VITE_FEEDBACK_EMAIL as string | undefined;
const ISSUES_URL = 'https://github.com/bozman-stackdev/GymTrackerApp/issues/new';

export function feedbackUrl(): string {
  const details = [
    `App version: ${__APP_VERSION__}`,
    `Device: ${navigator.userAgent}`,
    `Screen: ${window.screen.width}×${window.screen.height}`,
    `Installed: ${window.matchMedia?.('(display-mode: standalone)').matches ? 'yes' : 'no'} · Units: ${getUnits()}`,
  ].join('\n');
  const body = `What happened, or what would make the app better?\n\n\n---\n${details}`;
  const subject = 'Gym Tracker feedback';
  return EMAIL
    ? `mailto:${EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
    : `${ISSUES_URL}?title=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
