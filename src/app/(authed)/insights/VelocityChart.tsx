'use client';
import { SimpleBarChart } from '@/components/SimpleBarChart';

/**
 * Compact single-series bar chart of completed tasks per period. The last
 * bar is highlighted (current period) so the reader's eye lands on "today".
 */
export default function VelocityChart({ data }: { data: { label: string; completed: number }[] }) {
  return (
    <SimpleBarChart
      height={160}
      legend={false}
      data={data.map((d, i) => ({
        label:     d.label,
        completed: d.completed,
        _highlight: i === data.length - 1,
      }))}
      series={[{ key: 'completed', name: 'Completed', color: '#1565C0' }]}
    />
  );
}
