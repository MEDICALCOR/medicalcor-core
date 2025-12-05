import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { I18nProvider, useI18n } from '../../lib/i18n';
import { translations } from '../../lib/i18n/translations';

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};

  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value.toString();
    },
    clear: () => {
      store = {};
    },
  };
})();

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
});

// Test component that uses the i18n hook
function TestComponent() {
  const { language, setLanguage, t, availableLanguages } = useI18n();

  return (
    <div>
      <div data-testid="current-language">{language}</div>
      <div data-testid="translation">{t('common', 'save')}</div>
      <div data-testid="available-languages">{availableLanguages.length}</div>
      <button onClick={() => setLanguage('en')}>Switch to English</button>
      <button onClick={() => setLanguage('ro')}>Switch to Romanian</button>
    </div>
  );
}

describe('I18n', () => {
  beforeEach(() => {
    localStorageMock.clear();
    Object.defineProperty(window.navigator, 'language', {
      writable: true,
      configurable: true,
      value: 'ro-RO',
    });
  });

  describe('I18nProvider', () => {
    it('should render children after initialization', async () => {
      render(
        <I18nProvider>
          <div data-testid="child">Test</div>
        </I18nProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId('child')).toBeInTheDocument();
      });
    });

    it('should initialize with Romanian by default', async () => {
      render(
        <I18nProvider>
          <TestComponent />
        </I18nProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId('current-language')).toHaveTextContent('ro');
      });
    });

    it('should load saved language from localStorage', async () => {
      localStorageMock.setItem('medicalcor-language', 'en');

      render(
        <I18nProvider>
          <TestComponent />
        </I18nProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId('current-language')).toHaveTextContent('en');
      });
    });

    it('should detect browser language if no saved preference', async () => {
      Object.defineProperty(window.navigator, 'language', {
        writable: true,
        configurable: true,
        value: 'en-US',
      });

      render(
        <I18nProvider>
          <TestComponent />
        </I18nProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId('current-language')).toHaveTextContent('en');
      });
    });

    it('should provide available languages', async () => {
      render(
        <I18nProvider>
          <TestComponent />
        </I18nProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId('available-languages')).toHaveTextContent('2');
      });
    });
  });

  describe('useI18n hook', () => {
    it('should throw error when used outside provider', () => {
      // Suppress console.error for this test
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      expect(() => {
        render(<TestComponent />);
      }).toThrow('useI18n must be used within an I18nProvider');

      consoleSpy.mockRestore();
    });

    it('should translate text correctly', async () => {
      render(
        <I18nProvider>
          <TestComponent />
        </I18nProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId('translation')).toHaveTextContent(translations.ro.common.save);
      });
    });

    it('should update language and translation when switched', async () => {
      render(
        <I18nProvider>
          <TestComponent />
        </I18nProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId('current-language')).toHaveTextContent('ro');
      });

      // Switch to English
      const switchButton = screen.getByText('Switch to English');
      switchButton.click();

      await waitFor(() => {
        expect(screen.getByTestId('current-language')).toHaveTextContent('en');
        expect(screen.getByTestId('translation')).toHaveTextContent(translations.en.common.save);
      });
    });

    it('should save language preference to localStorage', async () => {
      render(
        <I18nProvider>
          <TestComponent />
        </I18nProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId('current-language')).toBeDefined();
      });

      const switchButton = screen.getByText('Switch to English');
      switchButton.click();

      await waitFor(() => {
        expect(localStorageMock.getItem('medicalcor-language')).toBe('en');
      });
    });

    it('should return key if translation not found', async () => {
      function MissingTranslationComponent() {
        const { t } = useI18n();
        return <div data-testid="missing">{t('common', 'nonexistent-key')}</div>;
      }

      render(
        <I18nProvider>
          <MissingTranslationComponent />
        </I18nProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId('missing')).toHaveTextContent('nonexistent-key');
      });
    });

    it('should return key if namespace not found', async () => {
      function MissingNamespaceComponent() {
        const { t } = useI18n();
        // @ts-expect-error - Testing invalid namespace
        return <div data-testid="missing">{t('invalid_namespace', 'key')}</div>;
      }

      render(
        <I18nProvider>
          <MissingNamespaceComponent />
        </I18nProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId('missing')).toHaveTextContent('key');
      });
    });
  });

  describe('translations', () => {
    it('should have matching keys in all languages', () => {
      const roKeys = Object.keys(translations.ro);
      const enKeys = Object.keys(translations.en);

      expect(roKeys.sort()).toEqual(enKeys.sort());

      // Check nested keys for each namespace
      roKeys.forEach((namespace) => {
        const roNamespace = translations.ro[namespace as keyof typeof translations.ro];
        const enNamespace = translations.en[namespace as keyof typeof translations.en];

        if (typeof roNamespace === 'object' && typeof enNamespace === 'object') {
          const roNestedKeys = Object.keys(roNamespace);
          const enNestedKeys = Object.keys(enNamespace);

          expect(roNestedKeys.sort()).toEqual(enNestedKeys.sort());
        }
      });
    });

    it('should have common namespace with expected keys', () => {
      expect(translations.ro.common).toBeDefined();
      expect(translations.en.common).toBeDefined();
      expect(translations.ro.common.save).toBeDefined();
      expect(translations.en.common.save).toBeDefined();
    });

    it('should have patient namespace with expected keys', () => {
      expect(translations.ro.patient).toBeDefined();
      expect(translations.en.patient).toBeDefined();
      expect(translations.ro.patient.name).toBeDefined();
      expect(translations.en.patient.name).toBeDefined();
    });
  });
});
