import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { getSettings, saveSettings } from '../services/api/settings.js';
import BackLink from '../components/BackLink.jsx';
import { settingsPayload, transportPayload, dailyGoalPayload, estimatedRate, formatRate } from '../utils/netSettings.js';

export default function Settings({ session, onSessionExpired }) {
  const [status, setStatus] = useState('loading');
  const [profiles, setProfiles] = useState([]);
  const [transportTypes, setTransportTypes] = useState([]);
  const [netProfile, setNetProfile] = useState('');
  const [ppkOptOut, setPpkOptOut] = useState(false);
  const [percent, setPercent] = useState('');
  const [transportType, setTransportType] = useState('');
  const [fuelPer100km, setFuelPer100km] = useState('');
  const [fuelPricePerL, setFuelPricePerL] = useState('');
  const [dailyGoal, setDailyGoal] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [pending, setPending] = useState(false);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    getSettings(session.token, controller.signal).then(({ settings, profiles, transportTypes }) => {
      if (controller.signal.aborted) return;
      setProfiles(profiles);
      setTransportTypes(transportTypes);
      setNetProfile(settings.netProfile ?? '');
      setPpkOptOut(settings.ppkOptOut ?? false);
      setPercent(settings.deductionRate === null ? '' : String(Number((Number(settings.deductionRate) * 100).toFixed(3))));
      setTransportType(settings.transportType ?? '');
      setFuelPer100km(settings.fuelPer100km == null ? '' : String(Number(settings.fuelPer100km)));
      setFuelPricePerL(settings.fuelPricePerL == null ? '' : String(Number(settings.fuelPricePerL)));
      setDailyGoal(settings.dailyGoal == null ? '' : String(Number(settings.dailyGoal)));
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
    try {
      body = { ...settingsPayload(profiles, netProfile, ppkOptOut, percent),
        ...transportPayload(transportTypes, transportType, fuelPer100km, fuelPricePerL),
        ...dailyGoalPayload(dailyGoal) };
    }
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
  const transport = transportTypes.find(({ value }) => value === transportType);
  const usesFuel = transport?.fuel;
  return <>
    <BackLink to="/more">Więcej</BackLink>
    <div className="page-heading"><h1>Ustawienia</h1></div>
    <p className="muted text-sm">Szacowane netto to przybliżenie, nie rozliczenie podatkowe. Stawki profili są orientacyjne.</p>
    {status === 'loading' && <p role="status">Wczytywanie ustawień...</p>}
    {error && <p role="alert" className="text-red-400">{error}</p>}
    {status === 'error' && <button type="button" className="button-secondary mt-2" onClick={() => {
      setError(''); setStatus('loading'); setReload((value) => value + 1);
    }}>Spróbuj ponownie</button>}
    {status === 'success' && <form onSubmit={save} className="card space-y-3">
      <fieldset disabled={pending} className="space-y-3 disabled:opacity-60" onChange={() => setMessage('')}>
        <legend className="font-semibold">Szacowane netto</legend>
        <label htmlFor="net-profile" className="block">Profil szacowanego netto</label>
        <select id="net-profile" value={netProfile} className="form-input"
          onChange={(event) => { setNetProfile(event.target.value); setError(''); }}>
          <option value="">Wybierz profil</option>
          {profiles.map(({ value, label }) => <option value={value} key={value}>{label}</option>)}
        </select>
        {profile?.ppkDeductionRate && <label className="flex min-h-11 items-center gap-3 py-2">
          <input type="checkbox" checked={ppkOptOut} onChange={(event) => setPpkOptOut(event.target.checked)} />
          Rezygnuję z PPK
        </label>}
        {netProfile === 'custom' && <>
          <label htmlFor="deduction-percent" className="block">Szacowana stawka potrąceń (%)</label>
          <input id="deduction-percent" inputMode="decimal" value={percent}
            onChange={(event) => { setPercent(event.target.value); setError(''); }}
            className="form-input" aria-describedby="custom-rate-help" />
          <p id="custom-rate-help" className="text-sm">0–100%, maks. 3 miejsca po przecinku. Stawka końcowa, bez automatycznego doliczania PPK.</p>
        </>}
        <p>Szacowana stawka potrąceń: <strong>{rate === null ? 'Uzupełnij profil i stawkę' : formatRate(rate)}</strong></p>
      </fieldset>
      <fieldset disabled={pending} className="space-y-3 disabled:opacity-60" onChange={() => setMessage('')}>
        <legend className="font-semibold">Transport i paliwo</legend>
        <p className="muted text-sm">Służy do policzenia kosztu paliwa zmiany: km × spalanie/100 × cena. Rower i pieszo nie mają kosztu paliwa.</p>
        <label htmlFor="transport-type" className="block">Środek transportu</label>
        <select id="transport-type" value={transportType} className="form-input"
          onChange={(event) => { setTransportType(event.target.value); setError(''); }}>
          <option value="">Nie podano</option>
          {transportTypes.map(({ value, label }) => <option value={value} key={value}>{label}</option>)}
        </select>
        {usesFuel && <>
          <label htmlFor="fuel-per-100km" className="block">Spalanie (l/100 km)</label>
          <input id="fuel-per-100km" inputMode="decimal" value={fuelPer100km}
            onChange={(event) => { setFuelPer100km(event.target.value); setError(''); }} className="form-input" />
          <label htmlFor="fuel-price" className="block">Cena paliwa (zł/l)</label>
          <input id="fuel-price" inputMode="decimal" value={fuelPricePerL}
            onChange={(event) => { setFuelPricePerL(event.target.value); setError(''); }} className="form-input" />
        </>}
      </fieldset>
      <fieldset disabled={pending} className="space-y-3 disabled:opacity-60" onChange={() => setMessage('')}>
        <legend className="font-semibold">Cel dzienny</legend>
        <p className="muted text-sm">Dzienny cel zarobku w zł. Postęp zobaczysz na ekranie „Dziś”. Zostaw puste, aby nie pokazywać celu.</p>
        <label htmlFor="daily-goal" className="block">Cel dzienny (zł)</label>
        <input id="daily-goal" inputMode="decimal" type="number" min="0" step="0.01" value={dailyGoal}
          onChange={(event) => { setDailyGoal(event.target.value); setError(''); }} className="form-input" />
      </fieldset>
      <fieldset disabled={pending} className="disabled:opacity-60">
        <button type="submit" className="button-primary">
          {pending ? 'Zapisywanie...' : 'Zapisz ustawienia'}
        </button>
      </fieldset>
    </form>}
    {message && <p role="status">{message}</p>}
    <p><Link to="/dashboard" className="text-link">Przejdź do statystyk</Link></p>
  </>;
}
