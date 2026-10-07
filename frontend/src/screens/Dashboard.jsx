import { useEffect, useState } from 'react';
import { getHealth } from '../services/api/health.js';

export default function Dashboard() {
  const [connection, setConnection] = useState({ status: 'loading', message: '' });

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

  return (
    <>
      <h1 className="text-2xl font-semibold">Dashboard</h1>
      <p>Połączenie z backendem:</p>
      {connection.status === 'loading' && <p role="status">Sprawdzanie połączenia...</p>}
      {connection.status === 'success' && <p role="status">{connection.message}</p>}
      {connection.status === 'error' && (
        <p role="alert" className="text-red-700">{connection.message}</p>
      )}
    </>
  );
}
