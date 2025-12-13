/**
 * @fileoverview Charts Section Server Component
 *
 * Displays analytics charts for the dashboard.
 * Server component with parallel data fetching.
 *
 * @module web/app/(dashboard)/components/ChartsSection
 */

interface ChartData {
  readonly label: string;
  readonly value: number;
}

async function fetchLeadTrends(): Promise<ChartData[]> {
  // In production, fetch from API
  return [
    { label: 'Mon', value: 45 },
    { label: 'Tue', value: 52 },
    { label: 'Wed', value: 38 },
    { label: 'Thu', value: 65 },
    { label: 'Fri', value: 48 },
    { label: 'Sat', value: 22 },
    { label: 'Sun', value: 18 },
  ];
}

async function fetchSourceBreakdown(): Promise<ChartData[]> {
  // In production, fetch from API
  return [
    { label: 'WhatsApp', value: 42 },
    { label: 'Web Form', value: 28 },
    { label: 'Voice', value: 18 },
    { label: 'Referral', value: 12 },
  ];
}

function BarChart({ data, title }: { data: ChartData[]; title: string }) {
  const maxValue = Math.max(...data.map((d) => d.value));

  return (
    <div className="rounded-lg border bg-card p-6 shadow-sm">
      <h3 className="text-lg font-semibold mb-4">{title}</h3>
      <div className="space-y-3">
        {data.map((item) => (
          <div key={item.label} className="flex items-center gap-3">
            <span className="w-12 text-sm text-muted-foreground">{item.label}</span>
            <div className="flex-1 h-6 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-primary rounded-full"
                style={{ width: `${(item.value / maxValue) * 100}%` }}
              />
            </div>
            <span className="w-8 text-sm font-medium">{item.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function PieChart({ data, title }: { data: ChartData[]; title: string }) {
  const total = data.reduce((sum, d) => sum + d.value, 0);
  const colors = ['bg-blue-500', 'bg-green-500', 'bg-yellow-500', 'bg-purple-500'];

  return (
    <div className="rounded-lg border bg-card p-6 shadow-sm">
      <h3 className="text-lg font-semibold mb-4">{title}</h3>
      <div className="space-y-2">
        {data.map((item, i) => (
          <div key={item.label} className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className={`w-3 h-3 rounded-full ${colors[i % colors.length]}`} />
              <span className="text-sm">{item.label}</span>
            </div>
            <span className="text-sm font-medium">{Math.round((item.value / total) * 100)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export async function ChartsSection() {
  // Parallel data fetching
  const [leadTrends, sourceBreakdown] = await Promise.all([
    fetchLeadTrends(),
    fetchSourceBreakdown(),
  ]);

  return (
    <section className="grid gap-4 md:grid-cols-2">
      <BarChart data={leadTrends} title="Lead Volume (Last 7 Days)" />
      <PieChart data={sourceBreakdown} title="Lead Sources" />
    </section>
  );
}

export function ChartsSectionSkeleton() {
  return (
    <section className="grid gap-4 md:grid-cols-2">
      {[1, 2].map((i) => (
        <div key={i} className="rounded-lg border bg-card p-6 shadow-sm animate-pulse">
          <div className="h-6 w-40 bg-gray-200 rounded mb-4" />
          <div className="space-y-3">
            {[1, 2, 3, 4].map((j) => (
              <div key={j} className="h-6 bg-gray-200 rounded" />
            ))}
          </div>
        </div>
      ))}
    </section>
  );
}
