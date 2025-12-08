import type { Meta, StoryObj } from '@storybook/react';
import { fn } from 'storybook/test';
import { PatientNotes } from '../patient-notes';
import type { PatientNote } from '@/lib/patients';

const sampleNotes: PatientNote[] = [
  {
    id: '1',
    content:
      'Pacientul este interesat de procedura All-on-X. A menționat că are probleme dentare de mult timp și caută o soluție permanentă.',
    createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
    createdBy: 'Ana Popa',
    isPinned: true,
    category: 'medical',
  },
  {
    id: '2',
    content:
      'ATENȚIE: Pacientul are alergie la penicilină. Trebuie folosite antibiotice alternative.',
    createdAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
    createdBy: 'Dr. Maria Ionescu',
    isPinned: true,
    category: 'medical',
  },
  {
    id: '3',
    content:
      'Pacientul a solicitat opțiune de plată în rate. S-a agreat plan de finanțare pe 12 luni.',
    createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
    createdBy: 'Ana Popa',
    isPinned: false,
    category: 'billing',
  },
  {
    id: '4',
    content: 'Follow-up necesar după 2 săptămâni pentru verificare vindecare.',
    createdAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
    createdBy: 'Dr. Maria Ionescu',
    isPinned: false,
    category: 'follow-up',
  },
  {
    id: '5',
    content: 'Preferă să fie contactat dimineața, între 9-11.',
    createdAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
    createdBy: 'Ana Popa',
    isPinned: false,
    category: 'general',
  },
];

const meta = {
  title: 'Patients/PatientNotes',
  component: PatientNotes,
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
  args: {
    onAddNote: fn(),
  },
  decorators: [
    (Story) => (
      <div className="max-w-2xl p-4 border rounded-lg bg-card">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof PatientNotes>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    notes: sampleNotes,
  },
};

export const Empty: Story = {
  args: {
    notes: [],
  },
};

export const OnlyPinned: Story = {
  args: {
    notes: sampleNotes.filter((n) => n.isPinned),
  },
};

export const NoPinned: Story = {
  args: {
    notes: sampleNotes.filter((n) => !n.isPinned),
  },
};

export const SingleNote: Story = {
  args: {
    notes: [sampleNotes[0]],
  },
};

export const MedicalNotes: Story = {
  args: {
    notes: [
      {
        id: '1',
        content:
          'Pacientul prezintă sensibilitate la temperaturi extreme. Recomand evitarea băuturilor foarte reci sau foarte calde.',
        createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
        createdBy: 'Dr. Maria Ionescu',
        isPinned: true,
        category: 'medical',
      },
      {
        id: '2',
        content:
          'Radiografia arată resorbție osoasă moderată în zona posterioară. Necesită evaluare suplimentară pentru implant.',
        createdAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
        createdBy: 'Dr. Maria Ionescu',
        isPinned: false,
        category: 'medical',
      },
      {
        id: '3',
        content:
          'Istoric de diabet tip 2 controlat. HbA1c în parametri acceptabili pentru proceduri chirurgicale.',
        createdAt: new Date(Date.now() - 48 * 60 * 60 * 1000),
        createdBy: 'Dr. Maria Ionescu',
        isPinned: true,
        category: 'medical',
      },
    ],
  },
};

export const BillingNotes: Story = {
  args: {
    notes: [
      {
        id: '1',
        content: 'Avans 30% achitat - €3,000. Restul în 6 rate lunare.',
        createdAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
        createdBy: 'Ana Popa',
        isPinned: false,
        category: 'billing',
      },
      {
        id: '2',
        content: 'Factură trimisă pentru consultație - €150',
        createdAt: new Date(Date.now() - 48 * 60 * 60 * 1000),
        createdBy: 'Ana Popa',
        isPinned: false,
        category: 'billing',
      },
    ],
  },
};

export const FollowUpNotes: Story = {
  args: {
    notes: [
      {
        id: '1',
        content: 'Control post-operator la 2 săptămâni - de programat',
        createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
        createdBy: 'Dr. Maria Ionescu',
        isPinned: true,
        category: 'follow-up',
      },
      {
        id: '2',
        content: 'Sună pacientul mâine pentru a verifica evoluția vindecării',
        createdAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
        createdBy: 'Ana Popa',
        isPinned: false,
        category: 'follow-up',
      },
    ],
  },
};

export const LongContent: Story = {
  args: {
    notes: [
      {
        id: '1',
        content: `Plan de tratament complet discutat cu pacientul:

1. Faza 1 - Pregătire (2 săptămâni)
   - Igienizare profesională
   - Tratament parodontal zonele afectate
   - Extracții dinți irecuperabili

2. Faza 2 - Chirurgicală (1 zi)
   - Inserare 4 implanturi maxilar superior
   - Inserare 4 implanturi mandibulă
   - Proteze provizorii fixe

3. Faza 3 - Vindecare (3-4 luni)
   - Controale periodice
   - Ajustări proteză provizorie

4. Faza 4 - Finalizare
   - Proteze definitive ceramică
   - Control final și instruire întreținere`,
        createdAt: new Date(Date.now() - 48 * 60 * 60 * 1000),
        createdBy: 'Dr. Maria Ionescu',
        isPinned: true,
        category: 'medical',
      },
    ],
  },
};

export const AllCategories: Story = {
  args: {
    notes: [
      {
        id: '1',
        content: 'Notă generală despre pacient',
        createdAt: new Date(Date.now() - 1 * 60 * 60 * 1000),
        createdBy: 'Ana Popa',
        category: 'general',
      },
      {
        id: '2',
        content: 'Informații medicale importante',
        createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
        createdBy: 'Dr. Maria Ionescu',
        category: 'medical',
        isPinned: true,
      },
      {
        id: '3',
        content: 'Detalii facturare',
        createdAt: new Date(Date.now() - 3 * 60 * 60 * 1000),
        createdBy: 'Ana Popa',
        category: 'billing',
      },
      {
        id: '4',
        content: 'Task de follow-up',
        createdAt: new Date(Date.now() - 4 * 60 * 60 * 1000),
        createdBy: 'Ana Popa',
        category: 'follow-up',
      },
    ],
  },
};
