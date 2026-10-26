import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { getSettings, saveSettings } from '../services/api/settings.js';
import { settingsPayload, estimatedRate, formatRate } from '../utils/netSettings.js';

export default function Settings({ session, onSessionExpired }) {
  const [status, setStatus] = useState('loading');
  const [profiles, setProfiles] = useState([]);
  const [netProfile, setNetProfile] = useState('');
  const [ppkOptOut, setPpkOptOut] = useState(false);
  const [percent, setPercent] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [pending, setPending] = useState(false);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    getSettings(session.token, controller.signal).then(({ settings, profiles }) => {
      if (controller.signal.aborted) return;
      setProfiles(profiles);
      setNetProfile(settings.netProfile ?? '');
      setPpkOptOut(settings.ppkOptOut ?? false);
      setPercent(settings.deductionRate === null ? '' : String(Number((Number(settings.deductionRate) * 100).toFixed(3))));
      setStatus('success');
    }).catch((error) => {
      if (controller.signal.aborted) return;
      if (error.status === 401) onSessionExpired();
      else { setError(error.message); setStatus('error'); }
    });
    return () => controller.abort();
  }, [session.token, reload, onSessionExpired]);

  async function save(event) {
    event.preventDefault();
    setError('');
    setMessage('');
    let body;
    try { body = settingsPayload(profiles, netProfile, ppkOptOut, percent); }
    catch (error) { setError(error.message); return; }
    setPending(true);
    try {
      const { settings } = await saveSettings(session.token, body);
      setMessage(`Ustawienia zapisane. Szacowana stawka potrąceń: ${formatRate(settings.deductionRate)}.`);
    } catch (error) {
      if (error.status === 401) onSessionExpired();
      else setError(error.message);
    } finally { setPending(false); }
  }

  const profile = profiles.find(({ value }) => value === netProfile);
  const rate = estimatedRate(profiles, netProfile, ppkOptOut, percent);
  return <>
    <div className="page-heading"><h1>Ustawienia</h1></div>
    <p className="muted text-sm">Szacowane netto to przybliżenie, nie rozliczenie podatkowe. Stawki profili są orientacyjne.</p>
    {status === 'loading' && <p role="status">Wczytywanie ustawień...</p>}
    {error && <p role="alert" className="text-red-400">{error}</p>}
    {status === 'error' && <button type="button" className="py-2 underline" onClick={() => {
      setError(''); setStatus('loading'); setReload((value) => value + 1);
    }}>Spróbuj ponownie</button>}
    {status === 'success' && <form onSubmit={save} className="card space-y-3">
      <fieldset disabled={pending} className="space-y-3 disabled:opacity-60" onChange={() => setMessage('')}>
        <legend className="font-semibold">Szacowane netto</legend>
        <label htmlFor="net-profile" className="block">Profil szacowanego netto</label>
        <select id="net-profile" value={netProfile} className="w-full rounded border border-slate-600 bg-slate-900 p-3"
          onChange={(event) => { setNetProfile(event.target.value); setError(''); }}>
          <option value="">Wybierz profil</option>
          {profiles.map(({ value, label }) => <option value={value} key={value}>{label}</option>)}
        </select>
        {profile?.ppkDeductionRate && <label className="flex items-center gap-3 py-2">
          <input type="checkbox" checked={ppkOptOut} onChange={(event) => setPpkOptOut(event.target.checked)} />
          Rezygnuję z PPK
        </label>}
        {netProfile === 'custom' && <>
          <label htmlFor="deduction-percent" className="block">Szacowana stawka potrąceń (%)</label>
          <input id="deduction-percent" inputMode="decimal" value={percent}
            onChange={(event) => { setPercent(event.target.value); setError(''); }}
            className="w-full rounded border border-slate-600 bg-slate-900 p-3" aria-describedby="custom-rate-help" />
          <p id="custom-rate-help" className="text-sm">0–100%, maks. 3 miejsca po przecinku. Stawka końcowa, bez automatycznego doliczania PPK.</p>
        </>}
        <p>Szacowana stawka potrąceń: <strong>{rate === null ? 'Uzupełnij profil i stawkę' : formatRate(rate)}</strong></p>
        <button type="submit" className="rounded button-primary">
          {pending ? 'Zapisywanie...' : 'Zapisz ustawienia'}
        </button>
      </fieldset>
    </form>}
    {message && <p role="status">{message}</p>}
    <p><Link to="/dashboard" className="underline">Przejdź do statystyk</Link></p>
    <p><Link to="/more" className="text-link">Wróć do Więcej</Link></p>
  </>;
}
