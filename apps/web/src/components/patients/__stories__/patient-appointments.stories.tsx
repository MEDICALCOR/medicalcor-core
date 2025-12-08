import type { Meta, StoryObj } from '@storybook/react';
import { fn } from 'storybook/test';
import { PatientAppointments } from '../patient-appointments';
import type { PatientAppointment } from '@/lib/patients';

const futureDate = (daysFromNow: number) => {
  const date = new Date();
  date.setDate(date.getDate() + daysFromNow);
  return date;
};

const pastDate = (daysAgo: number) => {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  return date;
};

const sampleAppointments: PatientAppointment[] = [
  {
    id: '1',
    date: futureDate(3),
    time: '10:00',
    duration: 60,
    type: 'Consultație All-on-X',
    doctor: 'Dr. Maria Ionescu',
    location: 'Cabinet 1',
    status: 'confirmed',
  },
  {
    id: '2',
    date: futureDate(14),
    time: '14:30',
    duration: 180,
    type: 'Procedură chirurgicală',
    doctor: 'Dr. Maria Ionescu',
    location: 'Sala Operații',
    status: 'scheduled',
  },
  {
    id: '3',
    date: pastDate(7),
    time: '11:00',
    duration: 45,
    type: 'Consultație inițială',
    doctor: 'Dr. Maria Ionescu',
    location: 'Cabinet 1',
    status: 'completed',
    notes: 'Plan de tratament prezentat și acceptat',
  },
  {
    id: '4',
    date: pastDate(30),
    time: '09:00',
    duration: 30,
    type: 'Control periodic',
    doctor: 'Dr. Ana Popa',
    location: 'Cabinet 2',
    status: 'completed',
    notes: 'Igienizare efectuată',
  },
  {
    id: '5',
    date: pastDate(60),
    time: '15:00',
    duration: 60,
    type: 'Tratament carie',
    doctor: 'Dr. Maria Ionescu',
    location: 'Cabinet 1',
    status: 'cancelled',
    notes: 'Anulat de pacient - reprogramat',
  },
  {
    id: '6',
    date: pastDate(90),
    time: '10:30',
    duration: 30,
    type: 'Consultație',
    doctor: 'Dr. Ana Popa',
    location: 'Cabinet 2',
    status: 'no-show',
  },
];

