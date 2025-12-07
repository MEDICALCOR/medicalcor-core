import type { Meta, StoryObj } from '@storybook/react';
import { LineChart } from '../line-chart';

const generateTimeSeriesData = (days: number, baseValue: number, variance: number) => {
  const data = [];
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  for (let i = 0; i < days; i++) {
    const date = new Date(startDate);
    date.setDate(date.getDate() + i);
    const value = baseValue + Math.floor(Math.random() * variance * 2) - variance;
    data.push({
      date: date.toISOString(),
      value: Math.max(0, value),
    });
  }
  return data;
};

const meta = {
  title: 'Analytics/LineChart',
  component: LineChart,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <div className="w-[500px] p-4 border rounded-lg">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof LineChart>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    data: generateTimeSeriesData(30, 50, 20),
    height: 200,
  },
};

export const WeeklyView: Story = {
  args: {
    data: generateTimeSeriesData(7, 100, 30),
    height: 200,
    color: 'hsl(221, 83%, 53%)',
  },
};

export const MonthlyView: Story = {
  args: {
    data: generateTimeSeriesData(30, 75, 25),
    height: 200,
    color: 'hsl(142, 76%, 36%)',
  },
};

export const QuarterlyView: Story = {
  args: {
    data: generateTimeSeriesData(90, 150, 50),
    height: 200,
    color: 'hsl(38, 92%, 50%)',
  },
};

export const WithoutGrid: Story = {
  args: {
    data: generateTimeSeriesData(30, 80, 30),
    height: 200,
    showGrid: false,
  },
};

export const WithoutLabels: Story = {
  args: {
    data: generateTimeSeriesData(30, 60, 20),
    height: 150,
    showLabels: false,
    showGrid: false,
  },
};

export const TrendingUp: Story = {
  args: {
    data: Array.from({ length: 30 }, (_, i) => ({
      date: new Date(Date.now() - (30 - i) * 24 * 60 * 60 * 1000).toISOString(),
      value: 50 + i * 3 + Math.floor(Math.random() * 10),
    })),
    height: 200,
    color: 'hsl(142, 76%, 36%)',
  },
};

export const TrendingDown: Story = {
  args: {
    data: Array.from({ length: 30 }, (_, i) => ({
      date: new Date(Date.now() - (30 - i) * 24 * 60 * 60 * 1000).toISOString(),
      value: 150 - i * 3 + Math.floor(Math.random() * 10),
    })),
    height: 200,
    color: 'hsl(0, 84%, 60%)',
  },
};

export const HighVariance: Story = {
  args: {
    data: generateTimeSeriesData(30, 100, 80),
    height: 200,
    color: 'hsl(280, 67%, 60%)',
  },
};

export const LowVariance: Story = {
  args: {
    data: generateTimeSeriesData(30, 100, 5),
    height: 200,
    color: 'hsl(221, 83%, 53%)',
  },
};

export const SparseData: Story = {
  args: {
    data: [
      { date: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString(), value: 45 },
      { date: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString(), value: 78 },
      { date: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(), value: 52 },
      { date: new Date().toISOString(), value: 89 },
    ],
    height: 200,
  },
};

export const EmptyState: Story = {
  args: {
    data: [],
    height: 200,
  },
};

export const AppointmentsOverTime: Story = {
  args: { data: [], height: 180 },
  render: () => (
    <div className="space-y-2">
      <h3 className="text-lg font-semibold">Daily Appointments</h3>
      <LineChart data={generateTimeSeriesData(14, 12, 5)} height={180} color="hsl(221, 83%, 53%)" />
    </div>
  ),
};

export const RevenueChart: Story = {
  args: { data: [], height: 180 },
  render: () => (
    <div className="space-y-2">
      <h3 className="text-lg font-semibold">Revenue Trend</h3>
      <LineChart
        data={Array.from({ length: 30 }, (_, i) => ({
          date: new Date(Date.now() - (30 - i) * 24 * 60 * 60 * 1000).toISOString(),
          value: 2500 + i * 50 + Math.floor(Math.random() * 500),
        }))}
        height={180}
        color="hsl(142, 76%, 36%)"
      />
    </div>
  ),
};

export const CompactSize: Story = {
  args: {
    data: generateTimeSeriesData(14, 50, 15),
    height: 100,
    showLabels: false,
  },
  decorators: [
    (Story) => (
      <div className="w-[200px] p-2 border rounded-lg">
        <Story />
      </div>
    ),
  ],
};

export const LargeSize: Story = {
  args: {
    data: generateTimeSeriesData(60, 100, 40),
    height: 300,
  },
  decorators: [
    (Story) => (
      <div className="w-[700px] p-4 border rounded-lg">
        <Story />
      </div>
    ),
  ],
};
