import type { Meta, StoryObj } from '@storybook/react';
import { fn } from '@storybook/test';
import { PatientHeader } from '../patient-header';
import type { PatientDetail } from '@/lib/patients';

const samplePatient: PatientDetail = {
  id: 'patient-001',
  firstName: 'Ion',
  lastName: 'Popescu',
  dateOfBirth: new Date('1985-03-15'),
  gender: 'male',
  cnp: '1850315123456',
  contact: {
    phone: '+40 721 234 567',
    email: 'ion.popescu@example.com',
    whatsapp: '+40 721 234 567',
    preferredChannel: 'whatsapp',
  },
  address: {
    street: 'Str. Victoriei 123',
    city: 'București',
    county: 'București',
    postalCode: '010001',
  },
  status: 'patient',
  source: 'referral',
  tags: ['VIP', 'All-on-X', 'Insurance'],
  assignedTo: 'Dr. Maria Ionescu',
  createdAt: new Date('2024-01-15'),
  updatedAt: new Date('2024-12-01'),
  appointments: [],
  documents: [],
  activities: [],
  notes: [],
  procedures: [],
  appointmentCount: 12,
  lastVisit: new Date('2024-11-28'),
  nextAppointment: new Date('2024-12-15'),
};

const meta = {
  title: 'Patients/PatientHeader',
  component: PatientHeader,
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
  argTypes: {
    onEdit: {
      action: 'edit clicked',
    },
  },
  args: {
    onEdit: fn(),
  },
  decorators: [
    (Story) => (
      <div className="max-w-4xl">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof PatientHeader>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    patient: samplePatient,
  },
};

export const LeadStatus: Story = {
  args: {
    patient: {
      ...samplePatient,
      status: 'lead',
      tags: ['Hot Lead'],
    },
  },
};

export const ContactedStatus: Story = {
  args: {
    patient: {
      ...samplePatient,
      status: 'contacted',
      tags: ['Follow-up'],
    },
  },
};

export const ScheduledStatus: Story = {
  args: {
    patient: {
      ...samplePatient,
      status: 'scheduled',
      tags: ['Consultation'],
    },
  },
};

export const InactiveStatus: Story = {
  args: {
    patient: {
      ...samplePatient,
      status: 'inactive',
      tags: [],
    },
  },
};

export const FemalePatient: Story = {
  args: {
    patient: {
      ...samplePatient,
      firstName: 'Maria',
      lastName: 'Ionescu',
      gender: 'female',
      dateOfBirth: new Date('1990-07-22'),
      cnp: '2900722123456',
      contact: {
        ...samplePatient.contact,
        email: 'maria.ionescu@example.com',
        preferredChannel: 'email',
      },
    },
  },
};

export const MinimalInfo: Story = {
  args: {
    patient: {
      ...samplePatient,
      dateOfBirth: undefined,
      gender: undefined,
      cnp: undefined,
      address: undefined,
      contact: {
        phone: '+40 722 345 678',
        preferredChannel: 'phone',
      },
      tags: [],
    },
  },
};

export const WithManyTags: Story = {
  args: {
    patient: {
      ...samplePatient,
      tags: ['VIP', 'All-on-X', 'Insurance', 'Emergency', 'Returning', 'Premium'],
    },
  },
};

export const NoWhatsApp: Story = {
  args: {
    patient: {
      ...samplePatient,
      contact: {
        phone: '+40 721 234 567',
        email: 'ion.popescu@example.com',
        preferredChannel: 'phone',
      },
    },
  },
};

export const AllStatuses: Story = {
  render: () => (
    <div className="space-y-6">
      {(['lead', 'contacted', 'scheduled', 'patient', 'inactive'] as const).map((status) => (
        <PatientHeader
          key={status}
          patient={{ ...samplePatient, status }}
          onEdit={() => {}}
        />
      ))}
    </div>
  ),
};
