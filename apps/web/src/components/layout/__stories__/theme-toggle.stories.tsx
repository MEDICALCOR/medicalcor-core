import type { Meta, StoryObj } from '@storybook/react';
import { Moon, Sun, Monitor } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useState } from 'react';

/**
 * Demo ThemeToggle that doesn't depend on next-themes
 */
function ThemeToggleDemo() {
  const [theme, setTheme] = useState<'light' | 'dark' | 'system'>('system');

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9 sm:h-10 sm:w-10"
          aria-label="Toggle theme"
        >
          <Sun className="h-4 w-4 sm:h-5 sm:w-5 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
          <Moon className="absolute h-4 w-4 sm:h-5 sm:w-5 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
          <span className="sr-only">Toggle theme</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => setTheme('light')} className="flex items-center gap-2">
          <Sun className="h-4 w-4" />
          <span>Light</span>
          {theme === 'light' && <span className="ml-auto text-xs text-muted-foreground">✓</span>}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme('dark')} className="flex items-center gap-2">
          <Moon className="h-4 w-4" />
          <span>Dark</span>
          {theme === 'dark' && <span className="ml-auto text-xs text-muted-foreground">✓</span>}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme('system')} className="flex items-center gap-2">
          <Monitor className="h-4 w-4" />
          <span>System</span>
          {theme === 'system' && <span className="ml-auto text-xs text-muted-foreground">✓</span>}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

const meta = {
  title: 'Layout/ThemeToggle',
  component: ThemeToggleDemo,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
} satisfies Meta<typeof ThemeToggleDemo>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => <ThemeToggleDemo />,
};

export const InHeader: Story = {
  render: () => (
    <div className="flex items-center gap-2 p-4 bg-background border rounded-lg">
      <span className="text-sm text-muted-foreground">Theme:</span>
      <ThemeToggleDemo />
    </div>
  ),
};

export const AllOptions: Story = {
  render: () => (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold">Theme Options</h3>
      <div className="grid grid-cols-3 gap-4">
        <div className="p-4 border rounded-lg text-center">
          <div className="w-12 h-12 rounded-full bg-yellow-100 flex items-center justify-center mx-auto mb-2">
            <Sun className="h-6 w-6 text-yellow-600" />
          </div>
          <p className="font-medium">Light</p>
          <p className="text-xs text-muted-foreground">Bright mode</p>
        </div>
        <div className="p-4 border rounded-lg text-center">
          <div className="w-12 h-12 rounded-full bg-slate-800 flex items-center justify-center mx-auto mb-2">
            <Moon className="h-6 w-6 text-slate-200" />
          </div>
          <p className="font-medium">Dark</p>
          <p className="text-xs text-muted-foreground">Dark mode</p>
        </div>
        <div className="p-4 border rounded-lg text-center">
          <div className="w-12 h-12 rounded-full bg-gradient-to-br from-yellow-100 to-slate-800 flex items-center justify-center mx-auto mb-2">
            <Monitor className="h-6 w-6 text-slate-600" />
          </div>
          <p className="font-medium">System</p>
          <p className="text-xs text-muted-foreground">Auto detect</p>
        </div>
      </div>
      <div className="flex justify-center">
        <ThemeToggleDemo />
      </div>
    </div>
  ),
};
