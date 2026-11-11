import { useState } from 'react';
import useAnalyticsDetails from '../hooks/useAnalyticsDetails.js';
import AnalyticsEfficiency from './AnalyticsEfficiency.jsx';
import AnalyticsPlatforms from './AnalyticsPlatforms.jsx';
import AnalyticsHourlyActivity from './AnalyticsHourlyActivity.jsx';
import AnalyticsDetails from './AnalyticsDetails.jsx';
import IncompleteShiftsNotice from './IncompleteShiftsNotice.jsx';

export default function AdvancedAnalytics({ token, selection, mode = 'gross', onSessionExpired, summary, showIncompleteWarning = true }) {
  const [platform, setPlatform] = useState('all');
  const [tableKind, setTableKind] = useState('trend');
  const [metricKey, setMetricKey] = useState('totalEarnings');
  const [platformMetric, setPlatformMetric] = useState('earnings');
  const [eventPlatform, setEventPlatform] = useState('all');
  const calendar = selection?.kind;
  const asOf = selection?.asOf;
  const global = useAnalyticsDetails({ token, selection, mode, platform: 'all', onSessionExpired });
  const filtered = useAnalyticsDetails({ token, selection, mode, platform, onSessionExpired,
    enabled: platform !== 'all' && global.status === 'success' });
  const hourlyFiltered = useAnalyticsDetails({ token, selection, mode, platform: 'all', eventPlatform, onSessionExpired,
    enabled: eventPlatform !== 'all' && global.status === 'success' });
  const current = platform === 'all' || global.status !== 'success' ? global : filtered;
  const hourly = eventPlatform === 'all' || global.status !== 'success' ? global : hourlyFiltered;

  if (!calendar || !asOf) return null;
  const details = current.details;
  return <>
    {details && showIncompleteWarning && <IncompleteShiftsNotice count={details.incompleteShiftCount} />}
    <section className="analytics-section" aria-labelledby="analytics-trends-title">
      <h2 id="analytics-trends-title" className="analytics-section-title">Efektywność pracy</h2>
      {global.status === 'loading' && <p role="status">Wczytywanie wykresów...</p>}
      {global.status === 'error' && <div>
        <p role="alert">{global.message}</p>
        <button type="button" className="button-secondary mt-2" onClick={global.retry}>Spróbuj ponownie</button>
      </div>}
      {global.details && <AnalyticsEfficiency details={global.details} selection={selection}
        availableRange={summary?.availableRange} metricKey={metricKey} onMetricChange={setMetricKey} />}
    </section>
    {global.details && <AnalyticsPlatforms rows={global.details.platforms} mode={global.details.mode}
      metricKey={platformMetric} onMetricChange={setPlatformMetric} />}
    <AnalyticsHourlyActivity activity={hourly.details?.hourlyActivity} status={hourly.status} message={hourly.message}
      eventPlatform={eventPlatform} onEventPlatformChange={setEventPlatform} onRetry={hourly.retry} />
    <AnalyticsDetails summary={summary} result={current} platform={platform} onPlatformChange={setPlatform}
      tableKind={tableKind} onTableKindChange={setTableKind} calendar={calendar} />
  </>;
}
