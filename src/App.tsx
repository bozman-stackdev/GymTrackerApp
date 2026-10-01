import { useEffect } from 'react';
import { HashRouter, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { TabBar } from './components/TabBar';
import { ErrorBoundary } from './components/ErrorBoundary';
import { StoreProvider, useAppState, useStore } from './data/store';
import { AccountProvider } from './data/account';
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
import { HomeScreen } from './screens/HomeScreen';
import { ProfileScreen } from './screens/ProfileScreen';
import { RoutineScreen } from './screens/RoutineScreen';
import { ScanScreen } from './screens/ScanScreen';
import { WorkoutScreen } from './screens/workout/WorkoutScreen';

// HashRouter works on any static host (and inside a native wrapper) without server config.
export function App() {
  return (
    <ErrorBoundary>
      <StoreProvider>
        <AccountProvider>
          <HashRouter>
            <div className="app">
              <Shell />
            </div>
          </HashRouter>
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
      {saveError && <div className="alert save-alert" role="alert">⚠️ Not saved: {saveError}</div>}
      <ResumeWorkoutOnLaunch />
      <Routes>
        <Route path="/" element={<HomeScreen />} />
        <Route path="/workout" element={<WorkoutScreen />} />
        <Route path="/workout/add" element={<AddExerciseScreen />} />
        <Route path="/scan" element={<ScanScreen />} />
        <Route path="/history" element={<HistoryScreen />} />
        <Route path="/history/:id" element={<SessionScreen />} />
        <Route path="/exercises" element={<ExercisesScreen />} />
        <Route path="/exercises/new" element={<ExerciseFormScreen />} />
        <Route path="/exercises/:id" element={<ExerciseScreen />} />
        <Route path="/exercises/:id/edit" element={<ExerciseFormScreen />} />
        <Route path="/routines/new" element={<RoutineScreen />} />
        <Route path="/routines/:id" element={<RoutineScreen />} />
        <Route path="/gym/new" element={<EquipmentFormScreen />} />
        <Route path="/gym/:id" element={<EquipmentFormScreen />} />
        <Route path="/profile" element={<ProfileScreen />} />
        <Route path="/account" element={<AccountScreen />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <TabBarUnlessTraining />
    </>
  );
}

/** The workout screens are distraction-free: no tab bar. */
function TabBarUnlessTraining() {
  const { pathname } = useLocation();
  return pathname.startsWith('/workout') || pathname === '/scan' ? null : <TabBar />;
}

/** Opening the app during a workout goes straight back to it - no hunting for "resume". */
function ResumeWorkoutOnLaunch() {
  const { data } = useStore();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  useEffect(() => {
    if (data.activeWorkout && pathname === '/') navigate('/workout', { replace: true });
    // Only on launch: afterwards the user may deliberately visit other tabs mid-workout.
  }, []);
  return null;
}
