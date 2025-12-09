import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Consultație Video | MedicalCor Cortex',
  description: 'Camera de consultație video HIPAA/GDPR compliantă',
};

export default function ConsultationLayout({ children }: { children: React.ReactNode }) {
  return children;
}
