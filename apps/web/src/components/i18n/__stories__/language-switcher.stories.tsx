import type { Meta, StoryObj } from '@storybook/react';
import { Globe } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface Language {
  code: string;
  name: string;
  flag?: string;
}

const availableLanguages: Language[] = [
  { code: 'ro', name: 'Română', flag: '🇷🇴' },
  { code: 'en', name: 'English', flag: '🇬🇧' },
  { code: 'de', name: 'Deutsch', flag: '🇩🇪' },
  { code: 'fr', name: 'Français', flag: '🇫🇷' },
];

interface LanguageSwitcherDemoProps {
  defaultLanguage?: string;
  showName?: boolean;
  showFlag?: boolean;
}

function LanguageSwitcherDemo({
  defaultLanguage = 'ro',
  showName = true,
  showFlag = false,
}: LanguageSwitcherDemoProps) {
  const [language, setLanguage] = useState(defaultLanguage);
  const currentLang = availableLanguages.find((l) => l.code === language);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-2">
          {showFlag && currentLang?.flag ? (
            <span>{currentLang.flag}</span>
          ) : (
            <Globe className="h-4 w-4" />
          )}
          {showName && <span className="hidden sm:inline">{currentLang?.name}</span>}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {availableLanguages.map((lang) => (
          <DropdownMenuItem
            key={lang.code}
            onClick={() => setLanguage(lang.code)}
            className={language === lang.code ? 'bg-accent' : ''}
          >
            {showFlag && <span className="mr-2">{lang.flag}</span>}
            {lang.name}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

const meta = {
  title: 'Features/LanguageSwitcher',
  component: LanguageSwitcherDemo,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  argTypes: {
    defaultLanguage: {
      control: 'select',
      options: ['ro', 'en', 'de', 'fr'],
      description: 'Initial language',
    },
    showName: {
      control: 'boolean',
      description: 'Show language name',
    },
    showFlag: {
      control: 'boolean',
      description: 'Show flag emoji',
    },
  },
} satisfies Meta<typeof LanguageSwitcherDemo>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    defaultLanguage: 'ro',
  },
};

export const English: Story = {
  args: {
    defaultLanguage: 'en',
  },
};

export const WithFlags: Story = {
  args: {
    defaultLanguage: 'ro',
    showFlag: true,
  },
};

export const IconOnly: Story = {
  args: {
    defaultLanguage: 'ro',
    showName: false,
  },
};

export const FlagOnly: Story = {
  args: {
    defaultLanguage: 'ro',
    showName: false,
    showFlag: true,
  },
};

export const InHeader: Story = {
  args: { defaultLanguage: 'ro' },
  render: () => (
    <div className="flex items-center justify-between bg-background border rounded-lg px-4 py-2 w-[500px]">
      <div className="flex items-center gap-2">
        <span className="font-medium">MedicalCor Dashboard</span>
      </div>
      <div className="flex items-center gap-2">
        <LanguageSwitcherDemo showFlag />
        <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-sm font-medium">
          IP
        </div>
      </div>
    </div>
  ),
};

export const AllLanguages: Story = {
  args: { defaultLanguage: 'ro' },
  render: () => (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold">Available Languages</h3>
      <div className="space-y-2">
        {availableLanguages.map((lang) => (
          <div key={lang.code} className="flex items-center gap-3 p-2 border rounded-lg">
            <span className="text-xl">{lang.flag}</span>
            <div>
              <p className="font-medium">{lang.name}</p>
              <p className="text-xs text-muted-foreground">{lang.code.toUpperCase()}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  ),
};
