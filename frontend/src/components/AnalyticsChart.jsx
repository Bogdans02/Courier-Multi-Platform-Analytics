import { useEffect, useRef } from 'react';
import Chart from 'chart.js/auto';
import { analyticsAxisLabel } from '../utils/analyticsFormat.js';

// Chart.js rysuje na canvasie i nie widzi CSS, więc kolory czytam ze zmiennych z index.css.
function cssColor(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

export default function AnalyticsChart({ title, type = 'bar', labels, values, unit = 'PLN', compact = false, showAllLabels = false }) {
  const canvas = useRef(null);

  useEffect(() => {
    const accent = cssColor('--color-accent');
    const text = cssColor('--color-text');
    const muted = cssColor('--color-text-muted');
    const chart = new Chart(canvas.current, {
      type,
      data: {
        labels,
        datasets: [{
          label: unit,
          data: values,
          borderColor: accent,
          backgroundColor: ({ chart }) => {
            if (!chart.chartArea) return accent;
            const gradient = chart.ctx.createLinearGradient(0, chart.chartArea.top, 0, chart.chartArea.bottom);
            gradient.addColorStop(0, type === 'line' ? '#ffb80040' : '#ffcf16');
            gradient.addColorStop(1, type === 'line' ? '#ffb80000' : '#f59100');
            return gradient;
          },
          borderWidth: type === 'line' ? 2 : 0,
          borderRadius: type === 'bar' ? 3 : 0,
          maxBarThickness: compact ? 26 : 46,
          pointRadius: compact ? 2 : 3,
          pointBackgroundColor: accent,
          pointBorderColor: accent,
          tension: 0.3,
          fill: type === 'line',
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        layout: { padding: compact ? 0 : { top: 8, right: 4 } },
        animation: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? false : { duration: 300 },
        locale: 'pl-PL',
        plugins: { legend: { display: false }, tooltip: { backgroundColor: cssColor('--color-surface-raised'), titleColor: text, bodyColor: text, padding: 12, cornerRadius: 8 } },
        scales: {
          x: { grid: { display: false }, ticks: { color: muted, autoSkip: !compact && !showAllLabels, maxTicksLimit: showAllLabels ? labels.length : 7, maxRotation: 0, font: { size: compact ? 10 : 11 }, callback: function (value) {
            return analyticsAxisLabel(this.getLabelForValue(value));
          } }, border: { display: false } },
          y: { beginAtZero: true, grid: { color: '#25436155' }, border: { display: false }, ticks: { color: muted, maxTicksLimit: 4, font: { size: 10 } }, title: { display: !compact, text: unit, color: muted, font: { size: 10 } } },
        },
      },
    });
    return () => chart.destroy();
  }, [type, labels, values, unit, compact, showAllLabels]);

  return (
    <div className={`relative w-full ${compact ? 'my-3 h-32 sm:h-40' : 'analytics-chart'}`}>
      <canvas ref={canvas} role="img" aria-label={title} />
    </div>
  );
}
