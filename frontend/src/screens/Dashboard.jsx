import { useEffect, useState } from 'react';
import { getHealth } from '../services/api/health.js';
import { getCurrentUser } from '../services/api/auth.js';
import { Link } from 'react-router';

export default function Dashboard({ session, onSessionExpired }) {
  const [connection, setConnection] = useState({ status: 'loading', message: '' });
  const [account, setAccount] = useState({ status: 'loading', user: null, message: '' });

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
      {account.status === 'loading' && <p role="status">Sprawdzanie sesji...</p>}
      {account.user && <p>Zalogowano jako: <strong>{account.user.email}</strong></p>}
      {account.status === 'error' && <p role="alert" className="text-red-700">{account.message}</p>}
      <p>Połączenie z backendem:</p>
      {connection.status === 'loading' && <p role="status">Sprawdzanie połączenia...</p>}
      {connection.status === 'success' && <p role="status">{connection.message}</p>}
      {connection.status === 'error' && (
        <p role="alert" className="text-red-700">{connection.message}</p>
      )}
    </>
  );
}
