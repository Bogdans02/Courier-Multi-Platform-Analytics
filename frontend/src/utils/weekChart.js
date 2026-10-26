const weekdays = ['pon.', 'wt.', 'śr.', 'czw.', 'pt.', 'sob.', 'niedz.'];

// The API supplies the Warsaw Monday boundary; UTC here only advances calendar dates.
export function weekChartData(trend, from) {
  const start = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Warsaw',
    year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(from));
  const days = weekdays.map((weekday, index) => {
    const date = new Date(`${start}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() + index);
    const key = date.toISOString().slice(0, 10);
    const row = trend.find((row) => row.key === key);
    return { label: [`${key.slice(8, 10)}.${key.slice(5, 7)}`, weekday],
      rangeLabel: `${date.toLocaleDateString('pl-PL', { day: 'numeric', month: 'short', timeZone: 'UTC' }).replace(/\.$/, '')}.`,
      value: row?.shiftCount > 0 ? Number(row.totalEarnings) : null };
  });
  return { labels: days.map((day) => day.label), values: days.map((day) => day.value),
    range: `${days[0].rangeLabel} - ${days[6].rangeLabel}` };
}
