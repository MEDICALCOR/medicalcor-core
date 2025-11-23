'use client';

import { Bell, BellOff, Volume2, VolumeX } from 'lucide-react';
import { useNotifications } from '@/lib/notifications';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface ToggleRowProps {
  label: string;
  description: string;
  enabled: boolean;
  onToggle: () => void;
  disabled?: boolean;
}

function ToggleRow({ label, description, enabled, onToggle, disabled }: ToggleRowProps) {
  return (
    <div className="flex items-center justify-between py-3">
      <div>
        <p className="font-medium text-sm">{label}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <button
        onClick={onToggle}
        disabled={disabled}
        className={cn(
          'relative inline-flex h-6 w-11 items-center rounded-full transition-colors',
          enabled ? 'bg-primary' : 'bg-muted',
          disabled && 'opacity-50 cursor-not-allowed'
        )}
      >
        <span
          className={cn(
            'inline-block h-4 w-4 transform rounded-full bg-white transition-transform',
            enabled ? 'translate-x-6' : 'translate-x-1'
          )}
        />
      </button>
    </div>
  );
}

export function NotificationSettings() {
  const { isSupported, permission, preferences, requestPermission, setPreferences } =
    useNotifications();

  if (!isSupported) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BellOff className="h-5 w-5" />
            Notificări indisponibile
          </CardTitle>
          <CardDescription>Browserul tău nu suportă notificări push.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const needsPermission = permission === 'default';
  const permissionDenied = permission === 'denied';

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bell className="h-5 w-5" />
          Setări Notificări
        </CardTitle>
        <CardDescription>Configurează ce notificări dorești să primești.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {needsPermission && (
          <div className="bg-muted/50 rounded-lg p-4 space-y-3">
            <p className="text-sm">
              Pentru a primi notificări, trebuie să acorzi permisiune browserului.
            </p>
            <Button onClick={requestPermission}>Activează notificările</Button>
          </div>
        )}

        {permissionDenied && (
          <div className="bg-destructive/10 rounded-lg p-4">
            <p className="text-sm text-destructive">
              Notificările au fost blocate. Pentru a le activa, accesează setările browserului.
            </p>
          </div>
        )}

        <div className="divide-y">
          <ToggleRow
            label="Notificări activate"
            description="Activează sau dezactivează toate notificările"
            enabled={preferences.enabled}
            onToggle={() => setPreferences({ enabled: !preferences.enabled })}
            disabled={permission !== 'granted'}
          />

          <ToggleRow
            label="Urgențe"
            description="Primește alerte pentru cazurile urgente"
            enabled={preferences.urgencies}
            onToggle={() => setPreferences({ urgencies: !preferences.urgencies })}
            disabled={!preferences.enabled || permission !== 'granted'}
          />

          <ToggleRow
            label="Lead-uri noi"
            description="Notificări când primești lead-uri noi"
            enabled={preferences.newLeads}
            onToggle={() => setPreferences({ newLeads: !preferences.newLeads })}
            disabled={!preferences.enabled || permission !== 'granted'}
          />

          <ToggleRow
            label="Programări"
            description="Remindere și actualizări programări"
            enabled={preferences.appointments}
            onToggle={() => setPreferences({ appointments: !preferences.appointments })}
            disabled={!preferences.enabled || permission !== 'granted'}
          />

          <div className="flex items-center justify-between py-3">
            <div>
              <p className="font-medium text-sm flex items-center gap-2">
                {preferences.sound ? (
                  <Volume2 className="h-4 w-4" />
                ) : (
                  <VolumeX className="h-4 w-4" />
                )}
                Sunet
              </p>
              <p className="text-xs text-muted-foreground">Redă un sunet la notificări</p>
            </div>
            <button
              onClick={() => setPreferences({ sound: !preferences.sound })}
              disabled={!preferences.enabled || permission !== 'granted'}
              className={cn(
                'relative inline-flex h-6 w-11 items-center rounded-full transition-colors',
                preferences.sound ? 'bg-primary' : 'bg-muted',
                (!preferences.enabled || permission !== 'granted') &&
                  'opacity-50 cursor-not-allowed'
              )}
            >
              <span
                className={cn(
                  'inline-block h-4 w-4 transform rounded-full bg-white transition-transform',
                  preferences.sound ? 'translate-x-6' : 'translate-x-1'
                )}
              />
            </button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
