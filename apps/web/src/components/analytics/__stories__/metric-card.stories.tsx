import type { Meta, StoryObj } from '@storybook/react';
import { Users, TrendingUp, Clock, Euro, Calendar, Phone } from 'lucide-react';
import { MetricCard } from '../metric-card';

const meta = {
  title: 'Analytics/MetricCard',
  component: MetricCard,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  argTypes: {
    format: {
      control: 'select',
      options: ['number', 'currency', 'percentage', 'time'],
      description: 'The format of the value',
    },
  },
  decorators: [
    (Story) => (
      <div className="w-[300px]">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof MetricCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    title: 'Total Leads',
    value: 1234,
    icon: Users,
  },
};

export const WithPositiveChange: Story = {
  args: {
    title: 'New Leads',
    value: 156,
    change: 12.5,
    icon: TrendingUp,
    iconColor: 'text-green-600',
  },
};

export const WithNegativeChange: Story = {
  args: {
    title: 'Cancelled Appointments',
    value: 23,
    change: -8.3,
    icon: Calendar,
    iconColor: 'text-red-600',
  },
};

export const Currency: Story = {
  args: {
    title: 'Revenue',
    value: 45780,
    format: 'currency',
    change: 15.2,
    icon: Euro,
    iconColor: 'text-emerald-600',
  },
};

export const Percentage: Story = {
  args: {
    title: 'Conversion Rate',
    value: 23.5,
    format: 'percentage',
    change: 3.2,
    icon: TrendingUp,
    iconColor: 'text-blue-600',
  },
};

export const Time: Story = {
  args: {
    title: 'Avg Response Time',
    value: 4.5,
    format: 'time',
    change: -1.2,
    icon: Clock,
    iconColor: 'text-amber-600',
    changeLabel: 'vs ultima săptămână',
  },
};

export const WithPrefix: Story = {
  args: {
    title: 'Active Calls',
    value: 12,
    prefix: '+',
    icon: Phone,
    iconColor: 'text-purple-600',
  },
};

export const StringValue: Story = {
  args: {
    title: 'Status',
    value: 'Active',
    icon: Users,
  },
};

export const NoChange: Story = {
  args: {
    title: 'Total Appointments',
    value: 89,
    change: 0,
    icon: Calendar,
    iconColor: 'text-blue-600',
  },
};

export const DashboardGrid: Story = {
  decorators: [
    () => (
      <div className="grid grid-cols-2 gap-4 w-[640px]">
        <MetricCard
          title="Total Leads"
          value={1234}
          change={12.5}
          icon={Users}
          iconColor="text-blue-600"
        />
        <MetricCard
          title="Revenue"
          value={45780}
          format="currency"
          change={15.2}
          icon={Euro}
          iconColor="text-emerald-600"
        />
        <MetricCard
          title="Conversion Rate"
          value={23.5}
          format="percentage"
          change={-2.1}
          icon={TrendingUp}
          iconColor="text-amber-600"
        />
        <MetricCard
          title="Avg Response"
          value={4.5}
          format="time"
          change={-1.2}
          icon={Clock}
          iconColor="text-purple-600"
        />
      </div>
    ),
  ],
  render: () => null,
};
