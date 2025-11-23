'use client';

import { useState } from 'react';
import { Bell, Mail, MessageSquare, Save } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface NotificationSetting {
  id: string;
  label: string;
  description: string;
  email: boolean;
  push: boolean;
  sms: boolean;
}

export default function NotificationsPage() {
  const [settings, setSettings] = useState<NotificationSetting[]>([
    {
      id: 'new_lead',
      label: 'Lead nou',
      description: 'Când un lead nou este adăugat în sistem',
      email: true,
      push: true,
      sms: false,
    },
    {
      id: 'appointment_reminder',
      label: 'Reminder programare',
      description: 'Reminder înainte de programări',
      email: true,
      push: true,
      sms: true,
    },
    {
      id: 'appointment_cancelled',
      label: 'Programare anulată',
      description: 'Când o programare este anulată',
      email: true,
      push: true,
      sms: false,
    },
    {
      id: 'new_message',
      label: 'Mesaj nou',
      description: 'Când primești un mesaj de la pacient',
      email: false,
      push: true,
      sms: false,
    },
    {
      id: 'task_assigned',
      label: 'Task atribuit',
      description: 'Când ți se atribuie un task',
      email: true,
      push: true,
      sms: false,
    },
  ]);

  const [quietHours, setQuietHours] = useState({
    enabled: true,
    start: '22:00',
    end: '08:00',
  });

  const handleToggle = (id: string, channel: 'email' | 'push' | 'sms', value: boolean) => {
    setSettings((prev) => prev.map((s) => (s.id === id ? { ...s, [channel]: value } : s)));
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5" />
            Preferințe Notificări
          </CardTitle>
          <CardDescription>Alege cum și când vrei să primești notificări</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-6">
            {/* Header row */}
            <div className="grid grid-cols-[1fr,80px,80px,80px] gap-4 pb-2 border-b">
              <div />
              <div className="text-center text-xs font-medium text-muted-foreground">
                <Mail className="h-4 w-4 mx-auto mb-1" />
                Email
              </div>
              <div className="text-center text-xs font-medium text-muted-foreground">
                <Bell className="h-4 w-4 mx-auto mb-1" />
                Push
              </div>
              <div className="text-center text-xs font-medium text-muted-foreground">
                <MessageSquare className="h-4 w-4 mx-auto mb-1" />
                SMS
              </div>
            </div>

            {/* Settings rows */}
            {settings.map((setting) => (
              <div
                key={setting.id}
                className="grid grid-cols-[1fr,80px,80px,80px] gap-4 items-center"
              >
                <div>
                  <p className="font-medium text-sm">{setting.label}</p>
                  <p className="text-xs text-muted-foreground">{setting.description}</p>
                </div>
                <div className="flex justify-center">
                  <Switch
                    checked={setting.email}
                    onCheckedChange={(checked: boolean) =>
                      handleToggle(setting.id, 'email', checked)
                    }
                  />
                </div>
                <div className="flex justify-center">
                  <Switch
                    checked={setting.push}
                    onCheckedChange={(checked: boolean) =>
                      handleToggle(setting.id, 'push', checked)
                    }
                  />
                </div>
                <div className="flex justify-center">
                  <Switch
                    checked={setting.sms}
                    onCheckedChange={(checked: boolean) => handleToggle(setting.id, 'sms', checked)}
                  />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Quiet Hours */}
      <Card>
        <CardHeader>
          <CardTitle>Ore de liniște</CardTitle>
          <CardDescription>Dezactivează notificările în anumite intervale orare</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label>Activează orele de liniște</Label>
              <p className="text-xs text-muted-foreground">
                Nu vei primi notificări push în acest interval
              </p>
            </div>
            <Switch
              checked={quietHours.enabled}
              onCheckedChange={(checked: boolean) =>
                setQuietHours((prev) => ({ ...prev, enabled: checked }))
              }
            />
          </div>

          {quietHours.enabled && (
            <div className="grid grid-cols-2 gap-4 pt-2">
              <div className="space-y-2">
                <Label>De la</Label>
                <Select
                  value={quietHours.start}
                  onValueChange={(value: string) =>
                    setQuietHours((prev) => ({ ...prev, start: value }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: 24 }, (_, i) => {
                      const hour = i.toString().padStart(2, '0');
                      return (
                        <SelectItem key={hour} value={`${hour}:00`}>
                          {hour}:00
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Până la</Label>
                <Select
                  value={quietHours.end}
                  onValueChange={(value: string) =>
                    setQuietHours((prev) => ({ ...prev, end: value }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: 24 }, (_, i) => {
                      const hour = i.toString().padStart(2, '0');
                      return (
                        <SelectItem key={hour} value={`${hour}:00`}>
                          {hour}:00
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button>
          <Save className="h-4 w-4 mr-2" />
          Salvează preferințele
        </Button>
      </div>
    </div>
  );
}
