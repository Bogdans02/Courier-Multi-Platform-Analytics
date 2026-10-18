import { useCallback, useEffect, useRef, useState } from 'react';
import { sessionService } from '../services/session.js';

export function useSession() {
  const [state, setState] = useState({
    session: null, status: sessionService.native ? 'restoring' : 'ready', message: '',
  });
  const [retry, setRetry] = useState(0);
  const clearing = useRef(false);

  useEffect(() => {
    if (!sessionService.native) return;
    const controller = new AbortController();
    sessionService.restore(controller.signal)
      .then((session) => {
        if (!controller.signal.aborted) setState({ session, status: 'ready', message: '' });
      })
      .catch((error) => {
        if (!controller.signal.aborted) setState({ session: null, status: 'restore_error', message: error.message });
      });
    return () => controller.abort();
  }, [retry]);

  const login = useCallback(async (session) => {
    await sessionService.save(session);
    setState({ session, status: 'ready', message: '' });
  }, []);

  // Several dashboard requests can receive 401 together. Clear storage once.
  const logout = useCallback(async () => {
    if (clearing.current) return;
    clearing.current = true;
    setState({ session: null, status: 'clearing', message: '' });
    try {
      await sessionService.clear();
      setState({ session: null, status: 'ready', message: '' });
    } catch (error) {
      setState({ session: null, status: 'clear_error', message: error.message });
    } finally {
      clearing.current = false;
    }
  }, []);

  function retryRestore() {
    setState({ session: null, status: 'restoring', message: '' });
    setRetry((value) => value + 1);
  }

  return { ...state, login, logout, retryRestore };
}
