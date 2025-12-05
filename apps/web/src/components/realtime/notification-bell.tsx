'use client';

import { Bell } from 'lucide-react';
import { useRealtimeUrgencies } from '@/lib/realtime';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useState, useRef, useEffect, useId } from 'react';
import { Card, CardContent } from '@/components/ui/card';

export function NotificationBell() {
  const { urgencies, unreadCount, markUrgencyRead, clearAllUrgencies, isUrgencyRead } =
    useRealtimeUrgencies();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Handle keyboard navigation
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (!isOpen) return;

      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  const getPriorityColor = (priority: 'critical' | 'high' | 'medium') => {
    switch (priority) {
      case 'critical':
        return 'bg-red-500';
      case 'high':
        return 'bg-orange-500';
      case 'medium':
        return 'bg-yellow-500';
      default:
        return 'bg-gray-500';
    }
  };

  const formatWaitTime = (minutes: number) => {
    if (minutes < 60) return `${minutes} min`;
    return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
  };

  const handleUrgencyKeyDown = (event: React.KeyboardEvent, urgencyId: string) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      markUrgencyRead(urgencyId);
    }
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <Button
        variant="ghost"
        size="icon"
        className="relative"
        onClick={() => setIsOpen(!isOpen)}
        aria-label={`Notificări${unreadCount > 0 ? ` (${unreadCount} necitite)` : ''}`}
        aria-expanded={isOpen}
        aria-haspopup="menu"
        aria-controls={isOpen ? menuId : undefined}
      >
        <Bell className="h-5 w-5" aria-hidden="true" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center">
            <span
              className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"
              aria-hidden="true"
            />
            <Badge
              variant="destructive"
              className="relative h-5 w-5 p-0 text-xs flex items-center justify-center rounded-full"
              aria-hidden="true"
            >
              {unreadCount > 9 ? '9+' : unreadCount}
            </Badge>
          </span>
        )}
      </Button>

      {isOpen && (
        <Card
          id={menuId}
          role="menu"
          aria-label="Meniu notificări"
          className="absolute right-0 top-full mt-2 w-80 z-50 shadow-lg"
        >
          <div className="flex items-center justify-between p-3 border-b">
            <h3 className="font-semibold" id={`${menuId}-title`}>
              Urgențe
            </h3>
            {urgencies.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="text-xs"
                onClick={clearAllUrgencies}
                aria-label="Marchează toate notificările ca citite"
              >
                Marchează toate citite
              </Button>
            )}
          </div>
          <CardContent className="p-0 max-h-80 overflow-y-auto">
            {urgencies.length === 0 ? (
              <div className="p-4 text-center text-muted-foreground text-sm" role="status">
                Nu sunt urgențe noi
              </div>
            ) : (
              <ul className="divide-y" role="group" aria-labelledby={`${menuId}-title`}>
                {urgencies.map((urgency) => (
                  <li key={urgency.id} role="none">
                    <button
                      type="button"
                      role="menuitem"
                      className={cn(
                        'w-full p-3 hover:bg-muted/50 cursor-pointer transition-colors text-left',
                        !isUrgencyRead(urgency.id) && 'bg-primary/5'
                      )}
                      onClick={() => markUrgencyRead(urgency.id)}
                      onKeyDown={(e) => handleUrgencyKeyDown(e, urgency.id)}
                      aria-label={`${urgency.phone}, ${urgency.reason}, așteptare ${formatWaitTime(urgency.waitingTime)}${!isUrgencyRead(urgency.id) ? ', necitit' : ''}`}
                    >
                      <div className="flex items-start gap-3">
                        <div
                          className={cn(
                            'h-2 w-2 rounded-full mt-2 shrink-0',
                            getPriorityColor(urgency.priority)
                          )}
                          aria-hidden="true"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-medium text-sm truncate">{urgency.phone}</span>
                            <span className="text-xs text-muted-foreground shrink-0">
                              {formatWaitTime(urgency.waitingTime)} așteptare
                            </span>
                          </div>
                          <p className="text-sm text-muted-foreground truncate">{urgency.reason}</p>
                        </div>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
