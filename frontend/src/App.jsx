import { useState } from 'react';
import { NavLink, Navigate, Route, Routes } from 'react-router';
import Home from './screens/Home.jsx';
import Login from './screens/Login.jsx';
import Register from './screens/Register.jsx';
import Dashboard from './screens/Dashboard.jsx';

const links = [
  { to: '/', label: 'Start' },
  { to: '/login', label: 'Logowanie' },
  { to: '/register', label: 'Rejestracja' },
  { to: '/dashboard', label: 'Dashboard' },
];

export default function App() {
  // Development session only. Android token storage remains OPEN-003.
  const [session, setSession] = useState(null);

  return (
    <div className="mx-auto max-w-2xl p-4">
      <header className="mb-6 border-b border-slate-300 pb-4">
        <p className="mb-3 font-semibold">Courier Multi-Platform Analytics</p>
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
            <button type="button" className="rounded px-3 py-2 underline" onClick={() => setSession(null)}>
              Wyloguj się
            </button>
          )}
        </nav>
      </header>
      <main className="space-y-3">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/login" element={session ? <Navigate to="/dashboard" replace /> : <Login onLogin={setSession} />} />
          <Route path="/register" element={session ? <Navigate to="/dashboard" replace /> : <Register />} />
          <Route path="/dashboard" element={session
            ? <Dashboard session={session} onSessionExpired={() => setSession(null)} />
            : <Navigate to="/login" replace />} />
          <Route path="*" element={<h1 className="text-2xl font-semibold">Nie znaleziono strony</h1>} />
        </Routes>
      </main>
    </div>
  );
}
