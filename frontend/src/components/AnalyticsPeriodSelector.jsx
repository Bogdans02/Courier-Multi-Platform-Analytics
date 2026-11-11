import { ChevronLeft, ChevronRight } from 'lucide-react';
import { calendarAnchor, calendarPeriodLabel, calendarPeriodOptions, canStepAnalyticsCalendar } from '../utils/analyticsCalendar.js';

export default function AnalyticsPeriodSelector({ selection, range, confirmedAnchor, onKindChange, onAnchorChange, onStep }) {
  const { kind, anchors } = selection;
  const selectedAnchor = kind === 'all' ? null : confirmedAnchor ?? calendarAnchor(kind, anchors[kind]);
  const options = calendarPeriodOptions(kind, range);
  // Keep a previously selected empty period correctly labelled if history shrinks.
  if (selectedAnchor && !options.some(option => option.anchor === selectedAnchor)) {
    options.push({ anchor: selectedAnchor, label: calendarPeriodLabel(kind, selectedAnchor) });
  }
  const unit = kind === 'week' ? 'tydzień' : 'miesiąc';
  return <>
    <div className="segmented period-tabs" role="group" aria-label="Okres statystyk">
      {[['week', 'Tydzień'], ['month', 'Miesiąc'], ['all', 'Całość']].map(([value, label]) =>
        <button key={value} type="button" aria-pressed={kind === value} onClick={() => onKindChange(value)}>{label}</button>)}
    </div>
    {kind !== 'all' && <div className="analytics-period-navigation">
      <button type="button" aria-label={`Poprzedni ${unit}`} disabled={!canStepAnalyticsCalendar(selection, -1, range)}
        onClick={() => onStep(-1)}><ChevronLeft size={20} aria-hidden="true" /></button>
      <label className="sr-only" htmlFor="analytics-calendar-period">Wybierz {unit}</label>
      <select id="analytics-calendar-period" className="form-input" value={selectedAnchor} disabled={!range}
        onChange={event => onAnchorChange(event.target.value)}>
        {options.map(option => <option key={option.anchor} value={option.anchor}>{option.label}</option>)}
      </select>
      <button type="button" aria-label={`Następny ${unit}`} disabled={!canStepAnalyticsCalendar(selection, 1, range)}
        onClick={() => onStep(1)}><ChevronRight size={20} aria-hidden="true" /></button>
    </div>}
  </>;
}
