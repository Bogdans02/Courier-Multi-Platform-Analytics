import PlatformBadge from './PlatformBadge.jsx';
import { platforms } from '../utils/platformEntries.js';
import { formatMoney } from '../utils/shiftFormat.js';

const metrics = [
  { key: 'earnings', label: 'Zarobki', value: 'totalEarnings', share: 'earningsShare' },
  { key: 'orders', label: 'Zamówienia', value: 'totalOrders', share: 'ordersShare' },
];

export default function AnalyticsPlatforms({ rows, mode, metricKey, onMetricChange }) {
  const metric = metrics.find(item => item.key === metricKey);
  return <section className="analytics-section" aria-labelledby="analytics-platforms-title">
    <h2 id="analytics-platforms-title" className="analytics-section-title">Platformy</h2>
    <div className="segmented" role="group" aria-label="Wyniki platform">
      {metrics.map(item => <button type="button" key={item.key} aria-pressed={item.key === metricKey}
        onClick={() => onMetricChange(item.key)}>{item.label}</button>)}
    </div>
    <p className="muted text-xs">{metricKey === 'earnings'
      ? `${mode === 'estimated_net' ? 'Szacowane netto' : 'Brutto'} · udział w zarobkach`
      : 'Liczba zamówień · udział w zamówieniach'}</p>
    <div className="card">
      {rows.length === 0 && <p className="muted text-sm">Brak danych platform w wybranym okresie.</p>}
      <ul className="platform-shares" aria-label={`Platformy — ${metric.label.toLocaleLowerCase('pl-PL')}`}>
        {platforms.map(({ value: platform }) => {
          const row = rows.find(item => item.platform === platform);
          const value = row?.[metric.value];
          const share = row?.[metric.share];
          return <li key={platform} data-platform={platform}>
            <div className="platform-share-label"><PlatformBadge platform={platform} />
              <span className="platform-share-value">{value == null ? 'Brak danych'
                : metricKey === 'earnings' ? formatMoney(value) : Number(value).toLocaleString('pl-PL')}</span>
            </div>
            <div className="platform-share-meter">
              {share != null && <div className="platform-share-track" aria-hidden="true">
                <div className={`platform-share-fill ${platform}`}
                  style={{ width: `${Math.min(100, Math.max(0, Number(share)))}%` }} />
              </div>}
              <span className="platform-share-percentage"><span className="sr-only">Udział: </span>
                {share != null ? `${Number(share).toLocaleString('pl-PL', { maximumFractionDigits: 2 })}%`
                  : row ? 'Brak podstawy' : 'Brak danych'}
              </span>
            </div>
          </li>;
        })}
      </ul>
    </div>
  </section>;
}
