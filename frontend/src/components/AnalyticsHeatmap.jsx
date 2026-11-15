import { useState } from 'react';
import { Clock } from 'lucide-react';

const number = value => Number(value).toLocaleString('pl-PL', { maximumFractionDigits: 2 });
const hourLabel = hour => String(hour * 2).padStart(2, '0');
const shortWeekday = ['Pon', 'Wt', 'Śr', 'Czw', 'Pt', 'Sob', 'Nd'];

// Mapa cieplna dzień tygodnia × pora dnia. Intensywność koloru = wartość komórki względem najgorętszej.
// Pokazywana tylko, gdy backend uzna pokrycie danych za wystarczające (inaczej widok godzinowy).
export default function AnalyticsHeatmap({ activity }) {
  const rate = activity.mode === 'rate';
  const unit = rate ? 'dostawy/h' : 'dostawy';
  const max = activity.best?.value ?? 0;
  // Domyślnie podświetlamy najgorętszą porę, żeby wynik był widoczny bez dotykania mapy.
  const bestKey = activity.best ? `${activity.best.weekday}-${activity.best.hour}` : null;
  const [selectedKey, setSelectedKey] = useState(bestKey);
  // Komórki w siatce 7×12, posortowane po dniu i porze dla pewności kolejności renderu.
  const byKey = new Map(activity.cells.map(cell => [`${cell.weekday}-${cell.hour}`, cell]));
  const selected = byKey.get(selectedKey);

  return <div className="card analytics-chart-card">
    <h3 className="analytics-chart-title flex items-center gap-2"><Clock size={18} aria-hidden="true" />Kiedy jest gorąco</h3>
    {activity.best
      ? <p className="analytics-best-result">
        <span>Najcieplej: <strong>{activity.best.label}</strong></span>
        <span className="analytics-best-rate">{number(activity.best.value)} {unit}</span>
      </p>
      : <p className="muted text-sm">Za mało danych, by wskazać najgorętszą porę.</p>}

    <div className="analytics-heatmap-scroll" role="region" aria-label="Mapa cieplna dzień i godzina — przewijana poziomo" tabIndex={0}>
      <table className="analytics-heatmap">
        <thead>
          <tr>
            <th className="analytics-heatmap-corner"><span className="sr-only">Dzień tygodnia</span></th>
            {Array.from({ length: 12 }, (_, hour) => <th key={hour} scope="col">{hourLabel(hour)}</th>)}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: 7 }, (_, row) => {
            const weekday = row + 1;
            return <tr key={weekday}>
              <th scope="row">{shortWeekday[row]}</th>
              {Array.from({ length: 12 }, (_, hour) => {
                const key = `${weekday}-${hour}`;
                const cell = byKey.get(key);
                const worked = cell?.status === 'available';
                const value = worked ? cell.value : null;
                // Przezroczystość rośnie z wartością; komórka bez pracy jest pusta (kreskowana), a nie "0".
                const intensity = worked && max > 0 && value != null ? Math.max(0.12, value / max) : 0;
                const title = worked
                  ? `${cell.label}: ${number(value ?? 0)} ${unit}`
                  : `${cell?.label ?? `${shortWeekday[row]} ${hourLabel(hour)}:00`}: Brak danych`;
                return <td key={hour} className={worked ? 'is-worked' : 'is-empty'}
                  style={worked ? { backgroundColor: `color-mix(in srgb, var(--color-accent) ${Math.round(intensity * 100)}%, transparent)` } : undefined}>
                  <button type="button" className="analytics-heatmap-cell" title={title} aria-label={title}
                    aria-pressed={selectedKey === key}
                    onClick={() => setSelectedKey(key)} onFocus={() => setSelectedKey(key)}
                    onMouseEnter={() => setSelectedKey(key)}>
                    <span className="sr-only">{title}</span>
                  </button>
                </td>;
              })}
            </tr>;
          })}
        </tbody>
      </table>
    </div>
    <p className="analytics-heatmap-selection" role="status" aria-atomic="true">
      {selected ? <><strong>{selected.label}</strong><span>{selected.status === 'available'
        ? `${number(selected.value ?? 0)} ${unit}` : 'Brak danych dla tej pory'}</span></>
        : 'Dotknij komórki, aby zobaczyć dzień, godziny i wynik.'}
    </p>
    <div className="analytics-heatmap-legend muted text-xs">
      <span>mniej</span>
      <span className="analytics-heatmap-legend-bar" aria-hidden="true" />
      <span>więcej {rate ? '(dostawy/h)' : '(dostawy)'}</span>
    </div>
  </div>;
}
