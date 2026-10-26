import { NavLink, Navigate, Route, Routes } from 'react-router';
import { useSession } from './hooks/useSession.js';
import Home from './screens/Home.jsx';
import Login from './screens/Login.jsx';
import Register from './screens/Register.jsx';
import Dashboard from './screens/Dashboard.jsx';
import ActiveShift from './screens/ActiveShift.jsx';
import ShiftHistory from './screens/ShiftHistory.jsx';
import ShiftDetails from './screens/ShiftDetails.jsx';
import Settings from './screens/Settings.jsx';
import Expenses from './screens/Expenses.jsx';

const links = [
  { to: '/', label: 'Start' },
  { to: '/login', label: 'Logowanie' },
  { to: '/register', label: 'Rejestracja' },
  { to: '/dashboard', label: 'Dashboard' },
  { to: '/shifts/active', label: 'Zmiana robocza' },
  { to: '/history', label: 'Historia' },
  { to: '/settings', label: 'Ustawienia' },
  { to: '/expenses', label: 'Koszty' },
];

export default function App() {
  const { session, status, message, login, logout: expireSession, retryRestore } = useSession();

  // Do not mount routes or redirect until native session restoration/cleanup finishes.
  if (status !== 'ready') {
    return (
      <main className="mx-auto max-w-2xl space-y-3 p-4">
        <h1 className="text-2xl font-semibold">CourStat</h1>
        {status === 'restoring' && <p role="status">Odtwarzanie sesji...</p>}
        {status === 'clearing' && <p role="status">Wylogowywanie...</p>}
        {message && <p role="alert" className="text-red-700">{message}</p>}
        {status === 'restore_error' && <button type="button" className="px-3 py-2 underline" onClick={retryRestore}>Spróbuj ponownie</button>}
        {(status === 'restore_error' || status === 'clear_error') && (
          <button type="button" className="px-3 py-2 underline" onClick={expireSession}>
            {status === 'clear_error' ? 'Ponów wylogowanie' : 'Wyloguj się'}
          </button>
        )}
      </main>
    );
  }

  return (
    <div className="mx-auto max-w-2xl p-4">
      <header className="mb-6 border-b border-slate-300 pb-4">
        <p className="mb-3 font-semibold">CourStat</p>
        <nav aria-label="Nawigacja główna" className="flex flex-wrap gap-2">
          {links.filter(({ to }) => !session || (to !== '/login' && to !== '/register')).map(({ to, label }) => (
            <NavLink
              key={to}
              to={to}
              end
              className={({ isActive }) =>
                `rounded px-3 py-2 underline ${isActive ? 'bg-slate-200' : ''}`
              }
            >
              {label}
            </NavLink>
          ))}
          {session && (
            <button type="button" className="rounded px-3 py-2 underline" onClick={expireSession}>
              Wyloguj się
            </button>
          )}
        </nav>
      </header>
      <main className="space-y-3">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/login" element={session ? <Navigate to="/dashboard" replace /> : <Login onLogin={login} />} />
          <Route path="/register" element={session ? <Navigate to="/dashboard" replace /> : <Register />} />
          <Route path="/dashboard" element={session
            ? <Dashboard session={session} onSessionExpired={expireSession} />
            : <Navigate to="/login" replace />} />
          <Route path="/shifts/active" element={session
            ? <ActiveShift session={session} onSessionExpired={expireSession} />
            : <Navigate to="/login" replace />} />
          <Route path="/history" element={session
            ? <ShiftHistory session={session} onSessionExpired={expireSession} />
            : <Navigate to="/login" replace />} />
          <Route path="/shifts/:id" element={session
            ? <ShiftDetails session={session} onSessionExpired={expireSession} />
            : <Navigate to="/login" replace />} />
          <Route path="/settings" element={session
            ? <Settings session={session} onSessionExpired={expireSession} />
            : <Navigate to="/login" replace />} />
          <Route path="/expenses" element={session
            ? <Expenses session={session} onSessionExpired={expireSession} />
            : <Navigate to="/login" replace />} />
          <Route path="*" element={<h1 className="text-2xl font-semibold">Nie znaleziono strony</h1>} />
        </Routes>
      </main>
    </div>
  );
}
