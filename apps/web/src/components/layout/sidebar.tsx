'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
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
  Menu,
  X,
  Upload,
  FileText,
  UserCog,
  Headphones,
  MonitorCheck,
  Presentation,
  PhoneCall,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { useState, useEffect, createContext, useContext, useMemo } from 'react';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { usePermissions } from '@/components/auth/require-permission';

const navigation = [
  { name: 'Dashboard', href: '/', icon: LayoutDashboard },
  { name: 'Triage', href: '/triage', icon: Activity },
  { name: 'Pacienți', href: '/patients', icon: Users },
  { name: 'Calendar', href: '/calendar', icon: Calendar },
  { name: 'Mesaje', href: '/messages', icon: MessageSquare },
  { name: 'Agent Workspace', href: '/agent-workspace', icon: PhoneCall },
  { name: 'Analytics', href: '/analytics', icon: BarChart3 },
  { name: 'Supervisor', href: '/supervisor', icon: MonitorCheck },
  { name: 'Agenți', href: '/agent-performance', icon: Headphones },
  { name: 'Workflows', href: '/workflows', icon: Zap },
  { name: 'Rapoarte', href: '/reports', icon: FileText },
  { name: 'Import', href: '/import', icon: Upload },
  { name: 'Utilizatori', href: '/users', icon: UserCog },
  { name: 'Setări', href: '/settings', icon: Settings },
  { name: 'Investor Demo', href: '/investor-demo', icon: Presentation, highlight: true },
];

// Context for sidebar state
interface SidebarContextType {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  isMobile: boolean;
}

const SidebarContext = createContext<SidebarContextType>({
  isOpen: false,
  setIsOpen: () => undefined,
  isMobile: false,
});

export const useSidebar = () => useContext(SidebarContext);

export function SidebarProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 1024);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  return (
    <SidebarContext.Provider value={{ isOpen, setIsOpen, isMobile }}>
      {children}
    </SidebarContext.Provider>
  );
}

function SidebarNav({ collapsed, onLinkClick }: { collapsed?: boolean; onLinkClick?: () => void }) {
  const pathname = usePathname();
  const { canAccessPage, isLoading } = usePermissions();

  // Filter navigation items based on page access permissions
  const filteredNavigation = useMemo(() => {
    if (isLoading) return navigation; // Show all while loading to avoid flash
    return navigation.filter((item) => {
      const { allowed } = canAccessPage(item.href);
      return allowed;
    });
  }, [canAccessPage, isLoading]);

  return (
    <nav className="flex-1 space-y-1 p-2 overflow-y-auto">
      {filteredNavigation.map((item) => {
        const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
        const isHighlighted = 'highlight' in item && item.highlight;
        return (
          <Link
            key={item.name}
            href={item.href}
            onClick={onLinkClick}
            className={cn(
              'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
              isActive
                ? 'bg-primary text-primary-foreground'
                : isHighlighted
                  ? 'bg-gradient-to-r from-blue-600/20 to-purple-600/20 text-blue-400 border border-blue-500/30 hover:from-blue-600/30 hover:to-purple-600/30'
                  : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
            )}
          >
            <item.icon className="h-5 w-5 shrink-0" />
            {!collapsed && <span>{item.name}</span>}
          </Link>
        );
      })}
    </nav>
  );
}

// Mobile sidebar using Sheet component
export function MobileSidebar() {
  const { isOpen, setIsOpen } = useSidebar();

  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      <SheetContent side="left" className="w-72 p-0">
        <div className="flex h-full flex-col">
          {/* Logo */}
          <div className="flex h-16 items-center justify-between border-b px-4">
            <Link href="/" className="flex items-center gap-2" onClick={() => setIsOpen(false)}>
              <Stethoscope className="h-8 w-8 text-primary" />
              <span className="text-lg font-bold text-primary">Cortex</span>
            </Link>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setIsOpen(false)}
              aria-label="Închide meniul"
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </Button>
          </div>

          {/* Navigation */}
          <SidebarNav onLinkClick={() => setIsOpen(false)} />

          {/* Footer */}
          <div className="border-t p-4">
            <p className="text-xs text-muted-foreground text-center">MedicalCor Cortex v1.0</p>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

// Mobile menu trigger button
export function MobileMenuTrigger() {
  const { setIsOpen, isMobile } = useSidebar();

  if (!isMobile) return null;

  return (
    <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setIsOpen(true)}>
      <Menu className="h-5 w-5" />
      <span className="sr-only">Deschide meniul</span>
    </Button>
  );
}

// Desktop sidebar
export function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const { isMobile } = useSidebar();

  // Don't render on mobile - use MobileSidebar instead
  if (isMobile) return null;

  return (
    <aside
      className={cn(
        'fixed left-0 top-0 z-40 h-screen border-r bg-card transition-all duration-300 hidden lg:block',
        collapsed ? 'w-16' : 'w-64'
      )}
      aria-label="Navigare principală"
    >
      <div className="flex h-full flex-col">
        {/* Logo */}
        <div className="flex h-16 items-center justify-between border-b px-4">
          {!collapsed && (
            <Link href="/" className="flex items-center gap-2">
              <Stethoscope className="h-8 w-8 text-primary" />
              <span className="text-lg font-bold text-primary">Cortex</span>
            </Link>
          )}
          {collapsed && (
            <Link href="/" className="mx-auto">
              <Stethoscope className="h-8 w-8 text-primary" />
            </Link>
          )}
        </div>

        {/* Navigation */}
        <SidebarNav collapsed={collapsed} />

        {/* Collapse button */}
        <div className="border-t p-2">
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-center"
            onClick={() => setCollapsed(!collapsed)}
            aria-label={collapsed ? 'Extinde bara laterală' : 'Restrânge bara laterală'}
            aria-expanded={!collapsed}
          >
            {collapsed ? (
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            ) : (
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            )}
          </Button>
        </div>
      </div>
    </aside>
  );
}
