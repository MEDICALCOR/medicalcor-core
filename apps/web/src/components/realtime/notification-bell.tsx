'use client';

import { Bell } from 'lucide-react';
import { useRealtimeUrgencies } from '@/lib/realtime';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useState, useRef, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';

export function NotificationBell() {
  const { urgencies, unreadCount, markUrgencyRead, clearAllUrgencies, isUrgencyRead } =
    useRealtimeUrgencies();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

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

  const getPriorityColor = (priority: 'critical' | 'high' | 'medium') => {
    switch (priority) {
      case 'critical':
        return 'bg-red-500';
      case 'high':
        return 'bg-orange-500';
      case 'medium':
        return 'bg-yellow-500';
    }
  };

  const formatWaitTime = (minutes: number) => {
    if (minutes < 60) return `${minutes} min`;
    return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <Button variant="ghost" size="icon" className="relative" onClick={() => setIsOpen(!isOpen)}>
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
            <Badge
              variant="destructive"
              className="relative h-5 w-5 p-0 text-xs flex items-center justify-center rounded-full"
            >
              {unreadCount > 9 ? '9+' : unreadCount}
            </Badge>
          </span>
        )}
      </Button>

      {isOpen && (
        <Card className="absolute right-0 top-full mt-2 w-80 z-50 shadow-lg">
          <div className="flex items-center justify-between p-3 border-b">
            <h3 className="font-semibold">Urgențe</h3>
            {urgencies.length > 0 && (
              <Button variant="ghost" size="sm" className="text-xs" onClick={clearAllUrgencies}>
                Marchează toate citite
              </Button>
            )}
          </div>
          <CardContent className="p-0 max-h-80 overflow-y-auto">
            {urgencies.length === 0 ? (
              <div className="p-4 text-center text-muted-foreground text-sm">
                Nu sunt urgențe noi
              </div>
            ) : (
              <ul className="divide-y">
                {urgencies.map((urgency) => (
                  <li
                    key={urgency.id}
                    className={cn(
                      'p-3 hover:bg-muted/50 cursor-pointer transition-colors',
                      !isUrgencyRead(urgency.id) && 'bg-primary/5'
                    )}
                    onClick={() => markUrgencyRead(urgency.id)}
                  >
                    <div className="flex items-start gap-3">
                      <div
                        className={cn(
                          'h-2 w-2 rounded-full mt-2 shrink-0',
                          getPriorityColor(urgency.priority)
                        )}
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
