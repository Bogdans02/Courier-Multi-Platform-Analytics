import { Link } from 'react-router';
import { ArrowRight, LogOut, Settings, Wallet } from 'lucide-react';

export default function More({ session, onLogout }) {
  return <>
    <div className="page-heading"><h1>Więcej</h1></div>
    <div className="card">
      <div className="min-w-0"><p className="muted text-xs">Zalogowano jako</p><p className="break-words font-medium">{session.user.email}</p></div>
    </div>
    <div className="card menu-list">
      <Link to="/expenses"><Wallet size={22} strokeWidth={1.8} aria-hidden="true" /><span><strong>Koszty</strong></span><ArrowRight size={22} strokeWidth={1.8} aria-hidden="true" /></Link>
      <Link to="/settings"><Settings size={22} strokeWidth={1.8} aria-hidden="true" /><span><strong>Ustawienia</strong><small>Profil i szacowane netto</small></span><ArrowRight size={22} strokeWidth={1.8} aria-hidden="true" /></Link>
    </div>
    <button type="button" className="button-danger w-full" onClick={onLogout}><LogOut size={22} strokeWidth={1.8} aria-hidden="true" />Wyloguj się</button>
  </>;
}
