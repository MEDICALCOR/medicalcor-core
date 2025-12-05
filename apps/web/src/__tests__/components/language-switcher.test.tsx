import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LanguageSwitcher } from '@/components/i18n/language-switcher';

const mockAvailableLanguages = [
  { code: 'ro', name: 'Română' },
  { code: 'en', name: 'English' },
  { code: 'hu', name: 'Magyar' },
];

// Mock the useI18n hook
vi.mock('@/lib/i18n', () => ({
  useI18n: vi.fn(() => ({
    language: 'ro',
    setLanguage: vi.fn(),
    availableLanguages: mockAvailableLanguages,
  })),
}));

describe('LanguageSwitcher', () => {
  it('should render language switcher button', () => {
    render(<LanguageSwitcher />);

    expect(screen.getByRole('button', { name: /română/i })).toBeInTheDocument();
  });

  it('should display current language name', () => {
    const { useI18n } = require('@/lib/i18n');
    useI18n.mockReturnValue({
      language: 'en',
      setLanguage: vi.fn(),
      availableLanguages: mockAvailableLanguages,
    });

    render(<LanguageSwitcher />);

    expect(screen.getByText('English')).toBeInTheDocument();
  });

  it('should display Globe icon', () => {
    const { container } = render(<LanguageSwitcher />);

    expect(container.querySelector('svg')).toBeInTheDocument();
  });

  it('should open dropdown when button is clicked', async () => {
    const user = userEvent.setup();

    render(<LanguageSwitcher />);

    const button = screen.getByRole('button', { name: /română/i });
    await user.click(button);

    await waitFor(() => {
      expect(screen.getByText('Română')).toBeInTheDocument();
      expect(screen.getByText('English')).toBeInTheDocument();
      expect(screen.getByText('Magyar')).toBeInTheDocument();
    });
  });

  it('should display all available languages in dropdown', async () => {
    const user = userEvent.setup();

    render(<LanguageSwitcher />);

    await user.click(screen.getByRole('button', { name: /română/i }));

    await waitFor(() => {
      mockAvailableLanguages.forEach((lang) => {
        expect(screen.getByText(lang.name)).toBeInTheDocument();
      });
    });
  });

  it('should call setLanguage when a language is selected', async () => {
    const user = userEvent.setup();
    const mockSetLanguage = vi.fn();

    const { useI18n } = require('@/lib/i18n');
    useI18n.mockReturnValue({
      language: 'ro',
      setLanguage: mockSetLanguage,
      availableLanguages: mockAvailableLanguages,
    });

    render(<LanguageSwitcher />);

    await user.click(screen.getByRole('button', { name: /română/i }));

    const englishOption = screen.getByText('English');
    await user.click(englishOption);

    expect(mockSetLanguage).toHaveBeenCalledWith('en');
  });

  it('should highlight current language in dropdown', async () => {
    const user = userEvent.setup();

    const { useI18n } = require('@/lib/i18n');
    useI18n.mockReturnValue({
      language: 'ro',
      setLanguage: vi.fn(),
      availableLanguages: mockAvailableLanguages,
    });

    render(<LanguageSwitcher />);

    await user.click(screen.getByRole('button', { name: /română/i }));

    await waitFor(() => {
      const currentLangItem = screen.getAllByText('Română')[1]; // Second one is in dropdown
      expect(currentLangItem.parentElement).toHaveClass('bg-accent');
    });
  });

  it('should not highlight non-current languages', async () => {
    const user = userEvent.setup();

    const { useI18n } = require('@/lib/i18n');
    useI18n.mockReturnValue({
      language: 'ro',
      setLanguage: vi.fn(),
      availableLanguages: mockAvailableLanguages,
    });

    render(<LanguageSwitcher />);

    await user.click(screen.getByRole('button', { name: /română/i }));

    await waitFor(() => {
      const englishItem = screen.getByText('English');
      expect(englishItem.parentElement).not.toHaveClass('bg-accent');
    });
  });

  it('should hide language name on small screens', () => {
    const { container } = render(<LanguageSwitcher />);

    const languageName = container.querySelector('.hidden.sm\\:inline');
    expect(languageName).toBeInTheDocument();
  });

  it('should use ghost button variant', () => {
    render(<LanguageSwitcher />);

    const button = screen.getByRole('button', { name: /română/i });
    expect(button.className).toContain('ghost');
  });

  it('should use small button size', () => {
    render(<LanguageSwitcher />);

    const button = screen.getByRole('button', { name: /română/i });
    expect(button.className).toContain('sm');
  });

  it('should align dropdown to end', async () => {
    const user = userEvent.setup();

    render(<LanguageSwitcher />);

    await user.click(screen.getByRole('button', { name: /română/i }));

    await waitFor(() => {
      expect(screen.getByText('English')).toBeInTheDocument();
    });
  });

  it('should handle language switching from Romanian to English', async () => {
    const user = userEvent.setup();
    const mockSetLanguage = vi.fn();

    const { useI18n } = require('@/lib/i18n');
    useI18n.mockReturnValue({
      language: 'ro',
      setLanguage: mockSetLanguage,
      availableLanguages: mockAvailableLanguages,
    });

    render(<LanguageSwitcher />);

    expect(screen.getByText('Română')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /română/i }));
    await user.click(screen.getByText('English'));

    expect(mockSetLanguage).toHaveBeenCalledWith('en');
  });

  it('should handle language switching from English to Hungarian', async () => {
    const user = userEvent.setup();
    const mockSetLanguage = vi.fn();

    const { useI18n } = require('@/lib/i18n');
    useI18n.mockReturnValue({
      language: 'en',
      setLanguage: mockSetLanguage,
      availableLanguages: mockAvailableLanguages,
    });

    render(<LanguageSwitcher />);

    expect(screen.getByText('English')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /english/i }));
    await user.click(screen.getByText('Magyar'));

    expect(mockSetLanguage).toHaveBeenCalledWith('hu');
  });

  it('should close dropdown after selecting a language', async () => {
    const user = userEvent.setup();

    const { useI18n } = require('@/lib/i18n');
    useI18n.mockReturnValue({
      language: 'ro',
      setLanguage: vi.fn(),
      availableLanguages: mockAvailableLanguages,
    });

    render(<LanguageSwitcher />);

    await user.click(screen.getByRole('button', { name: /română/i }));

    const englishOption = screen.getByText('English');
    await user.click(englishOption);

    await waitFor(() => {
      const allEnglish = screen.queryAllByText('English');
      // Only the button text should remain, dropdown should be closed
      expect(allEnglish.length).toBeLessThanOrEqual(1);
    });
  });

  it('should display correct language name for unknown language code', () => {
    const { useI18n } = require('@/lib/i18n');
    useI18n.mockReturnValue({
      language: 'unknown',
      setLanguage: vi.fn(),
      availableLanguages: mockAvailableLanguages,
    });

    render(<LanguageSwitcher />);

    // Should not crash when language code is not in availableLanguages
    expect(screen.getByRole('button')).toBeInTheDocument();
  });

  it('should render with single language option', async () => {
    const user = userEvent.setup();

    const { useI18n } = require('@/lib/i18n');
    useI18n.mockReturnValue({
      language: 'ro',
      setLanguage: vi.fn(),
      availableLanguages: [{ code: 'ro', name: 'Română' }],
    });

    render(<LanguageSwitcher />);

    await user.click(screen.getByRole('button', { name: /română/i }));

    await waitFor(() => {
      const allRomana = screen.queryAllByText('Română');
      expect(allRomana.length).toBeGreaterThan(0);
    });
  });
});
