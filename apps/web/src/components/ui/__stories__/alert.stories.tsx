import type { Meta, StoryObj } from '@storybook/react';
import { AlertCircle, CheckCircle, Info as InfoIcon, Terminal, XCircle } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '../alert';

const meta = {
  title: 'UI/Alert',
  component: Alert,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  argTypes: {
    variant: {
      control: 'select',
      options: ['default', 'destructive'],
      description: 'The visual style of the alert',
    },
  },
  decorators: [
    (Story) => (
      <div className="w-[500px]">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Alert>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {},
  render: () => (
    <Alert>
      <Terminal className="h-4 w-4" />
      <AlertTitle>Heads up!</AlertTitle>
      <AlertDescription>You can add components to your app using the CLI.</AlertDescription>
    </Alert>
  ),
};

export const Destructive: Story = {
  args: { variant: 'destructive' },
  render: () => (
    <Alert variant="destructive">
      <AlertCircle className="h-4 w-4" />
      <AlertTitle>Error</AlertTitle>
      <AlertDescription>Your session has expired. Please log in again.</AlertDescription>
    </Alert>
  ),
};

export const Information: Story = {
  args: {},
  render: () => (
    <Alert>
      <InfoIcon className="h-4 w-4" />
      <AlertTitle>Information</AlertTitle>
      <AlertDescription>
        This patient has an upcoming appointment scheduled for tomorrow at 10:00 AM.
      </AlertDescription>
    </Alert>
  ),
};

export const Success: Story = {
  render: () => (
    <Alert className="border-green-500/50 text-green-700 dark:text-green-400 [&>svg]:text-green-600">
      <CheckCircle className="h-4 w-4" />
      <AlertTitle>Success</AlertTitle>
      <AlertDescription>The appointment has been successfully booked.</AlertDescription>
    </Alert>
  ),
};

export const Warning: Story = {
  render: () => (
    <Alert className="border-yellow-500/50 text-yellow-700 dark:text-yellow-400 [&>svg]:text-yellow-600">
      <AlertCircle className="h-4 w-4" />
      <AlertTitle>Warning</AlertTitle>
      <AlertDescription>
        This patient has outstanding balance. Please collect payment before next appointment.
      </AlertDescription>
    </Alert>
  ),
};

export const WithoutTitle: Story = {
  args: {},
  render: () => (
    <Alert>
      <InfoIcon className="h-4 w-4" />
      <AlertDescription>
        Your password will expire in 7 days. Consider updating it soon.
      </AlertDescription>
    </Alert>
  ),
};

export const WithoutIcon: Story = {
  render: () => (
    <Alert>
      <AlertTitle>Note</AlertTitle>
      <AlertDescription>This is a simple alert without an icon.</AlertDescription>
    </Alert>
  ),
};

export const PatientAllergy: Story = {
  render: () => (
    <Alert variant="destructive">
      <XCircle className="h-4 w-4" />
      <AlertTitle>Allergy Alert</AlertTitle>
      <AlertDescription>
        <strong>Patient is allergic to:</strong> Penicillin, Latex
        <br />
        Please ensure all staff are aware before any procedure.
      </AlertDescription>
    </Alert>
  ),
};

export const AppointmentReminder: Story = {
  args: {},
  render: () => (
    <Alert className="border-blue-500/50 text-blue-700 dark:text-blue-400 [&>svg]:text-blue-600">
      <InfoIcon className="h-4 w-4" />
      <AlertTitle>Appointment Reminder</AlertTitle>
      <AlertDescription>
        You have 3 appointments scheduled for today:
        <ul className="mt-2 ml-4 list-disc text-sm">
          <li>09:00 - Ion Popescu (Checkup)</li>
          <li>11:30 - Maria Ionescu (Cleaning)</li>
          <li>14:00 - Alexandru Dumitrescu (Consultation)</li>
        </ul>
      </AlertDescription>
    </Alert>
  ),
};

export const MultipleAlerts: Story = {
  render: () => (
    <div className="space-y-4">
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Payment Failed</AlertTitle>
        <AlertDescription>Unable to process payment for invoice #INV-2024-001.</AlertDescription>
      </Alert>
      <Alert className="border-yellow-500/50 text-yellow-700 dark:text-yellow-400 [&>svg]:text-yellow-600">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Sync Pending</AlertTitle>
        <AlertDescription>
          Some changes haven&apos;t been synced yet. Check your connection.
        </AlertDescription>
      </Alert>
      <Alert className="border-green-500/50 text-green-700 dark:text-green-400 [&>svg]:text-green-600">
        <CheckCircle className="h-4 w-4" />
        <AlertTitle>Backup Complete</AlertTitle>
        <AlertDescription>All data has been successfully backed up.</AlertDescription>
      </Alert>
    </div>
  ),
};
