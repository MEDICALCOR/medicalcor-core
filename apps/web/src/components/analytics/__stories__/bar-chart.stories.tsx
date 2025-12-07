import type { Meta, StoryObj } from '@storybook/react';
import { BarChart } from '../bar-chart';

const meta = {
  title: 'Analytics/BarChart',
  component: BarChart,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <div className="w-[500px]">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof BarChart>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    data: [
      { label: 'January', value: 120 },
      { label: 'February', value: 95 },
      { label: 'March', value: 180 },
      { label: 'April', value: 150 },
      { label: 'May', value: 200 },
    ],
  },
};

export const AppointmentsByDoctor: Story = {
  args: {
    data: [
      { label: 'Dr. Maria Ionescu', value: 48 },
      { label: 'Dr. Ion Popescu', value: 35 },
      { label: 'Dr. Elena Dumitrescu', value: 28 },
      { label: 'Dr. Alexandru Vasilescu', value: 22 },
    ],
    valueLabel: 'appointments',
  },
};

export const ProcedureTypes: Story = {
  args: {
    data: [
      { label: 'Routine Checkup', value: 156 },
      { label: 'Teeth Cleaning', value: 124 },
      { label: 'Filling', value: 89 },
      { label: 'Crown', value: 45 },
      { label: 'Root Canal', value: 32 },
      { label: 'Extraction', value: 28 },
    ],
    valueLabel: 'procedures',
    color: 'bg-blue-500',
  },
};

export const RevenueByService: Story = {
  args: {
    data: [
      { label: 'Implants', value: 45000, secondaryValue: 15 },
      { label: 'Orthodontics', value: 32000, secondaryValue: 28 },
      { label: 'Cosmetic', value: 28000, secondaryValue: 42 },
      { label: 'General', value: 18000, secondaryValue: 120 },
    ],
    valueLabel: '€',
    secondaryLabel: 'patients',
    formatValue: (v) => `€${v.toLocaleString()}`,
    formatSecondary: (v) => v.toString(),
    color: 'bg-emerald-500',
  },
};

export const LeadSources: Story = {
  args: {
    data: [
      { label: 'Website', value: 245 },
      { label: 'Referral', value: 189 },
      { label: 'Google Ads', value: 156 },
      { label: 'Social Media', value: 98 },
      { label: 'Walk-in', value: 67 },
    ],
    valueLabel: 'leads',
    color: 'bg-purple-500',
  },
};

export const MonthlyPatients: Story = {
  args: {
    data: [
      { label: 'Jan', value: 45 },
      { label: 'Feb', value: 52 },
      { label: 'Mar', value: 48 },
      { label: 'Apr', value: 61 },
      { label: 'May', value: 55 },
      { label: 'Jun', value: 67 },
      { label: 'Jul', value: 72 },
      { label: 'Aug', value: 58 },
      { label: 'Sep', value: 65 },
      { label: 'Oct', value: 78 },
      { label: 'Nov', value: 82 },
      { label: 'Dec', value: 70 },
    ],
    valueLabel: 'new patients',
    color: 'bg-amber-500',
  },
};

export const CustomFormatting: Story = {
  args: {
    data: [
      { label: 'Week 1', value: 12500 },
      { label: 'Week 2', value: 18750 },
      { label: 'Week 3', value: 15200 },
      { label: 'Week 4', value: 22100 },
    ],
    valueLabel: '',
    formatValue: (v) => `€${(v / 1000).toFixed(1)}k`,
    color: 'bg-cyan-500',
  },
};

export const CompactView: Story = {
  args: {
    data: [
      { label: 'Hot', value: 24 },
      { label: 'Warm', value: 56 },
      { label: 'Cold', value: 128 },
    ],
    valueLabel: 'leads',
  },
  decorators: [
    (Story) => (
      <div className="w-[300px]">
        <Story />
      </div>
    ),
  ],
};
