import type { Meta, StoryObj } from '@storybook/react';
import { DonutChart } from '../donut-chart';

const meta = {
  title: 'Analytics/DonutChart',
  component: DonutChart,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
} satisfies Meta<typeof DonutChart>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    data: [
      { label: 'Category A', value: 40, color: 'hsl(221, 83%, 53%)' },
      { label: 'Category B', value: 30, color: 'hsl(142, 76%, 36%)' },
      { label: 'Category C', value: 20, color: 'hsl(38, 92%, 50%)' },
      { label: 'Category D', value: 10, color: 'hsl(0, 84%, 60%)' },
    ],
  },
};

export const LeadStatus: Story = {
  args: {
    data: [
      { label: 'Hot Leads', value: 24, color: 'hsl(0, 84%, 60%)' },
      { label: 'Warm Leads', value: 56, color: 'hsl(38, 92%, 50%)' },
      { label: 'Cold Leads', value: 128, color: 'hsl(221, 83%, 53%)' },
    ],
    centerValue: 208,
    centerLabel: 'Total Leads',
  },
};

export const AppointmentStatus: Story = {
  args: {
    data: [
      { label: 'Completed', value: 145, color: 'hsl(142, 76%, 36%)' },
      { label: 'Confirmed', value: 48, color: 'hsl(221, 83%, 53%)' },
      { label: 'Pending', value: 23, color: 'hsl(38, 92%, 50%)' },
      { label: 'Cancelled', value: 12, color: 'hsl(0, 84%, 60%)' },
    ],
    centerValue: 228,
    centerLabel: 'Appointments',
  },
};

export const RevenueByCategory: Story = {
  args: {
    data: [
      { label: 'Preventive', value: 35000, color: 'hsl(142, 76%, 36%)' },
      { label: 'Restorative', value: 48000, color: 'hsl(221, 83%, 53%)' },
      { label: 'Cosmetic', value: 28000, color: 'hsl(280, 67%, 60%)' },
      { label: 'Orthodontic', value: 42000, color: 'hsl(38, 92%, 50%)' },
    ],
    centerValue: '€153k',
    centerLabel: 'Total Revenue',
  },
};

export const PatientAgeGroups: Story = {
  args: {
    data: [
      { label: '0-17', value: 120, color: 'hsl(280, 67%, 60%)' },
      { label: '18-34', value: 280, color: 'hsl(221, 83%, 53%)' },
      { label: '35-54', value: 350, color: 'hsl(142, 76%, 36%)' },
      { label: '55-74', value: 220, color: 'hsl(38, 92%, 50%)' },
      { label: '75+', value: 80, color: 'hsl(0, 84%, 60%)' },
    ],
    centerValue: 1050,
    centerLabel: 'Patients',
  },
};

export const InsuranceTypes: Story = {
  args: {
    data: [
      { label: 'Private Insurance', value: 420, color: 'hsl(221, 83%, 53%)' },
      { label: 'Public Insurance', value: 280, color: 'hsl(142, 76%, 36%)' },
      { label: 'Self-Pay', value: 180, color: 'hsl(38, 92%, 50%)' },
      { label: 'Other', value: 45, color: 'hsl(0, 0%, 60%)' },
    ],
    centerValue: 925,
    centerLabel: 'Patients',
  },
};

export const SmallSize: Story = {
  args: {
    data: [
      { label: 'Completed', value: 75, color: 'hsl(142, 76%, 36%)' },
      { label: 'Pending', value: 25, color: 'hsl(38, 92%, 50%)' },
    ],
    size: 120,
    strokeWidth: 16,
    centerValue: '75%',
    centerLabel: 'Done',
  },
};

export const LargeSize: Story = {
  args: {
    data: [
      { label: 'New', value: 156, color: 'hsl(221, 83%, 53%)' },
      { label: 'Returning', value: 489, color: 'hsl(142, 76%, 36%)' },
      { label: 'Churned', value: 67, color: 'hsl(0, 84%, 60%)' },
    ],
    size: 200,
    strokeWidth: 32,
    centerValue: 712,
    centerLabel: 'Total',
  },
};

export const ThickStroke: Story = {
  args: {
    data: [
      { label: 'Morning', value: 45, color: 'hsl(38, 92%, 50%)' },
      { label: 'Afternoon', value: 65, color: 'hsl(221, 83%, 53%)' },
      { label: 'Evening', value: 25, color: 'hsl(280, 67%, 60%)' },
    ],
    strokeWidth: 36,
    centerValue: 135,
    centerLabel: 'Slots',
  },
};

export const ThinStroke: Story = {
  args: {
    data: [
      { label: 'Email', value: 245, color: 'hsl(221, 83%, 53%)' },
      { label: 'Phone', value: 189, color: 'hsl(142, 76%, 36%)' },
      { label: 'Chat', value: 98, color: 'hsl(280, 67%, 60%)' },
      { label: 'Walk-in', value: 67, color: 'hsl(38, 92%, 50%)' },
    ],
    strokeWidth: 12,
    centerValue: 599,
    centerLabel: 'Contacts',
  },
};
