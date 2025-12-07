import type { Meta, StoryObj } from '@storybook/react';
import { FunnelChart } from '../funnel-chart';

const meta = {
  title: 'Analytics/FunnelChart',
  component: FunnelChart,
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
} satisfies Meta<typeof FunnelChart>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    data: [
      { name: 'Step 1', count: 1000, percentage: 100, dropoff: 20 },
      { name: 'Step 2', count: 800, percentage: 80, dropoff: 25 },
      { name: 'Step 3', count: 600, percentage: 60, dropoff: 16.7 },
      { name: 'Step 4', count: 500, percentage: 50 },
    ],
  },
};

export const LeadConversion: Story = {
  args: {
    data: [
      { name: 'Website Visits', count: 5000, percentage: 100, dropoff: 90 },
      { name: 'Form Submissions', count: 500, percentage: 10, dropoff: 40 },
      { name: 'Qualified Leads', count: 300, percentage: 6, dropoff: 33.3 },
      { name: 'Appointments Booked', count: 200, percentage: 4, dropoff: 25 },
      { name: 'Patients Converted', count: 150, percentage: 3 },
    ],
  },
};

export const AppointmentFunnel: Story = {
  args: {
    data: [
      { name: 'Appointments Scheduled', count: 248, percentage: 100, dropoff: 8.1 },
      { name: 'Reminders Sent', count: 228, percentage: 91.9, dropoff: 5.3 },
      { name: 'Confirmations Received', count: 216, percentage: 87.1, dropoff: 4.2 },
      { name: 'Check-ins', count: 207, percentage: 83.5, dropoff: 1.9 },
      { name: 'Completed', count: 203, percentage: 81.9 },
    ],
  },
};

export const PatientJourney: Story = {
  args: {
    data: [
      { name: 'Initial Contact', count: 1200, percentage: 100, dropoff: 25 },
      { name: 'Consultation Booked', count: 900, percentage: 75, dropoff: 22.2 },
      { name: 'Consultation Completed', count: 700, percentage: 58.3, dropoff: 14.3 },
      { name: 'Treatment Plan Accepted', count: 600, percentage: 50, dropoff: 16.7 },
      { name: 'Treatment Started', count: 500, percentage: 41.7, dropoff: 10 },
      { name: 'Treatment Completed', count: 450, percentage: 37.5 },
    ],
  },
};

export const OnboardingFunnel: Story = {
  args: {
    data: [
      { name: 'Account Created', count: 350, percentage: 100, dropoff: 14.3 },
      { name: 'Profile Completed', count: 300, percentage: 85.7, dropoff: 16.7 },
      { name: 'Insurance Verified', count: 250, percentage: 71.4, dropoff: 12 },
      { name: 'First Appointment', count: 220, percentage: 62.9 },
    ],
  },
};

export const SalesProcess: Story = {
  args: {
    data: [
      { name: 'Leads', count: 1500, percentage: 100, dropoff: 53.3 },
      { name: 'Qualified', count: 700, percentage: 46.7, dropoff: 42.9 },
      { name: 'Proposal Sent', count: 400, percentage: 26.7, dropoff: 37.5 },
      { name: 'Negotiation', count: 250, percentage: 16.7, dropoff: 20 },
      { name: 'Closed Won', count: 200, percentage: 13.3 },
    ],
  },
};

export const RetentionFunnel: Story = {
  args: {
    data: [
      { name: 'Active Patients (Jan)', count: 1000, percentage: 100, dropoff: 5 },
      { name: 'Active (Feb)', count: 950, percentage: 95, dropoff: 4.2 },
      { name: 'Active (Mar)', count: 910, percentage: 91, dropoff: 3.3 },
      { name: 'Active (Apr)', count: 880, percentage: 88, dropoff: 2.3 },
      { name: 'Active (May)', count: 860, percentage: 86 },
    ],
  },
};

export const HighConversion: Story = {
  args: {
    data: [
      { name: 'Visitors', count: 500, percentage: 100, dropoff: 10 },
      { name: 'Engaged', count: 450, percentage: 90, dropoff: 8.9 },
      { name: 'Interested', count: 410, percentage: 82, dropoff: 7.3 },
      { name: 'Ready', count: 380, percentage: 76, dropoff: 5.3 },
      { name: 'Converted', count: 360, percentage: 72 },
    ],
  },
};

export const LowConversion: Story = {
  args: {
    data: [
      { name: 'Impressions', count: 10000, percentage: 100, dropoff: 95 },
      { name: 'Clicks', count: 500, percentage: 5, dropoff: 60 },
      { name: 'Form Views', count: 200, percentage: 2, dropoff: 50 },
      { name: 'Submissions', count: 100, percentage: 1, dropoff: 30 },
      { name: 'Conversions', count: 70, percentage: 0.7 },
    ],
  },
};
