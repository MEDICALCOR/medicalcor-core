import type { Meta, StoryObj } from '@storybook/react';
import { useState } from 'react';
import { Bell, BellOff, Volume2, VolumeX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface NotificationPreferences {
  enabled: boolean;
  urgencies: boolean;
  newLeads: boolean;
  appointments: boolean;
  sound: boolean;
}

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

interface NotificationSettingsDemoProps {
  isSupported?: boolean;
  permission?: 'default' | 'granted' | 'denied';
  initialPreferences?: NotificationPreferences;
}

function NotificationSettingsDemo({
  isSupported = true,
  permission = 'granted',
  initialPreferences = {
    enabled: true,
    urgencies: true,
    newLeads: true,
    appointments: true,
    sound: true,
  },
}: NotificationSettingsDemoProps) {
  const [preferences, setPreferences] = useState(initialPreferences);

  const updatePreferences = (update: Partial<NotificationPreferences>) => {
    setPreferences((prev) => ({ ...prev, ...update }));
  };

  if (!isSupported) {
    return (
      <Card className="max-w-md">
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
    <Card className="max-w-md">
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
            <Button>Activează notificările</Button>
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
            onToggle={() => updatePreferences({ enabled: !preferences.enabled })}
            disabled={permission !== 'granted'}
          />

          <ToggleRow
            label="Urgențe"
            description="Primește alerte pentru cazurile urgente"
            enabled={preferences.urgencies}
            onToggle={() => updatePreferences({ urgencies: !preferences.urgencies })}
            disabled={!preferences.enabled || permission !== 'granted'}
          />

          <ToggleRow
            label="Lead-uri noi"
            description="Notificări când primești lead-uri noi"
            enabled={preferences.newLeads}
            onToggle={() => updatePreferences({ newLeads: !preferences.newLeads })}
            disabled={!preferences.enabled || permission !== 'granted'}
          />

          <ToggleRow
            label="Programări"
            description="Remindere și actualizări programări"
            enabled={preferences.appointments}
            onToggle={() => updatePreferences({ appointments: !preferences.appointments })}
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
              onClick={() => updatePreferences({ sound: !preferences.sound })}
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

const meta = {
  title: 'Notifications/NotificationSettings',
  component: NotificationSettingsDemo,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
} satisfies Meta<typeof NotificationSettingsDemo>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    isSupported: true,
    permission: 'granted',
  },
};

export const NeedsPermission: Story = {
  args: {
    isSupported: true,
    permission: 'default',
  },
};

export const PermissionDenied: Story = {
  args: {
    isSupported: true,
    permission: 'denied',
  },
};

export const NotSupported: Story = {
  args: {
    isSupported: false,
  },
};

export const AllDisabled: Story = {
  args: {
    isSupported: true,
    permission: 'granted',
    initialPreferences: {
      enabled: false,
      urgencies: false,
      newLeads: false,
      appointments: false,
      sound: false,
    },
  },
};

export const SoundOff: Story = {
  args: {
    isSupported: true,
    permission: 'granted',
    initialPreferences: {
      enabled: true,
      urgencies: true,
      newLeads: true,
      appointments: true,
      sound: false,
    },
  },
};

export const UrgenciesOnly: Story = {
  args: {
    isSupported: true,
    permission: 'granted',
    initialPreferences: {
      enabled: true,
      urgencies: true,
      newLeads: false,
      appointments: false,
      sound: true,
    },
  },
};
