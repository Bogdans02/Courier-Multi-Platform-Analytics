import { useEffect, useState } from 'react';
import { getHealth } from '../services/api/health.js';
import { getCurrentUser } from '../services/api/auth.js';
import { Link } from 'react-router';
import { getSummary } from '../services/api/analytics.js';
import DashboardSummary from '../components/DashboardSummary.jsx';
import AdvancedAnalytics from '../components/AdvancedAnalytics.jsx';
import { formatRate } from '../utils/netSettings.js';

export default function Dashboard({ session, onSessionExpired }) {
  const [connection, setConnection] = useState({ status: 'loading', message: '' });
  const [account, setAccount] = useState({ status: 'loading', user: null, message: '' });
  const [period, setPeriod] = useState('all');
  const [mode, setMode] = useState('gross');
  const [statistics, setStatistics] = useState({ status: 'loading', summary: null, message: '' });
  const [reload, setReload] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    getSummary(session.token, period, controller.signal, mode)
      .then(({ summary }) => {
        if (!controller.signal.aborted) setStatistics({ status: 'success', summary, message: '' });
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        if (error.status === 401) onSessionExpired();
        else setStatistics({ status: 'error', summary: null, message: error.message });
      });
    return () => controller.abort();
  }, [session.token, period, mode, reload, onSessionExpired]);

  useEffect(() => {
    const controller = new AbortController();

    getHealth(controller.signal)
      .then(() => {
        setConnection({ status: 'success', message: 'Połączenie z backendem działa.' });
      })
      .catch((error) => {
        if (!controller.signal.aborted) {
          setConnection({ status: 'error', message: error.message });
        }
      });

    return () => controller.abort();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    getCurrentUser(session.token, controller.signal)
      .then(({ user }) => setAccount({ status: 'success', user, message: '' }))
      .catch((error) => {
        if (controller.signal.aborted) return;
        if (error.status === 401) onSessionExpired();
        else setAccount({ status: 'error', user: null, message: error.message });
      });
    return () => controller.abort();
  }, [session.token, onSessionExpired]);

  return (
    <>
      <h1 className="text-2xl font-semibold">Dashboard</h1>
      <p><Link to="/shifts/active" className="underline">Rozpocznij lub zakończ zmianę</Link></p>
      <p><Link to="/history" className="underline">Historia zmian</Link></p>
      <p><Link to="/expenses" className="underline">Dodaj lub przeglądaj koszty</Link></p>
      <p><Link to="/settings" className="underline">Ustawienia szacowanego netto</Link></p>
      {account.status === 'loading' && <p role="status">Sprawdzanie sesji...</p>}
      {account.user && <p>Zalogowano jako: <strong>{account.user.email}</strong></p>}
      {account.status === 'error' && <p role="alert" className="text-red-700">{account.message}</p>}
      <label className="block" htmlFor="earnings-mode">Wartości finansowe</label>
      <select id="earnings-mode" value={mode} className="w-full rounded border border-slate-400 bg-white p-3"
        onChange={(event) => {
          setStatistics({ status: 'loading', summary: null, message: '' });
          setMode(event.target.value);
        }}>
        <option value="gross">Brutto</option>
        <option value="estimated_net">Szacowane netto</option>
      </select>
      {mode === 'estimated_net' && <p className="text-sm text-slate-600">
        Szacowane netto korzysta z aktualnie zapisanego profilu dla całego wybranego okresu.
        To uproszczony szacunek, a nie pełne rozliczenie podatkowe.
        {statistics.summary && ` Szacowana stawka potrąceń: ${formatRate(statistics.summary.deductionRate)}.`}
      </p>}
      <label className="block" htmlFor="summary-period">Okres statystyk</label>
      <select id="summary-period" value={period} className="w-full rounded border border-slate-400 bg-white p-3"
        onChange={(event) => {
          setStatistics({ status: 'loading', summary: null, message: '' });
          setPeriod(event.target.value);
        }}>
        <option value="week">Tydzień — ostatnie 7 dni</option>
        <option value="month">Miesiąc — ostatnie 30 dni</option>
        <option value="three_months">3 miesiące — ostatnie 90 dni</option>
        <option value="all">Cały okres</option>
      </select>
      {statistics.status === 'loading' && <p role="status">Wczytywanie statystyk...</p>}
      {statistics.status === 'error' && <div>
        <p role="alert" className="text-red-700">{statistics.message}</p>
        <button type="button" className="py-2 underline" onClick={() => {
          setStatistics({ status: 'loading', summary: null, message: '' });
          setReload((value) => value + 1);
        }}>Spróbuj ponownie</button>
      </div>}
      {statistics.status === 'success' && <DashboardSummary summary={statistics.summary} />}
      <AdvancedAnalytics token={session.token} period={period} mode={mode} onSessionExpired={onSessionExpired} />
      <p>Połączenie z backendem:</p>
      {connection.status === 'loading' && <p role="status">Sprawdzanie połączenia...</p>}
      {connection.status === 'success' && <p role="status">{connection.message}</p>}
      {connection.status === 'error' && (
        <p role="alert" className="text-red-700">{connection.message}</p>
      )}
    </>
  );
}
