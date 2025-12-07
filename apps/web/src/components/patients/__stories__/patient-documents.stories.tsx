import type { Meta, StoryObj } from '@storybook/react';
import { fn } from '@storybook/test';
import { PatientDocuments } from '../patient-documents';
import type { PatientDocument } from '@/lib/patients';

const sampleDocuments: PatientDocument[] = [
  {
    id: '1',
    name: 'Radiografie_panoramica_2024.jpg',
    type: 'imaging',
    mimeType: 'image/jpeg',
    size: 2.5 * 1024 * 1024, // 2.5 MB
    uploadedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
    uploadedBy: 'Dr. Maria Ionescu',
  },
  {
    id: '2',
    name: 'CT_Scan_maxilar.pdf',
    type: 'imaging',
    mimeType: 'application/pdf',
    size: 15 * 1024 * 1024, // 15 MB
    uploadedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
    uploadedBy: 'Dr. Maria Ionescu',
  },
  {
    id: '3',
    name: 'Fisa_medicala.pdf',
    type: 'medical_record',
    mimeType: 'application/pdf',
    size: 156 * 1024, // 156 KB
    uploadedAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
    uploadedBy: 'Ana Popa',
  },
  {
    id: '4',
    name: 'Rezultate_analize_sange.pdf',
    type: 'lab_result',
    mimeType: 'application/pdf',
    size: 245 * 1024, // 245 KB
    uploadedAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
    uploadedBy: 'Ion Popescu',
  },
  {
    id: '5',
    name: 'Consimtamant_procedura.pdf',
    type: 'consent',
    mimeType: 'application/pdf',
    size: 89 * 1024, // 89 KB
    uploadedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
    uploadedBy: 'Ana Popa',
  },
  {
    id: '6',
    name: 'Reteta_antibiotice.pdf',
    type: 'prescription',
    mimeType: 'application/pdf',
    size: 45 * 1024, // 45 KB
    uploadedAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
    uploadedBy: 'Dr. Maria Ionescu',
  },
];

const meta = {
  title: 'Patients/PatientDocuments',
  component: PatientDocuments,
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
  args: {
    onUpload: fn(),
  },
  decorators: [
    (Story) => (
      <div className="max-w-2xl p-4 border rounded-lg bg-card">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof PatientDocuments>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    documents: sampleDocuments,
  },
};

export const Empty: Story = {
  args: {
    documents: [],
  },
};

export const SingleDocument: Story = {
  args: {
    documents: [sampleDocuments[0]],
  },
};

export const ImagingOnly: Story = {
  args: {
    documents: sampleDocuments.filter((d) => d.type === 'imaging'),
  },
};

export const MedicalRecords: Story = {
  args: {
    documents: [
      {
        id: '1',
        name: 'Fisa_medicala_completa.pdf',
        type: 'medical_record',
        mimeType: 'application/pdf',
        size: 2.1 * 1024 * 1024,
        uploadedAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
        uploadedBy: 'Ana Popa',
      },
      {
        id: '2',
        name: 'Istoric_medical_anterior.pdf',
        type: 'medical_record',
        mimeType: 'application/pdf',
        size: 1.5 * 1024 * 1024,
        uploadedAt: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000),
        uploadedBy: 'Clinica Anterioara',
      },
      {
        id: '3',
        name: 'Alergii_si_medicatie.pdf',
        type: 'medical_record',
        mimeType: 'application/pdf',
        size: 78 * 1024,
        uploadedAt: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000),
        uploadedBy: 'Ion Popescu',
      },
    ],
  },
};

export const LabResults: Story = {
  args: {
    documents: [
      {
        id: '1',
        name: 'Hemoleucograma_completa.pdf',
        type: 'lab_result',
        mimeType: 'application/pdf',
        size: 156 * 1024,
        uploadedAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
        uploadedBy: 'Laborator MedLife',
      },
      {
        id: '2',
        name: 'Coagulograma.pdf',
        type: 'lab_result',
        mimeType: 'application/pdf',
        size: 89 * 1024,
        uploadedAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
        uploadedBy: 'Laborator MedLife',
      },
      {
        id: '3',
        name: 'Glicemie_HbA1c.pdf',
        type: 'lab_result',
        mimeType: 'application/pdf',
        size: 67 * 1024,
        uploadedAt: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000),
        uploadedBy: 'Laborator Regina Maria',
      },
    ],
  },
};

export const ConsentForms: Story = {
  args: {
    documents: [
      {
        id: '1',
        name: 'Consimtamant_GDPR.pdf',
        type: 'consent',
        mimeType: 'application/pdf',
        size: 45 * 1024,
        uploadedAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
        uploadedBy: 'Ana Popa',
      },
      {
        id: '2',
        name: 'Consimtamant_procedura_chirurgicala.pdf',
        type: 'consent',
        mimeType: 'application/pdf',
        size: 78 * 1024,
        uploadedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
        uploadedBy: 'Ana Popa',
      },
      {
        id: '3',
        name: 'Consimtamant_anestezie.pdf',
        type: 'consent',
        mimeType: 'application/pdf',
        size: 56 * 1024,
        uploadedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
        uploadedBy: 'Ana Popa',
      },
    ],
  },
};

export const MixedFileTypes: Story = {
  args: {
    documents: [
      {
        id: '1',
        name: 'Radiografie.jpg',
        type: 'imaging',
        mimeType: 'image/jpeg',
        size: 3.2 * 1024 * 1024,
        uploadedAt: new Date(),
      },
      {
        id: '2',
        name: 'CT_Scan.png',
        type: 'imaging',
        mimeType: 'image/png',
        size: 8.5 * 1024 * 1024,
        uploadedAt: new Date(),
      },
      {
        id: '3',
        name: 'Raport_medical.pdf',
        type: 'medical_record',
        mimeType: 'application/pdf',
        size: 1.2 * 1024 * 1024,
        uploadedAt: new Date(),
      },
      {
        id: '4',
        name: 'Date_pacient.xlsx',
        type: 'other',
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        size: 45 * 1024,
        uploadedAt: new Date(),
      },
    ],
  },
};

export const LargeFileList: Story = {
  args: {
    documents: Array.from({ length: 20 }, (_, i) => ({
      id: String(i + 1),
      name: `Document_${i + 1}.pdf`,
      type: (['imaging', 'medical_record', 'lab_result', 'consent', 'prescription', 'other'] as const)[i % 6],
      mimeType: 'application/pdf',
      size: Math.floor(Math.random() * 5 * 1024 * 1024),
      uploadedAt: new Date(Date.now() - i * 24 * 60 * 60 * 1000),
      uploadedBy: ['Ana Popa', 'Dr. Maria Ionescu', 'Ion Popescu'][i % 3],
    })),
  },
};
