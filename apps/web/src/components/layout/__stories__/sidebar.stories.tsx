import type { Meta, StoryObj } from '@storybook/react';
import Link from 'next/link';
import {
  LayoutDashboard,
  Users,
  Calendar,
  MessageSquare,
  Activity,
  Settings,
  ChevronLeft,
  ChevronRight,
  Stethoscope,
  BarChart3,
  Zap,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { useState } from 'react';

const navigation = [
  { name: 'Dashboard', href: '/', icon: LayoutDashboard },
  { name: 'Triage', href: '/triage', icon: Activity },
  { name: 'Pacienți', href: '/patients', icon: Users },
  { name: 'Calendar', href: '/calendar', icon: Calendar },
  { name: 'Mesaje', href: '/messages', icon: MessageSquare },
  { name: 'Analytics', href: '/analytics', icon: BarChart3 },
  { name: 'Workflows', href: '/workflows', icon: Zap },
  { name: 'Setări', href: '/settings', icon: Settings },
];

interface SidebarDemoProps {
  collapsed?: boolean;
  activePath?: string;
}

function SidebarDemo({ collapsed: initialCollapsed = false, activePath = '/' }: SidebarDemoProps) {
  const [collapsed, setCollapsed] = useState(initialCollapsed);

  return (
    <aside
      className={cn(
        'h-[600px] border-r bg-card transition-all duration-300',
        collapsed ? 'w-16' : 'w-64'
      )}
    >
      <div className="flex h-full flex-col">
        {/* Logo */}
        <div className="flex h-16 items-center justify-between border-b px-4">
          {!collapsed && (
            <div className="flex items-center gap-2">
              <Stethoscope className="h-8 w-8 text-primary" />
              <span className="text-lg font-bold text-primary">Cortex</span>
            </div>
          )}
          {collapsed && (
            <div className="mx-auto">
              <Stethoscope className="h-8 w-8 text-primary" />
            </div>
          )}
        </div>

        {/* Navigation */}
        <nav className="flex-1 space-y-1 p-2 overflow-y-auto">
          {navigation.map((item) => {
            const isActive = activePath === item.href;
            return (
              <a
                key={item.name}
                href={item.href}
                onClick={(e) => e.preventDefault()}
                className={cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                )}
              >
                <item.icon className="h-5 w-5 shrink-0" />
                {!collapsed && <span>{item.name}</span>}
              </a>
            );
          })}
        </nav>

        {/* Collapse button */}
        <div className="border-t p-2">
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-center"
            onClick={() => setCollapsed(!collapsed)}
          >
            {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </Button>
        </div>
      </div>
    </aside>
  );
}

const meta = {
  title: 'Layout/Sidebar',
  component: SidebarDemo,
  parameters: {
    layout: 'fullscreen',
  },
  tags: ['autodocs'],
  argTypes: {
    collapsed: {
      control: 'boolean',
      description: 'Whether the sidebar is collapsed',
    },
    activePath: {
      control: 'select',
      options: [
        '/',
        '/triage',
        '/patients',
        '/calendar',
        '/messages',
        '/analytics',
        '/workflows',
        '/settings',
      ],
      description: 'The currently active path',
    },
  },
  decorators: [
    (Story) => (
      <div className="p-4">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof SidebarDemo>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    collapsed: false,
    activePath: '/',
  },
};

export const Collapsed: Story = {
  args: {
    collapsed: true,
    activePath: '/',
  },
};

export const PatientsActive: Story = {
  args: {
    collapsed: false,
    activePath: '/patients',
  },
};

export const CalendarActive: Story = {
  args: {
    collapsed: false,
    activePath: '/calendar',
  },
};

export const WithLayout: Story = {
  render: () => (
    <div className="flex h-[600px] border rounded-lg overflow-hidden">
      <SidebarDemo activePath="/patients" />
      <main className="flex-1 p-6 bg-muted/30">
        <h1 className="text-2xl font-bold mb-4">Pacienți</h1>
        <p className="text-muted-foreground">
          This is the main content area when the sidebar is expanded.
        </p>
      </main>
    </div>
  ),
};

export const CollapsedWithLayout: Story = {
  render: () => (
    <div className="flex h-[600px] border rounded-lg overflow-hidden">
      <SidebarDemo collapsed activePath="/patients" />
      <main className="flex-1 p-6 bg-muted/30">
        <h1 className="text-2xl font-bold mb-4">Pacienți</h1>
        <p className="text-muted-foreground">
          This is the main content area when the sidebar is collapsed.
        </p>
      </main>
    </div>
  ),
};

export const NavigationItems: Story = {
  render: () => (
    <div className="space-y-4 p-4">
      <h3 className="text-lg font-semibold">Navigation Items</h3>
      <div className="grid grid-cols-2 gap-4 max-w-lg">
        {navigation.map((item) => (
          <div key={item.name} className="flex items-center gap-3 p-3 border rounded-lg">
            <item.icon className="h-5 w-5 text-muted-foreground" />
            <span className="text-sm font-medium">{item.name}</span>
          </div>
        ))}
      </div>
    </div>
  ),
};
