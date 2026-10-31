import { analyticsLabel } from '../utils/analyticsFormat.js';
import { formatMoney } from '../utils/shiftFormat.js';

const money = (value) => value === null ? 'Brak danych' : formatMoney(value);
const share = (value) => value === null ? 'Brak danych' : `${Number(value).toLocaleString('pl-PL')}%`;

export default function AnalyticsDataTable({ title, kind, rows, mode, platform }) {
  const showHourly = platform === 'all' && ['weekdays', 'months', 'startTimes'].includes(kind);
  const moneyLabel = mode === 'estimated_net' ? 'Szacowane netto' : 'Brutto';
  return <div className="analytics-table-scroll" role="region" aria-label={`Tabela: ${title}`} tabIndex={0}>
    <table className="w-full text-left text-sm">
      <caption className="sr-only">{title} — {moneyLabel.toLowerCase()}</caption>
      <thead><tr>
        <th scope="col" className="p-2">Grupa</th>
        <th scope="col" className="p-2">Zmiany</th>
        <th scope="col" className="p-2">{moneyLabel}</th>
        <th scope="col" className="p-2">Zamówienia</th>
        <th scope="col" className="p-2">Zł/zamówienie</th>
        {showHourly && <th scope="col" className="p-2">Zł/h</th>}
        {kind === 'platforms' && <>
          <th scope="col" className="p-2">Udział zarobków</th>
          <th scope="col" className="p-2">Udział zamówień</th>
        </>}
      </tr></thead>
      <tbody>{rows.map((row) => <tr key={row.key ?? row.platform} className="border-t border-slate-700">
        <th scope="row" className="p-2 font-normal">{analyticsLabel(kind, row)}</th>
        <td className="p-2">{row.shiftCount}</td>
        <td className="whitespace-nowrap p-2">{row.shiftCount ? money(row.totalEarnings) : 'Brak danych'}</td>
        <td className="p-2">{row.shiftCount ? row.totalOrders : 'Brak danych'}</td>
        <td className="whitespace-nowrap p-2">{money(row.earningsPerOrder)}</td>
        {showHourly && <td className="whitespace-nowrap p-2">{money(row.earningsPerHour)}</td>}
        {kind === 'platforms' && <><td className="p-2">{share(row.earningsShare)}</td><td className="p-2">{share(row.ordersShare)}</td></>}
      </tr>)}</tbody>
    </table>
    {rows.length === 0 && <p className="muted py-4 text-sm">Brak danych w wybranym zestawieniu.</p>}
  </div>;
}