const meta = {
  title: 'Patients/PatientAppointments',
  component: PatientAppointments,
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
  args: {
    onNewAppointment: fn(),
  },
  decorators: [
    (Story) => (
      <div className="max-w-2xl p-4 border rounded-lg bg-card">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof PatientAppointments>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    appointments: sampleAppointments,
  },
};

export const Empty: Story = {
  args: {
    appointments: [],
  },
};

export const OnlyUpcoming: Story = {
  args: {
    appointments: sampleAppointments.filter((apt) => apt.date > new Date()),
  },
};

export const OnlyPast: Story = {
  args: {
    appointments: sampleAppointments.filter((apt) => apt.date <= new Date()),
  },
};

export const SingleUpcoming: Story = {
  args: {
    appointments: [
      {
        id: '1',
        date: futureDate(1),
        time: '09:00',
        duration: 60,
        type: 'Consultație urgentă',
        doctor: 'Dr. Maria Ionescu',
        location: 'Cabinet 1',
        status: 'confirmed',
      },
    ],
  },
};

export const AllStatuses: Story = {
  args: {
    appointments: [
      {
        id: '1',
        date: futureDate(1),
        time: '09:00',
        duration: 30,
        type: 'Programare programată',
        doctor: 'Dr. Maria Ionescu',
        status: 'scheduled',
      },
      {
        id: '2',
        date: futureDate(2),
        time: '10:00',
        duration: 30,
        type: 'Programare confirmată',
        doctor: 'Dr. Maria Ionescu',
        status: 'confirmed',
      },
      {
        id: '3',
        date: pastDate(1),
        time: '11:00',
        duration: 30,
        type: 'Programare finalizată',
        doctor: 'Dr. Maria Ionescu',
        status: 'completed',
      },
      {
        id: '4',
        date: pastDate(2),
        time: '12:00',
        duration: 30,
        type: 'Programare anulată',
        doctor: 'Dr. Maria Ionescu',
        status: 'cancelled',
      },
      {
        id: '5',
        date: pastDate(3),
        time: '13:00',
        duration: 30,
        type: 'Neprezentare',
        doctor: 'Dr. Maria Ionescu',
        status: 'no-show',
      },
    ],
  },
};

export const MultipleDoctors: Story = {
  args: {
    appointments: [
      {
        id: '1',
        date: futureDate(1),
        time: '09:00',
        duration: 60,
        type: 'Consultație ortodonție',
        doctor: 'Dr. Elena Gheorghe',
        location: 'Cabinet Ortodonție',
        status: 'confirmed',
      },
      {
        id: '2',
        date: futureDate(5),
        time: '14:00',
        duration: 120,
        type: 'Procedură implant',
        doctor: 'Dr. Maria Ionescu',
        location: 'Sala Operații',
        status: 'scheduled',
      },
      {
        id: '3',
        date: futureDate(7),
        time: '10:00',
        duration: 45,
        type: 'Control parodontal',
        doctor: 'Dr. Ana Popa',
        location: 'Cabinet 2',
        status: 'scheduled',
      },
    ],
  },
};

export const LongDurationProcedures: Story = {
  args: {
    appointments: [
      {
        id: '1',
        date: futureDate(7),
        time: '08:00',
        duration: 360,
        type: 'Procedură All-on-X completă',
        doctor: 'Dr. Maria Ionescu',
        location: 'Sala Operații',
        status: 'confirmed',
        notes: 'Anestezie generală - pacientul trebuie să fie à jeun',
      },
      {
        id: '2',
        date: futureDate(21),
        time: '09:00',
        duration: 120,
        type: 'Control și ajustări proteză',
        doctor: 'Dr. Maria Ionescu',
        location: 'Cabinet 1',
        status: 'scheduled',
      },
    ],
  },
};

export const WithNotes: Story = {
  args: {
    appointments: [
      {
        id: '1',
        date: pastDate(1),
        time: '10:00',
        duration: 60,
        type: 'Consultație',
        doctor: 'Dr. Maria Ionescu',
        status: 'completed',
        notes: 'Pacientul a prezentat dureri la masticație. Recomandare: CT pentru evaluare.',
      },
      {
        id: '2',
        date: pastDate(14),
        time: '11:00',
        duration: 45,
        type: 'Control',
        doctor: 'Dr. Ana Popa',
        status: 'completed',
        notes: 'Evoluție favorabilă. Următorul control peste 3 luni.',
      },
      {
        id: '3',
        date: pastDate(30),
        time: '09:00',
        duration: 30,
        type: 'Urgență',
        doctor: 'Dr. Maria Ionescu',
        status: 'completed',
        notes: 'Abces dentar tratat. Prescripție antibiotice 7 zile.',
      },
    ],
  },
};

export const BusySchedule: Story = {
  args: {
    appointments: Array.from({ length: 10 }, (_, i) => ({
      id: String(i + 1),
      date: i < 5 ? futureDate(i + 1) : pastDate((i - 4) * 7),
      time: `${9 + (i % 8)}:00`,
      duration: [30, 45, 60, 90, 120][i % 5],
      type: ['Control', 'Consultație', 'Tratament', 'Procedură', 'Igienizare'][i % 5],
      doctor: ['Dr. Maria Ionescu', 'Dr. Ana Popa', 'Dr. Elena Gheorghe'][i % 3],
      location: ['Cabinet 1', 'Cabinet 2', 'Sala Operații'][i % 3],
      status:
        i < 5
          ? (['scheduled', 'confirmed'] as const)[i % 2]
          : (['completed', 'completed', 'cancelled', 'no-show', 'completed'] as const)[i % 5],
    })),
  },
};
