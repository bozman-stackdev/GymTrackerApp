import { useEffect, useRef } from 'react';
import { HashRouter, Navigate, Route, Routes, useLocation, useNavigate, useNavigationType } from 'react-router-dom';
import { TabBar } from './components/TabBar';
import { ErrorBoundary } from './components/ErrorBoundary';
import { StoreProvider, useAppState, useStore } from './data/store';
import { guidePending } from './data/guide';
import { AccountProvider } from './data/account';
import { LeaderboardProvider } from './data/leaderboard';
import { LeaderboardScreen } from './screens/LeaderboardScreen';
import { GuideScreen } from './screens/GuideScreen';
import { HelpScreen } from './screens/HelpScreen';
import { AccountScreen } from './screens/AccountScreen';
import { WelcomeScreen } from './screens/WelcomeScreen';
import { setUnits } from './logic/units';
import { EquipmentFormScreen } from './screens/gym/EquipmentFormScreen';
import { AddExerciseScreen } from './screens/AddExerciseScreen';
import { ExerciseFormScreen } from './screens/exercises/ExerciseFormScreen';
import { ExerciseScreen } from './screens/exercises/ExerciseScreen';
import { ExercisesScreen } from './screens/exercises/ExercisesScreen';
import { HistoryScreen } from './screens/history/HistoryScreen';
import { SessionScreen } from './screens/history/SessionScreen';
import { MissedWorkoutScreen } from './screens/history/MissedWorkoutScreen';
import { HomeScreen } from './screens/HomeScreen';
import { ProfileScreen } from './screens/ProfileScreen';
import { RoutineScreen } from './screens/RoutineScreen';
import { ScanScreen } from './screens/ScanScreen';
import { WorkoutScreen } from './screens/workout/WorkoutScreen';
import { MusclesScreen } from './screens/muscles/MusclesScreen';
import { Icon } from './components/Icon';

// HashRouter works on any static host (and inside a native wrapper) without server config.
export function App() {
  return (
    <ErrorBoundary>
      <StoreProvider>
        <AccountProvider>
          <LeaderboardProvider>
            <HashRouter>
              <div className="app">
                <Shell />
              </div>
            </HashRouter>
          </LeaderboardProvider>
        </AccountProvider>
      </StoreProvider>
    </ErrorBoundary>
  );
}

function Shell() {
  const { data, saveError } = useAppState();
  if (!data) return <WelcomeScreen />;
  setUnits(data.profile.units ?? 'kg'); // display units for every formatter, before any screen renders
  return (
    <>
      {saveError && <div className="alert save-alert with-icon" role="alert"><Icon name="alert" size={18} /> Not saved: {saveError}</div>}
      <ResumeWorkoutOnLaunch />
      <GuideOnFirstRun />
      <ScrollToTopOnNewScreen />
      <Routes>
        <Route path="/" element={<HomeScreen />} />
        <Route path="/workout" element={<WorkoutScreen />} />
        <Route path="/workout/add" element={<AddExerciseScreen />} />
        <Route path="/scan" element={<ScanScreen />} />
        <Route path="/history" element={<HistoryScreen />} />
        <Route path="/history/add" element={<MissedWorkoutScreen />} />
        <Route path="/history/:id" element={<SessionScreen />} />
        <Route path="/exercises" element={<ExercisesScreen />} />
        <Route path="/exercises/new" element={<ExerciseFormScreen />} />
        <Route path="/exercises/:id" element={<ExerciseScreen />} />
        <Route path="/exercises/:id/edit" element={<ExerciseFormScreen />} />
        <Route path="/routines/new" element={<RoutineScreen />} />
        <Route path="/routines/:id" element={<RoutineScreen />} />
        <Route path="/gym/new" element={<EquipmentFormScreen />} />
        <Route path="/gym/:id" element={<EquipmentFormScreen />} />
        <Route path="/muscles" element={<MusclesScreen />} />
        <Route path="/profile" element={<ProfileScreen />} />
        <Route path="/account" element={<AccountScreen />} />
        <Route path="/leaderboard" element={<LeaderboardScreen />} />
        <Route path="/help" element={<HelpScreen />} />
        <Route path="/guide" element={<GuideScreen />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <TabBarUnlessTraining />
    </>
  );
}

/** A new screen opens at the top (not at the previous screen's scroll position); Back keeps where you were. */
function ScrollToTopOnNewScreen() {
  const { pathname } = useLocation();
  const type = useNavigationType();
  const shown = useRef(pathname);
  useEffect(() => {
    if (pathname !== shown.current && type !== 'POP') window.scrollTo(0, 0);
    shown.current = pathname;
  }, [pathname, type]);
  return null;
}

/** The workout screens are distraction-free: no tab bar. */
function TabBarUnlessTraining() {
  const { pathname } = useLocation();
  return pathname.startsWith('/workout') || pathname === '/scan' || pathname === '/guide' ? null : <TabBar />;
}

/** A new user sees the short guide first (once; skippable). Never during a workout. */
function GuideOnFirstRun() {
  const { data } = useStore();
  const { pathname } = useLocation();
  if (!guidePending(data) || pathname === '/guide' || pathname.startsWith('/workout') || data.activeWorkout) return null;
  return <Navigate to="/guide" replace />;
}

/** Opening the app during a workout goes straight back to it - no hunting for "resume". */
function ResumeWorkoutOnLaunch() {
  const { data } = useStore();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  // Only on launch: afterwards the user may deliberately visit other tabs mid-workout.
  const checked = useRef(false);
  useEffect(() => {
    if (checked.current) return;
    checked.current = true;
    if (data.activeWorkout && pathname === '/') navigate('/workout', { replace: true });
  }, [data.activeWorkout, pathname, navigate]);
  return null;
}
