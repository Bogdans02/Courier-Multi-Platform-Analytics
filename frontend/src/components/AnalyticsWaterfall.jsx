import { Wallet } from 'lucide-react';
import { formatMoney } from '../utils/shiftFormat.js';
import { waterfallSteps } from '../utils/waterfall.js';

// Rozkład "na rękę": od brutto odejmujemy podatek, paliwo i inne koszty. Pokazujemy tylko kroki,
// które coś odejmują — jeśli nic nie ma do odjęcia, karta się nie pojawia.
export default function AnalyticsWaterfall({ summary }) {
  const steps = waterfallSteps(summary);
  if (!steps || steps.deductions.length === 0) return null;

  const distance = summary.distanceShiftCount
    ? `${Number(summary.totalDistance).toLocaleString('pl-PL')} km` : null;

  return <section className="card analytics-waterfall" aria-labelledby="analytics-waterfall-title">
    <h3 id="analytics-waterfall-title" className="analytics-chart-title flex items-center gap-2">
      <Wallet size={18} aria-hidden="true" />Co zostaje na rękę
    </h3>
    <dl className="waterfall-rows">
      <div className="waterfall-row">
        <dt>Brutto</dt>
        <dd>{formatMoney(steps.gross)}</dd>
      </div>
      {steps.deductions.map(step => <div key={step.key} className="waterfall-row waterfall-deduction">
        <dt>− {step.label}</dt>
        <dd>−{formatMoney(step.amount)}</dd>
      </div>)}
      <div className="waterfall-row waterfall-total">
        <dt>Na rękę</dt>
        <dd>{formatMoney(steps.takeHome)}</dd>
      </div>
    </dl>
    {steps.deductions.some(step => step.key === 'fuel') && distance
      && <p className="muted text-xs">Paliwo policzone z dystansu zmian ({distance}) i ustawień transportu.</p>}
    {steps.deductions.some(step => step.key === 'other')
      && <p className="muted text-xs">„Inne koszty” to ręczne wydatki bez paliwa (paliwo już wyżej, z km).</p>}
  </section>;
}
