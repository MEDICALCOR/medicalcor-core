import type { Metadata } from 'next';

/**
 * Campaign Landing Pages Layout
 *
 * Public pages optimized for lead generation
 * No authentication required
 */

export const metadata: Metadata = {
  title: {
    template: '%s | MedicalCor',
    default: 'Campanii | MedicalCor - Clinică Stomatologică Premium',
  },
  description:
    'Oferte speciale pentru tratamente dentare. Consultație gratuită, rate fără dobândă, garanție 10 ani.',
  keywords: [
    'implant dentar',
    'all-on-4',
    'all-on-6',
    'fatete dentare',
    'stomatologie',
    'clinica dentara',
    'bucuresti',
    'pret implant',
  ],
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  openGraph: {
    type: 'website',
    locale: 'ro_RO',
    siteName: 'MedicalCor',
  },
  twitter: {
    card: 'summary_large_image',
  },
  verification: {
    google: process.env.NEXT_PUBLIC_GOOGLE_VERIFICATION,
  },
};

export default function CampaniiLayout({ children }: { children: React.ReactNode }) {
  // Validate analytics IDs to prevent XSS via env var injection
  const GTM_ID_REGEX = /^GTM-[A-Z0-9]{6,8}$/;
  const FB_PIXEL_REGEX = /^\d{15,16}$/;

  const gtmId = process.env.NEXT_PUBLIC_GTM_ID;
  const fbPixelId = process.env.NEXT_PUBLIC_FB_PIXEL_ID;

  const isValidGtmId = gtmId && GTM_ID_REGEX.test(gtmId);
  const isValidFbPixelId = fbPixelId && FB_PIXEL_REGEX.test(fbPixelId);

  return (
    <>
      {/* Google Tag Manager - Head */}
      {isValidGtmId && (
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
              new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
              j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
              'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
              })(window,document,'script','dataLayer','${gtmId}');
            `,
          }}
        />
      )}

      {/* Facebook Pixel */}
      {isValidFbPixelId && (
        <script
          dangerouslySetInnerHTML={{
            __html: `
              !function(f,b,e,v,n,t,s)
              {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
              n.callMethod.apply(n,arguments):n.queue.push(arguments)};
              if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
              n.queue=[];t=b.createElement(e);t.async=!0;
              t.src=v;s=b.getElementsByTagName(e)[0];
              s.parentNode.insertBefore(t,s)}(window, document,'script',
              'https://connect.facebook.net/en_US/fbevents.js');
              fbq('init', '${fbPixelId}');
              fbq('track', 'PageView');
            `,
          }}
        />
      )}

      {children}

      {/* Google Tag Manager - Body (noscript) */}
      {isValidGtmId && (
        <noscript>
          <iframe
            src={`https://www.googletagmanager.com/ns.html?id=${gtmId}`}
            height="0"
            width="0"
            style={{ display: 'none', visibility: 'hidden' }}
            title="Google Tag Manager"
          />
        </noscript>
      )}
    </>
  );
}
