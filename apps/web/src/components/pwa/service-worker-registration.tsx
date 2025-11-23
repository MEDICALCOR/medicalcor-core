'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Download, X } from 'lucide-react';

export function ServiceWorkerRegistration() {
  const [showUpdatePrompt, setShowUpdatePrompt] = useState(false);
  const [showInstallPrompt, setShowInstallPrompt] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
      return;
    }

    // Register service worker
    navigator.serviceWorker
      .register('/sw.js')
      .then((registration) => {
        // Check for updates periodically
        setInterval(
          () => {
            void registration.update();
          },
          60 * 60 * 1000
        ); // Every hour

        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing;
          if (newWorker) {
            newWorker.addEventListener('statechange', () => {
              if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                setShowUpdatePrompt(true);
              }
            });
          }
        });
      })
      .catch((error: unknown) => {
        console.error('SW registration failed:', error);
      });

    // Listen for install prompt
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      // Show install prompt after a delay
      setTimeout(() => setShowInstallPrompt(true), 30000); // 30 seconds
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  const handleUpdate = () => {
    window.location.reload();
  };

  const handleInstall = async () => {
    if (!deferredPrompt) return;

    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;

    if (outcome === 'accepted') {
      setDeferredPrompt(null);
    }
    setShowInstallPrompt(false);
  };

  if (showUpdatePrompt) {
    return (
      <div className="fixed bottom-4 right-4 z-50 bg-card border rounded-lg shadow-lg p-4 max-w-sm animate-in slide-in-from-bottom-4">
        <div className="flex items-start gap-3">
          <div className="flex-1">
            <p className="font-medium text-sm">Actualizare disponibilă</p>
            <p className="text-xs text-muted-foreground mt-1">
              O versiune nouă a aplicației este disponibilă.
            </p>
          </div>
          <Button size="sm" onClick={handleUpdate}>
            Actualizează
          </Button>
        </div>
      </div>
    );
  }

  if (showInstallPrompt && deferredPrompt) {
    return (
      <div className="fixed bottom-4 right-4 z-50 bg-card border rounded-lg shadow-lg p-4 max-w-sm animate-in slide-in-from-bottom-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
            <Download className="h-5 w-5 text-primary" />
          </div>
          <div className="flex-1">
            <p className="font-medium text-sm">Instalează aplicația</p>
            <p className="text-xs text-muted-foreground mt-1">
              Adaugă MedicalCor Cortex pe ecranul principal pentru acces rapid.
            </p>
            <div className="flex gap-2 mt-3">
              <Button size="sm" onClick={handleInstall}>
                Instalează
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setShowInstallPrompt(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return null;
}

// Type declaration for BeforeInstallPromptEvent
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}
