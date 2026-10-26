import { useEffect, useRef } from 'react';
import Chart from 'chart.js/auto';

export default function AnalyticsChart({ title, type = 'bar', labels, values, unit = 'PLN', compact = false }) {
  const canvas = useRef(null);

  useEffect(() => {
    const chart = new Chart(canvas.current, {
      type,
      data: {
        labels,
        datasets: [{
          label: unit,
          data: values,
          borderColor: '#fbbf24',
          backgroundColor: ({ chart }) => {
            if (!chart.chartArea) return '#ffb800';
            const gradient = chart.ctx.createLinearGradient(0, chart.chartArea.top, 0, chart.chartArea.bottom);
            gradient.addColorStop(0, type === 'line' ? '#ffb80040' : '#ffcf16');
            gradient.addColorStop(1, type === 'line' ? '#ffb80000' : '#f59100');
            return gradient;
          },
          borderWidth: type === 'line' ? 2 : 0,
          borderRadius: type === 'bar' ? 3 : 0,
          maxBarThickness: compact ? 26 : 46,
          pointRadius: compact ? 2 : 3,
          pointBackgroundColor: '#ffca17',
          pointBorderColor: '#ffca17',
          tension: 0.3,
          fill: type === 'line',
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? false : { duration: 300 },
        locale: 'pl-PL',
        plugins: { legend: { display: false }, tooltip: { backgroundColor: '#102b48', titleColor: '#f2f5fc', bodyColor: '#f2f5fc', padding: 12, cornerRadius: 8 } },
        scales: {
          x: { grid: { display: false }, ticks: { color: '#a9bcd6', autoSkip: !compact, maxTicksLimit: 7, maxRotation: 0, font: { size: compact ? 10 : 11 }, callback: function (value) {
            const label = this.getLabelForValue(value);
            return /^\d{2}\.\d{2}\.\d{4}$/.test(label) ? label.slice(0, 5) : label;
          } }, border: { display: false } },
          y: { beginAtZero: true, grid: { color: '#25436155' }, border: { display: false }, ticks: { color: '#a9bcd6', maxTicksLimit: 4, font: { size: 10 } }, title: { display: !compact, text: unit, color: '#a9bcd6', font: { size: 10 } } },
        },
      },
    });
    return () => chart.destroy();
  }, [type, labels, values, unit, compact]);

  return (
    <div className={`relative w-full ${compact ? 'my-3 h-32 sm:h-40' : 'h-48 sm:h-60'}`}>
      <canvas ref={canvas} role="img" aria-label={title} />
    </div>
  );
}
