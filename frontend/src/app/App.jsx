import { NavLink, Route, Routes } from 'react-router';
import Home from '../screens/Home.jsx';
import Login from '../screens/Login.jsx';
import Register from '../screens/Register.jsx';
import Dashboard from '../screens/Dashboard.jsx';

const links = [
  { to: '/', label: 'Start' },
  { to: '/login', label: 'Logowanie' },
  { to: '/register', label: 'Rejestracja' },
  { to: '/dashboard', label: 'Dashboard' },
];

export default function App() {
  return (
    <div className="mx-auto max-w-2xl p-4">
      <header className="mb-6 border-b border-slate-300 pb-4">
        <p className="mb-3 font-semibold">Courier Multi-Platform Analytics</p>
        <nav aria-label="Nawigacja główna" className="flex flex-wrap gap-2">
          {links.map(({ to, label }) => (
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
        </nav>
      </header>
      <main className="space-y-3">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="*" element={<h1 className="text-2xl font-semibold">Nie znaleziono strony</h1>} />
        </Routes>
      </main>
    </div>
  );
}
