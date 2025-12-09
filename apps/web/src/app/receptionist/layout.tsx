import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Reception Dashboard | MedicalCor',
  description: 'Simple, intuitive dashboard for front-desk staff',
};

export default function ReceptionistLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
