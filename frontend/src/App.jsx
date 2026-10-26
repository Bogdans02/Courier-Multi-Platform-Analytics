import { Link, NavLink, Navigate, Route, Routes, useLocation } from 'react-router';
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
import More from './screens/More.jsx';
import { ChartNoAxesColumnIncreasing, Clock, History, House, List } from 'lucide-react';
import { useEffect } from 'react';

const links = [
  { to: '/', label: 'Start', icon: House },
  { to: '/shifts/active', label: 'Zmiana', icon: Clock },
  { to: '/dashboard', label: 'Analiza', icon: ChartNoAxesColumnIncreasing },
  { to: '/history', label: 'Historia', icon: History },
  { to: '/more', label: 'Więcej', icon: List },
];

export default function App() {
  const { session, status, message, login, logout: expireSession, retryRestore } = useSession();

  const location = useLocation();
  useEffect(() => { window.scrollTo(0, 0); }, [location.pathname]);

  // Do not mount routes or redirect until native session restoration/cleanup finishes.
  if (status !== 'ready') {
    return (
      <main className="app-shell auth-shell space-y-3">
        <h1 className="text-2xl font-semibold">CourStat</h1>
        {status === 'restoring' && <p role="status">Odtwarzanie sesji...</p>}
        {status === 'clearing' && <p role="status">Wylogowywanie...</p>}
        {message && <p role="alert" className="text-red-400">{message}</p>}
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
    <div className={`app-shell ${session ? '' : 'auth-shell'}`}>
      <a href="#main-content" className="sr-only focus:not-sr-only">Przejdź do treści</a>
      {!session && <header className="app-header">
        <Link to={session ? '/' : '/login'} className="brand-mark" aria-label="CourStat — start"><ChartNoAxesColumnIncreasing size={22} strokeWidth={1.8} aria-hidden="true" /></Link>
        <p>CourStat</p>
      </header>}
      <main id="main-content" className="page-content">
        <Routes>
          <Route path="/" element={session ? <Home session={session} onSessionExpired={expireSession} /> : <Navigate to="/login" replace />} />
          <Route path="/login" element={session ? <Navigate to="/" replace /> : <Login onLogin={login} />} />
          <Route path="/register" element={session ? <Navigate to="/" replace /> : <Register />} />
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
            ? <Expenses key="list" session={session} onSessionExpired={expireSession} />
            : <Navigate to="/login" replace />} />
          <Route path="/expenses/new" element={session
            ? <Expenses key="new" session={session} onSessionExpired={expireSession} adding />
            : <Navigate to="/login" replace />} />
          <Route path="/more" element={session
            ? <More session={session} onLogout={expireSession} />
            : <Navigate to="/login" replace />} />
          <Route path="*" element={<h1 className="text-2xl font-semibold">Nie znaleziono strony</h1>} />
        </Routes>
      </main>
      {session && <nav className="bottom-nav" aria-label="Nawigacja główna"><div className="bottom-nav-inner">
        {links.map(({ to, label, icon: NavIcon }) => {
          const isMore = to === '/more' && ['/settings', '/expenses', '/expenses/new'].includes(location.pathname);
          const isHistory = to === '/history' && /^\/shifts\/\d+$/.test(location.pathname);
          return <NavLink key={to} to={to} end className={({ isActive }) => `nav-item ${isActive || isMore || isHistory ? 'active' : ''}`}>
            <NavIcon size={22} strokeWidth={1.8} aria-hidden="true" /><span>{label}</span>
          </NavLink>;
        })}
      </div></nav>}
    </div>
  );
}
