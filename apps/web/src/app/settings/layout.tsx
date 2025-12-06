'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { User, Link2, Bell, FileText, Settings, MessageSquare } from 'lucide-react';
import { cn } from '@/lib/utils';

const settingsNav = [
  { name: 'Profil', href: '/settings', icon: User },
  { name: 'Integrări', href: '/settings/integrations', icon: Link2 },
  { name: 'Notificări', href: '/settings/notifications', icon: Bell },
  { name: 'Template-uri', href: '/settings/templates', icon: FileText },
  { name: 'WhatsApp', href: '/settings/whatsapp', icon: MessageSquare },
];

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Settings className="h-6 w-6 text-primary" />
          Setări
        </h1>
        <p className="text-muted-foreground mt-1">Configurează aplicația și preferințele tale</p>
      </div>

      <div className="flex gap-6">
        {/* Sidebar Navigation */}
        <nav className="w-48 shrink-0">
          <ul className="space-y-1">
            {settingsNav.map((item) => {
              const isActive =
                item.href === '/settings'
                  ? pathname === '/settings'
                  : pathname.startsWith(item.href);

              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className={cn(
                      'flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                      isActive
                        ? 'bg-primary text-primary-foreground'
                        : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                    )}
                  >
                    <item.icon className="h-4 w-4" />
                    {item.name}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* Content */}
        <div className="flex-1 min-w-0">{children}</div>
      </div>
    </div>
  );
}
