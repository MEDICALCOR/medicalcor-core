'use client';

import { Globe, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useI18n } from '@/lib/i18n';
import { cn } from '@/lib/utils';

interface LanguageSwitcherProps {
  variant?: 'default' | 'ghost' | 'outline';
  size?: 'default' | 'sm' | 'lg' | 'icon';
  showLabel?: boolean;
  className?: string;
}

/**
 * Language Switcher Component
 *
 * Allows users to switch between available languages (Romanian and English).
 * Persists the selection to localStorage and updates the document language attribute.
 *
 * @example
 * // Icon only (for header/toolbar)
 * <LanguageSwitcher size="icon" variant="ghost" />
 *
 * @example
 * // With label (for settings page)
 * <LanguageSwitcher showLabel variant="outline" />
 */
export function LanguageSwitcher({
  variant = 'ghost',
  size = 'icon',
  showLabel = false,
  className,
}: LanguageSwitcherProps) {
  const { language, setLanguage, availableLanguages, t } = useI18n();

  const currentLanguage = availableLanguages.find((l) => l.code === language);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant={variant}
          size={size}
          className={cn('gap-2', className)}
          aria-label={t('settings', 'changeLanguage')}
        >
          <Globe className="h-4 w-4" />
          {showLabel && <span>{currentLanguage?.name}</span>}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[140px]">
        {availableLanguages.map((lang) => (
          <DropdownMenuItem
            key={lang.code}
            onClick={() => setLanguage(lang.code)}
            className="flex items-center justify-between gap-2"
          >
            <div className="flex items-center gap-2">
              <span className="text-base">{lang.code === 'ro' ? '🇷🇴' : '🇬🇧'}</span>
              <span>{lang.name}</span>
            </div>
            {language === lang.code && <Check className="h-4 w-4 text-primary" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * Compact Language Switcher
 *
 * A simpler toggle button for switching between two languages.
 * Shows only the language code (RO/EN) for compact UIs.
 */
export function LanguageSwitcherCompact({ className }: { className?: string }) {
  const { language, setLanguage } = useI18n();

  const toggleLanguage = () => {
    setLanguage(language === 'ro' ? 'en' : 'ro');
  };

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={toggleLanguage}
      className={cn('font-medium uppercase tracking-wide', className)}
      aria-label={`Switch to ${language === 'ro' ? 'English' : 'Romanian'}`}
    >
      {language === 'ro' ? 'EN' : 'RO'}
    </Button>
  );
}
