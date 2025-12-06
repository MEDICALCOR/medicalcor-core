'use client';

import Script from 'next/script';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ArrowLeft, BookOpen, Key, ExternalLink, Download } from 'lucide-react';

function Header() {
  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-gradient-to-r from-teal-700 to-teal-900 text-white shadow-md">
      <div className="flex items-center justify-between px-4 h-14">
        <div className="flex items-center gap-4">
          <Link
            href="/"
            className="flex items-center gap-2 text-sm text-teal-100 hover:text-white transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            <span className="hidden sm:inline">Dashboard</span>
          </Link>
          <div className="h-6 w-px bg-teal-600" />
          <div className="flex items-center gap-2">
            <BookOpen className="h-5 w-5" />
            <span className="font-semibold">MedicalCor API</span>
            <span className="hidden sm:inline px-2 py-0.5 text-xs bg-teal-600 rounded-full">
              v3.0.0
            </span>
          </div>
        </div>
        <nav className="flex items-center gap-4">
          <Link
            href="/api-keys"
            className="flex items-center gap-1 text-sm text-teal-100 hover:text-white transition-colors"
          >
            <Key className="h-4 w-4" />
            <span className="hidden sm:inline">API Keys</span>
          </Link>
          <a
            href="/docs/openapi.yaml"
            download="medicalcor-openapi.yaml"
            className="flex items-center gap-1 text-sm text-teal-100 hover:text-white transition-colors"
          >
            <Download className="h-4 w-4" />
            <span className="hidden sm:inline">Download Spec</span>
          </a>
          <a
            href="https://docs.medicalcor.ro"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-sm text-teal-100 hover:text-white transition-colors"
          >
            <span className="hidden sm:inline">Full Docs</span>
            <ExternalLink className="h-4 w-4" />
          </a>
        </nav>
      </div>
    </header>
  );
}

function LoadingState() {
  return (
    <div className="flex items-center justify-center min-h-screen bg-slate-50 dark:bg-slate-900">
      <div className="text-center">
        <div className="relative">
          <div className="animate-spin rounded-full h-16 w-16 border-4 border-teal-200 border-t-teal-600 mx-auto" />
          <BookOpen className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 h-6 w-6 text-teal-600" />
        </div>
        <p className="mt-4 text-slate-600 dark:text-slate-400 font-medium">
          Loading API Documentation...
        </p>
        <p className="mt-2 text-sm text-slate-500 dark:text-slate-500">
          Interactive reference with live examples
        </p>
      </div>
    </div>
  );
}

export default function ApiDocsPage() {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Set a timeout to show loading state
    const timer = setTimeout(() => {
      if (isLoading) {
        setError('Documentation is taking longer than expected to load...');
      }
    }, 10000);

    return () => clearTimeout(timer);
  }, [isLoading]);

  return (
    <>
      <Header />
      {isLoading && <LoadingState />}
      {error && (
        <div className="fixed bottom-4 right-4 z-50 bg-amber-100 border border-amber-300 text-amber-800 px-4 py-2 rounded-lg shadow-lg text-sm">
          {error}
        </div>
      )}
      <Script
        id="scalar-api-reference"
        src="https://cdn.jsdelivr.net/npm/@scalar/api-reference@1/dist/browser/standalone.min.js"
        strategy="afterInteractive"
        onLoad={() => {
          // @ts-expect-error - Scalar is loaded via CDN
          if (typeof window !== 'undefined' && window.Scalar) {
            // @ts-expect-error - Scalar is loaded via CDN
            window.Scalar.createApiReference('#api-reference', {
              url: '/api/openapi',
              theme: 'purple',
              hideModels: false,
              hideDownloadButton: false,
              showSidebar: true,
              searchHotKey: 'k',
              customCss: `
                .scalar-app {
                  --scalar-color-1: #0f766e;
                  --scalar-color-accent: #0f766e;
                  --scalar-button-1: #0f766e;
                  --scalar-button-1-hover: #0d6d66;
                }
                .sidebar { padding-top: 56px !important; }
                .references-layout { padding-top: 56px !important; }
                .introduction { padding-top: 56px !important; }
              `,
              metadata: {
                title: 'MedicalCor OSAX API',
              },
              onLoaded: () => {
                setIsLoading(false);
                setError(null);
              },
            });
          }
        }}
        onError={() => {
          setIsLoading(false);
          setError('Failed to load documentation. Please refresh the page.');
        }}
      />
      <div
        id="api-reference"
        className="min-h-screen pt-14"
        data-url="/api/openapi"
        data-proxy-url=""
      />
    </>
  );
}
