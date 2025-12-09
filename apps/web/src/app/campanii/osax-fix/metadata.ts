import type { Metadata } from 'next';

/**
 * SEO Metadata for OSAX-FIX Landing Page
 *
 * Optimized for:
 * - Google Ads Quality Score
 * - Organic search ranking
 * - Social media sharing
 * - Rich snippets
 */

export const osaxFixMetadata: Metadata = {
  title: 'All-on-4 Dinți Ficși în 24 Ore | Consultație GRATUITĂ | MedicalCor',
  description:
    'Scapă de proteză! Dinți ficși în doar 24 ore cu tehnologia All-on-4. Consultație + CT 3D GRATUIT. Rate de la 499 lei/lună, 0% dobândă. Garanție 10 ani. Programează acum!',
  keywords: [
    'all-on-4',
    'all-on-4 pret',
    'all-on-4 romania',
    'all-on-4 bucuresti',
    'dinti ficsi',
    'implant dentar pret',
    'implant dentar bucuresti',
    'fatete dentare',
    'stomatologie bucuresti',
    'clinica dentara',
    'proteza dentara fixa',
    'implant all on 4',
    'pret all on 4',
    'all on 6',
    'dinti intr-o zi',
  ],
  authors: [{ name: 'MedicalCor', url: 'https://medicalcor.ro' }],
  creator: 'MedicalCor',
  publisher: 'MedicalCor',
  alternates: {
    canonical: 'https://medicalcor.ro/campanii/osax-fix',
    languages: {
      'ro-RO': 'https://medicalcor.ro/campanii/osax-fix',
    },
  },
  openGraph: {
    type: 'website',
    locale: 'ro_RO',
    url: 'https://medicalcor.ro/campanii/osax-fix',
    siteName: 'MedicalCor',
    title: 'Dinți Ficși în 24 Ore cu All-on-4 | MedicalCor',
    description:
      'Scapă de proteză! Dinți ficși în doar 24 ore. Consultație GRATUITĂ. Rate de la 499 lei/lună.',
    images: [
      {
        url: 'https://medicalcor.ro/og/osax-fix-hero.jpg',
        width: 1200,
        height: 630,
        alt: 'MedicalCor All-on-4 - Dinți ficși în 24 ore',
      },
      {
        url: 'https://medicalcor.ro/og/osax-fix-square.jpg',
        width: 1080,
        height: 1080,
        alt: 'MedicalCor All-on-4 - Zâmbet perfect',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Dinți Ficși în 24 Ore | MedicalCor',
    description: 'Scapă de proteză cu All-on-4. Consultație GRATUITĂ!',
    images: ['https://medicalcor.ro/og/osax-fix-hero.jpg'],
    creator: '@medicalcor',
  },
  robots: {
    index: true,
    follow: true,
    nocache: false,
    googleBot: {
      index: true,
      follow: true,
      noimageindex: false,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  category: 'Health',
  other: {
    // Schema.org structured data hints
    'schema:type': 'MedicalBusiness',
    'schema:priceRange': '€€€',
    // Ad platform hints
    'google-site-verification': process.env.NEXT_PUBLIC_GOOGLE_VERIFICATION ?? '',
    'facebook-domain-verification': process.env.NEXT_PUBLIC_FB_DOMAIN_VERIFICATION ?? '',
  },
};

/**
 * JSON-LD Structured Data for Rich Snippets
 */
export const osaxFixJsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'MedicalBusiness',
      '@id': 'https://medicalcor.ro/#organization',
      name: 'MedicalCor',
      url: 'https://medicalcor.ro',
      logo: 'https://medicalcor.ro/logo.png',
      description: 'Clinică stomatologică premium specializată în implanturi All-on-4',
      address: {
        '@type': 'PostalAddress',
        streetAddress: 'Strada Exemplu 123',
        addressLocality: 'București',
        addressRegion: 'Sector 1',
        postalCode: '010101',
        addressCountry: 'RO',
      },
      geo: {
        '@type': 'GeoCoordinates',
        latitude: 44.4268,
        longitude: 26.1025,
      },
      telephone: '+40770123456',
      priceRange: '€€€',
      openingHoursSpecification: [
        {
          '@type': 'OpeningHoursSpecification',
          dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
          opens: '09:00',
          closes: '19:00',
        },
        {
          '@type': 'OpeningHoursSpecification',
          dayOfWeek: 'Saturday',
          opens: '10:00',
          closes: '14:00',
        },
      ],
      aggregateRating: {
        '@type': 'AggregateRating',
        ratingValue: '4.9',
        reviewCount: '287',
        bestRating: '5',
        worstRating: '1',
      },
    },
    {
      '@type': 'MedicalProcedure',
      name: 'All-on-4 Dental Implants',
      description:
        'Procedură de implant dentar care înlocuiește o arcadă completă de dinți folosind doar 4 implanturi',
      howPerformed: 'Sedare conștientă, fără durere',
      preparation: 'Consultație + CT 3D',
      followup: 'Control la 1 săptămână, apoi la 3 luni',
      procedureType: 'https://schema.org/SurgicalProcedure',
      bodyLocation: 'Cavitatea orală',
      outcome: 'Dinți ficși permanenți în 24 ore',
    },
    {
      '@type': 'Offer',
      name: 'Consultație Gratuită All-on-4',
      description: 'Consultație + CT 3D gratuit pentru evaluare All-on-4',
      price: '0',
      priceCurrency: 'RON',
      availability: 'https://schema.org/InStock',
      validFrom: new Date().toISOString(),
      validThrough: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      seller: {
        '@type': 'MedicalBusiness',
        name: 'MedicalCor',
      },
    },
    {
      '@type': 'FAQPage',
      mainEntity: [
        {
          '@type': 'Question',
          name: 'Cât costă All-on-4?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: 'Prețul All-on-4 variază între 4.500€ și 8.500€ per arcadă, în funcție de materialele alese și complexitatea cazului. Oferim rate de la 499 lei/lună fără dobândă.',
          },
        },
        {
          '@type': 'Question',
          name: 'Cât durează procedura All-on-4?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: 'Procedura durează între 2-4 ore, iar pacientul pleacă acasă cu dinți ficși în aceeași zi. Proteza finală se montează după 3-6 luni de vindecare.',
          },
        },
        {
          '@type': 'Question',
          name: 'Este dureroasă procedura All-on-4?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: 'Nu, procedura se face sub sedare conștientă și este complet nedureroasă. După intervenție, disconfortul minor se tratează cu antiinflamatoare obișnuite.',
          },
        },
      ],
    },
  ],
};
