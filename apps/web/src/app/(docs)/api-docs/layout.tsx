import type { Metadata } from 'next';
import '../../globals.css';

export const metadata: Metadata = {
  title: 'API Documentation | MedicalCor',
  description: 'MedicalCor OSAX API Documentation - Interactive API reference for developers',
};

/**
 * Custom layout for API documentation pages
 * This layout excludes the sidebar and header for a clean documentation experience
 */
export default function ApiDocsLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="icon" href="/favicon.ico" sizes="any" />
      </head>
      <body className="min-h-screen bg-white dark:bg-slate-900">{children}</body>
    </html>
  );
}
