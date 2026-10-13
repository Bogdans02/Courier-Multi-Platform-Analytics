import { useEffect, useRef } from 'react';
import Chart from 'chart.js/auto';

export default function AnalyticsChart({ title, type = 'bar', labels, values, unit = 'PLN' }) {
  const canvas = useRef(null);

  useEffect(() => {
    const chart = new Chart(canvas.current, {
      type,
      data: {
        labels,
        datasets: [{
          label: unit,
          data: values,
          borderColor: '#0369a1',
          backgroundColor: '#38bdf8',
          borderWidth: 2,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        locale: 'pl-PL',
        plugins: { legend: { display: false } },
        scales: { y: { beginAtZero: true, title: { display: true, text: unit } } },
      },
    });
    return () => chart.destroy();
  }, [type, labels, values, unit]);

  return (
    <div className="relative h-64 w-full">
      <canvas ref={canvas} role="img" aria-label={title} />
    </div>
  );
}
