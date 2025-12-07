import type { Meta, StoryObj } from '@storybook/react';
import { PatientTimeline } from '../patient-timeline';
import type { PatientActivity } from '@/lib/patients';

const sampleActivities: PatientActivity[] = [
  {
    id: '1',
    type: 'call',
    title: 'Apel telefonic',
    description: 'Pacientul a confirmat programarea pentru consultație',
    timestamp: new Date(Date.now() - 5 * 60 * 1000), // 5 min ago
    user: 'Ana Popa',
  },
  {
    id: '2',
    type: 'message',
    title: 'Mesaj WhatsApp',
    description: 'Trimis reminder pentru programare',
    timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000), // 2 hours ago
    user: 'Sistem',
  },
  {
    id: '3',
    type: 'appointment',
    title: 'Consultație finalizată',
    description: 'Consultație inițială - Plan tratament All-on-X',
    timestamp: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000), // 2 days ago
    user: 'Dr. Maria Ionescu',
  },
  {
    id: '4',
    type: 'email',
    title: 'Email trimis',
    description: 'Plan de tratament și estimare costuri',
    timestamp: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000), // 3 days ago
    user: 'Ana Popa',
  },
  {
    id: '5',
    type: 'note',
    title: 'Notă adăugată',
    description: 'Pacientul este interesat de finanțare în rate',
    timestamp: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000), // 5 days ago
    user: 'Ana Popa',
  },
  {
    id: '6',
    type: 'status_change',
    title: 'Status actualizat',
    description: 'Lead → Contactat',
    timestamp: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // 7 days ago
    user: 'Sistem',
  },
  {
    id: '7',
    type: 'document',
    title: 'Document încărcat',
    description: 'Radiografie panoramică',
    timestamp: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000), // 10 days ago
    user: 'Dr. Maria Ionescu',
  },
];

const meta = {
  title: 'Patients/PatientTimeline',
  component: PatientTimeline,
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <div className="max-w-2xl p-4 border rounded-lg bg-card">
        <h3 className="font-semibold mb-4">Istoric activitate</h3>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof PatientTimeline>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    activities: sampleActivities,
  },
};

export const Empty: Story = {
  args: {
    activities: [],
  },
};

export const SingleActivity: Story = {
  args: {
    activities: [sampleActivities[0]],
  },
};

export const CallsOnly: Story = {
  args: {
    activities: sampleActivities.filter((a) => a.type === 'call'),
  },
};

export const MessagesOnly: Story = {
  args: {
    activities: [
      {
        id: '1',
        type: 'message',
        title: 'Mesaj WhatsApp',
        description: 'Trimis reminder pentru programare',
        timestamp: new Date(Date.now() - 30 * 60 * 1000),
        user: 'Sistem',
      },
      {
        id: '2',
        type: 'message',
        title: 'Mesaj WhatsApp',
        description: 'Pacientul a răspuns: "Vă mulțumesc, voi fi acolo"',
        timestamp: new Date(Date.now() - 25 * 60 * 1000),
        user: 'Ion Popescu',
      },
      {
        id: '3',
        type: 'message',
        title: 'Mesaj WhatsApp',
        description: 'Confirmare finală trimisă',
        timestamp: new Date(Date.now() - 20 * 60 * 1000),
        user: 'Ana Popa',
      },
    ],
  },
};

export const RecentActivity: Story = {
  args: {
    activities: [
      {
        id: '1',
        type: 'call',
        title: 'Apel telefonic',
        description: 'Verificare stare după procedură',
        timestamp: new Date(Date.now() - 30 * 1000), // Just now
        user: 'Ana Popa',
      },
      {
        id: '2',
        type: 'note',
        title: 'Notă adăugată',
        description: 'Pacientul se simte bine, fără complicații',
        timestamp: new Date(Date.now() - 2 * 60 * 1000), // 2 min ago
        user: 'Ana Popa',
      },
    ],
  },
};

export const AllActivityTypes: Story = {
  args: {
    activities: [
      {
        id: '1',
        type: 'call',
        title: 'Apel telefonic',
        description: 'Apel de confirmare',
        timestamp: new Date(Date.now() - 1 * 60 * 60 * 1000),
        user: 'Ana Popa',
      },
      {
        id: '2',
        type: 'message',
        title: 'Mesaj WhatsApp',
        description: 'Reminder automat',
        timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000),
        user: 'Sistem',
      },
      {
        id: '3',
        type: 'email',
        title: 'Email trimis',
        description: 'Confirmare programare',
        timestamp: new Date(Date.now() - 3 * 60 * 60 * 1000),
        user: 'Ana Popa',
      },
      {
        id: '4',
        type: 'appointment',
        title: 'Programare creată',
        description: 'Consultație inițială',
        timestamp: new Date(Date.now() - 4 * 60 * 60 * 1000),
        user: 'Dr. Maria Ionescu',
      },
      {
        id: '5',
        type: 'note',
        title: 'Notă adăugată',
        description: 'Observații importante',
        timestamp: new Date(Date.now() - 5 * 60 * 60 * 1000),
        user: 'Ana Popa',
      },
      {
        id: '6',
        type: 'status_change',
        title: 'Status schimbat',
        description: 'Lead → Programat',
        timestamp: new Date(Date.now() - 6 * 60 * 60 * 1000),
        user: 'Sistem',
      },
      {
        id: '7',
        type: 'document',
        title: 'Document încărcat',
        description: 'CT Scan',
        timestamp: new Date(Date.now() - 7 * 60 * 60 * 1000),
        user: 'Dr. Maria Ionescu',
      },
    ],
  },
};

export const LongHistory: Story = {
  args: {
    activities: Array.from({ length: 15 }, (_, i) => ({
      id: String(i + 1),
      type: (['call', 'message', 'email', 'appointment', 'note'] as const)[i % 5],
      title: `Activitate ${i + 1}`,
      description: `Descriere pentru activitatea ${i + 1}`,
      timestamp: new Date(Date.now() - i * 24 * 60 * 60 * 1000),
      user: ['Ana Popa', 'Dr. Maria Ionescu', 'Sistem'][i % 3],
    })),
  },
};
