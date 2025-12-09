import type { Metadata } from 'next';
import { osaxFixMetadata, osaxFixJsonLd } from './metadata';
import OsaxFixLandingPage from './landing-page';

/**
 * OSAX-FIX Landing Page
 *
 * Server component wrapper that:
 * 1. Exports SEO metadata
 * 2. Injects JSON-LD structured data
 * 3. Renders the client-side landing page
 *
 * Target: 300 patients/month for medicalcor.ro
 */

export const metadata: Metadata = osaxFixMetadata;

export default function OsaxFixPage() {
  return (
    <>
      {/* JSON-LD Structured Data for Rich Snippets */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(osaxFixJsonLd) }}
      />

      {/* Main Landing Page */}
      <OsaxFixLandingPage />
    </>
  );
}
