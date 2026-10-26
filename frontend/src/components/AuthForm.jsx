import { useState } from 'react';
import { validateCredentials } from '../utils/authValidation.js';

export default function AuthForm({ mode, onSubmit }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const isRegister = mode === 'register';

  async function handleSubmit(event) {
    event.preventDefault();
    const validationError = validateCredentials(email, password);
    setError(validationError);
    if (validationError) return;
    setPending(true);
    try {
      await onSubmit({ email: email.trim().toLowerCase(), password });
    } catch (error) {
      setError(error.message);
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4" aria-busy={pending}>
      <fieldset disabled={pending} className="space-y-4">
        <div>
          <label htmlFor="email" className="mb-1 block font-medium">E-mail</label>
          <input id="email" name="email" type="email" autoComplete="email" required maxLength={254}
            value={email} onChange={(event) => setEmail(event.target.value)}
            className="w-full rounded border border-slate-600 bg-slate-900 px-3 py-3" />
        </div>
        <div>
          <label htmlFor="password" className="mb-1 block font-medium">Hasło</label>
          <input id="password" name="password" type="password" required minLength={8} maxLength={72}
            autoComplete={isRegister ? 'new-password' : 'current-password'}
            aria-describedby={isRegister ? 'password-hint' : undefined}
            value={password} onChange={(event) => setPassword(event.target.value)}
            className="w-full rounded border border-slate-600 bg-slate-900 px-3 py-3" />
          {isRegister && <p id="password-hint" className="mt-1 text-sm text-slate-400">Minimum 8 znaków.</p>}
        </div>
        <button type="submit" className="w-full rounded button-primary disabled:opacity-60">
          {pending ? 'Proszę czekać...' : isRegister ? 'Utwórz konto' : 'Zaloguj się'}
        </button>
      </fieldset>
      {error && <p role="alert" className="text-red-400">{error}</p>}
    </form>
  );
}
