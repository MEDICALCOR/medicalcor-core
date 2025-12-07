import type { Meta, StoryObj } from '@storybook/react';
import { User, Stethoscope, Bell, Globe, Moon, Sun, Menu } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

/**
 * Demo Header component that doesn't depend on context providers
 */
function HeaderDemo({ isMobile = false }: { isMobile?: boolean }) {
  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b bg-background/95 px-4 sm:px-6 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="flex items-center gap-2 sm:gap-4">
        {/* Mobile menu button */}
        {isMobile && (
          <Button variant="ghost" size="icon" className="lg:hidden">
            <Menu className="h-5 w-5" />
            <span className="sr-only">Deschide meniul</span>
          </Button>
        )}

        {/* Logo on mobile */}
        {isMobile && (
          <div className="flex items-center gap-2">
            <Stethoscope className="h-6 w-6 text-primary" />
            <span className="text-base font-bold text-primary">Cortex</span>
          </div>
        )}

        {/* Title on desktop */}
        {!isMobile && <h1 className="text-lg font-semibold">MedicalCor Cortex</h1>}

        {/* Connection status */}
        <div className="pl-2 sm:pl-4 hidden sm:block">
          <div className="flex items-center gap-2 text-sm">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
            </span>
            <span className="text-muted-foreground">Connected</span>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-1 sm:gap-2">
        {/* Notification bell */}
        <Button variant="ghost" size="icon" className="h-9 w-9 sm:h-10 sm:w-10 relative">
          <Bell className="h-4 w-4 sm:h-5 sm:w-5" />
          <Badge className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0 text-[10px]">
            3
          </Badge>
        </Button>

        {/* Language switcher */}
        <Button variant="ghost" size="icon" className="h-9 w-9 sm:h-10 sm:w-10">
          <Globe className="h-4 w-4 sm:h-5 sm:w-5" />
        </Button>

        {/* Theme toggle */}
        <Button variant="ghost" size="icon" className="h-9 w-9 sm:h-10 sm:w-10">
          <Sun className="h-4 w-4 sm:h-5 sm:w-5" />
        </Button>

        {/* User menu */}
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9 sm:h-10 sm:w-10"
          aria-label="User menu"
        >
          <User className="h-4 w-4 sm:h-5 sm:w-5" />
        </Button>
      </div>
    </header>
  );
}

const meta = {
  title: 'Layout/Header',
  component: HeaderDemo,
  parameters: {
    layout: 'fullscreen',
  },
  tags: ['autodocs'],
  argTypes: {
    isMobile: {
      control: 'boolean',
      description: 'Whether to show mobile layout',
    },
  },
} satisfies Meta<typeof HeaderDemo>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    isMobile: false,
  },
};

export const Mobile: Story = {
  args: {
    isMobile: true,
  },
  parameters: {
    viewport: {
      defaultViewport: 'mobile1',
    },
  },
};

export const WithSidebar: Story = {
  render: () => (
    <div className="flex h-[400px]">
      <aside className="w-64 border-r bg-card hidden lg:block">
        <div className="flex h-16 items-center border-b px-4">
          <div className="flex items-center gap-2">
            <Stethoscope className="h-8 w-8 text-primary" />
            <span className="text-lg font-bold text-primary">Cortex</span>
          </div>
        </div>
      </aside>
      <div className="flex-1">
        <HeaderDemo />
        <main className="p-6">
          <h2 className="text-xl font-semibold mb-4">Dashboard</h2>
          <p className="text-muted-foreground">Main content area</p>
        </main>
      </div>
    </div>
  ),
};

export const HeaderActions: Story = {
  render: () => (
    <div className="space-y-6 p-4">
      <h3 className="text-lg font-semibold">Header Action Items</h3>
      <div className="flex flex-wrap gap-4">
        <div className="flex flex-col items-center gap-2 p-4 border rounded-lg">
          <Button variant="ghost" size="icon" className="relative">
            <Bell className="h-5 w-5" />
            <Badge className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0 text-[10px]">
              3
            </Badge>
          </Button>
          <span className="text-sm">Notifications</span>
        </div>
        <div className="flex flex-col items-center gap-2 p-4 border rounded-lg">
          <Button variant="ghost" size="icon">
            <Globe className="h-5 w-5" />
          </Button>
          <span className="text-sm">Language</span>
        </div>
        <div className="flex flex-col items-center gap-2 p-4 border rounded-lg">
          <Button variant="ghost" size="icon">
            <Sun className="h-5 w-5" />
          </Button>
          <span className="text-sm">Theme</span>
        </div>
        <div className="flex flex-col items-center gap-2 p-4 border rounded-lg">
          <Button variant="ghost" size="icon">
            <User className="h-5 w-5" />
          </Button>
          <span className="text-sm">User</span>
        </div>
      </div>
    </div>
  ),
};

export const ConnectionStates: Story = {
  render: () => (
    <div className="space-y-4 p-4">
      <h3 className="text-lg font-semibold">Connection Status Variants</h3>
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-2 p-3 border rounded-lg">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
          </span>
          <span className="text-sm text-muted-foreground">Connected</span>
        </div>
        <div className="flex items-center gap-2 p-3 border rounded-lg">
          <span className="relative flex h-2 w-2">
            <span className="relative inline-flex rounded-full h-2 w-2 bg-yellow-500" />
          </span>
          <span className="text-sm text-muted-foreground">Connecting...</span>
        </div>
        <div className="flex items-center gap-2 p-3 border rounded-lg">
          <span className="relative flex h-2 w-2">
            <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
          </span>
          <span className="text-sm text-muted-foreground">Disconnected</span>
        </div>
      </div>
    </div>
  ),
};
