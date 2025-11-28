'use client';

import { Moon, Sun, User, Stethoscope } from 'lucide-react';
import { useTheme } from 'next-themes';
import { Button } from '@/components/ui/button';
import { ConnectionStatus, NotificationBell } from '@/components/realtime';
import { MobileMenuTrigger, useSidebar } from './sidebar';
import { LanguageSwitcher } from '@/components/i18n/language-switcher';
import Link from 'next/link';

export function Header() {
  const { theme, setTheme } = useTheme();
  const { isMobile } = useSidebar();

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b bg-background/95 px-4 sm:px-6 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="flex items-center gap-2 sm:gap-4">
        {/* Mobile menu button */}
        <MobileMenuTrigger />

        {/* Logo on mobile */}
        {isMobile && (
          <Link href="/" className="flex items-center gap-2">
            <Stethoscope className="h-6 w-6 text-primary" />
            <span className="text-base font-bold text-primary">Cortex</span>
          </Link>
        )}

        {/* Title on desktop */}
        {!isMobile && <h1 className="text-lg font-semibold">MedicalCor Cortex</h1>}

        <div className="pl-2 sm:pl-4 hidden sm:block">
          <ConnectionStatus />
        </div>
      </div>

      <div className="flex items-center gap-1 sm:gap-2">
        {/* Real-time Notifications */}
        <NotificationBell />

        {/* Language switcher */}
        <LanguageSwitcher />

        {/* Theme toggle */}
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          className="h-9 w-9 sm:h-10 sm:w-10"
        >
          <Sun className="h-4 w-4 sm:h-5 sm:w-5 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
          <Moon className="absolute h-4 w-4 sm:h-5 sm:w-5 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
          <span className="sr-only">Toggle theme</span>
        </Button>

        {/* User menu - ACCESSIBILITY FIX: Added aria-label for screen readers */}
        <Button variant="ghost" size="icon" className="h-9 w-9 sm:h-10 sm:w-10" aria-label="User menu">
          <User className="h-4 w-4 sm:h-5 sm:w-5" aria-hidden="true" />
        </Button>
      </div>
    </header>
  );
}
