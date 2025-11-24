'use client';

import { useState } from 'react';
import {
  Calendar,
  Check,
  AlertCircle,
  RefreshCw,
  Link2,
  Unlink,
  Clock,
  Users,
  CalendarDays,
  Settings,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface CalendarProvider {
  id: string;
  name: string;
  icon: string;
  connected: boolean;
  lastSync?: Date;
  email?: string;
}

const calendarProviders: CalendarProvider[] = [
  {
    id: 'google',
    name: 'Google Calendar',
    icon: '📅',
    connected: true,
    lastSync: new Date(Date.now() - 15 * 60 * 1000),
    email: 'clinica@gmail.com',
  },
  { id: 'outlook', name: 'Microsoft Outlook', icon: '📆', connected: false },
  { id: 'apple', name: 'Apple Calendar', icon: '🍎', connected: false },
  { id: 'caldav', name: 'CalDAV Generic', icon: '🔗', connected: false },
];

const syncedCalendars = [
  { id: 'c1', name: 'Calendar Principal', color: '#4285F4', eventsCount: 156, provider: 'google' },
  {
    id: 'c2',
    name: 'Programări Dr. Ionescu',
    color: '#0F9D58',
    eventsCount: 42,
    provider: 'google',
  },
  { id: 'c3', name: 'Programări Dr. Popa', color: '#DB4437', eventsCount: 38, provider: 'google' },
];

const recentSyncs = [
  {
    id: 's1',
    action: 'create',
    event: 'Consultație Ion Popescu',
    timestamp: new Date(Date.now() - 5 * 60 * 1000),
    status: 'success',
  },
  {
    id: 's2',
    action: 'update',
    event: 'Control Maria Stan',
    timestamp: new Date(Date.now() - 30 * 60 * 1000),
    status: 'success',
  },
  {
    id: 's3',
    action: 'delete',
    event: 'Anulare programare',
    timestamp: new Date(Date.now() - 60 * 60 * 1000),
    status: 'success',
  },
  {
    id: 's4',
    action: 'create',
    event: 'Ecografie Andrei G.',
    timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000),
    status: 'failed',
  },
];

const actionLabels = {
  create: 'Creat',
  update: 'Actualizat',
  delete: 'Șters',
};

export default function CalendarSyncPage() {
  const [syncDirection, setSyncDirection] = useState('both');

  const connectedCount = calendarProviders.filter((p) => p.connected).length;
  const totalEvents = syncedCalendars.reduce((sum, c) => sum + c.eventsCount, 0);

  const formatRelativeTime = (date: Date): string => {
    const diffMs = Date.now() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 60) return `Acum ${diffMins} min`;
    const diffHours = Math.floor(diffMs / 3600000);
    return `Acum ${diffHours} ore`;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Calendar className="h-6 w-6 text-primary" />
            Sincronizare Calendar
          </h1>
          <p className="text-muted-foreground mt-1">Integrare cu calendare externe</p>
        </div>
        <Button>
          <RefreshCw className="h-4 w-4 mr-2" />
          Sincronizează acum
        </Button>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center">
              <Link2 className="h-5 w-5 text-green-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Conectate</p>
              <p className="text-xl font-bold">{connectedCount}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
              <CalendarDays className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Calendare</p>
              <p className="text-xl font-bold">{syncedCalendars.length}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-purple-100 flex items-center justify-center">
              <Users className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Evenimente</p>
              <p className="text-xl font-bold">{totalEvents}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-yellow-100 flex items-center justify-center">
              <Clock className="h-5 w-5 text-yellow-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Ultima sincr.</p>
              <p className="text-sm font-medium">
                {calendarProviders[0].lastSync
                  ? formatRelativeTime(calendarProviders[0].lastSync)
                  : 'N/A'}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="providers" className="space-y-4">
        <TabsList>
          <TabsTrigger value="providers">Provideri</TabsTrigger>
          <TabsTrigger value="calendars">Calendare</TabsTrigger>
          <TabsTrigger value="settings">Setări</TabsTrigger>
          <TabsTrigger value="logs">Istoric</TabsTrigger>
        </TabsList>

        <TabsContent value="providers">
          <Card>
            <CardHeader>
              <CardTitle>Provideri Calendar</CardTitle>
              <CardDescription>Conectează-te cu serviciile de calendar</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {calendarProviders.map((provider) => (
                <div
                  key={provider.id}
                  className="flex items-center justify-between p-4 border rounded-lg"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-lg bg-muted flex items-center justify-center text-2xl">
                      {provider.icon}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-medium">{provider.name}</h3>
                        {provider.connected && (
                          <Badge className="bg-green-100 text-green-700">
                            <Check className="h-3 w-3 mr-1" />
                            Conectat
                          </Badge>
                        )}
                      </div>
                      {provider.connected && provider.email && (
                        <p className="text-sm text-muted-foreground">{provider.email}</p>
                      )}
                      {provider.connected && provider.lastSync && (
                        <p className="text-xs text-muted-foreground">
                          Ultima sincronizare: {formatRelativeTime(provider.lastSync)}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {provider.connected ? (
                      <>
                        <Button variant="outline" size="sm">
                          <RefreshCw className="h-4 w-4 mr-2" />
                          Sincronizează
                        </Button>
                        <Button variant="outline" size="sm">
                          <Unlink className="h-4 w-4 mr-2" />
                          Deconectează
                        </Button>
                      </>
                    ) : (
                      <Button size="sm">
                        <Link2 className="h-4 w-4 mr-2" />
                        Conectează
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="calendars">
          <Card>
            <CardHeader>
              <CardTitle>Calendare sincronizate</CardTitle>
              <CardDescription>Gestionează calendarele conectate</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {syncedCalendars.map((calendar) => (
                <div
                  key={calendar.id}
                  className="flex items-center justify-between p-4 border rounded-lg"
                >
                  <div className="flex items-center gap-4">
                    <div
                      className="w-4 h-4 rounded-full"
                      style={{ backgroundColor: calendar.color }}
                    />
                    <div>
                      <h3 className="font-medium">{calendar.name}</h3>
                      <p className="text-sm text-muted-foreground">
                        {calendar.eventsCount} evenimente
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Switch defaultChecked />
                    <Button variant="outline" size="sm">
                      <Settings className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="settings">
          <div className="grid lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Setări sincronizare</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Direcție sincronizare</Label>
                  <Select value={syncDirection} onValueChange={setSyncDirection}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="both">Bidirecțional</SelectItem>
                      <SelectItem value="to_external">Doar spre extern</SelectItem>
                      <SelectItem value="from_external">Doar din extern</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Interval sincronizare</Label>
                  <Select defaultValue="15">
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="5">La fiecare 5 minute</SelectItem>
                      <SelectItem value="15">La fiecare 15 minute</SelectItem>
                      <SelectItem value="30">La fiecare 30 minute</SelectItem>
                      <SelectItem value="60">La fiecare oră</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <Label>Sincronizare automată</Label>
                    <p className="text-sm text-muted-foreground">
                      Sincronizează automat evenimentele
                    </p>
                  </div>
                  <Switch defaultChecked />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <Label>Include detalii pacient</Label>
                    <p className="text-sm text-muted-foreground">
                      Adaugă numele pacientului în titlu
                    </p>
                  </div>
                  <Switch defaultChecked />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Notificări calendar</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <Label>Reminder 24h înainte</Label>
                  </div>
                  <Switch defaultChecked />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <Label>Reminder 1h înainte</Label>
                  </div>
                  <Switch defaultChecked />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <Label>Reminder 15min înainte</Label>
                  </div>
                  <Switch />
                </div>
                <div className="space-y-2">
                  <Label>Culoare programări</Label>
                  <div className="flex gap-2">
                    {['#4285F4', '#0F9D58', '#DB4437', '#F4B400', '#AB47BC'].map((color) => (
                      <button
                        key={color}
                        className="w-8 h-8 rounded-full border-2 border-transparent hover:border-foreground transition-colors"
                        style={{ backgroundColor: color }}
                      />
                    ))}
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Calendar ID pentru ICS</Label>
                  <Input readOnly value="cal_medicalcor_abc123xyz" />
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="logs">
          <Card>
            <CardHeader>
              <CardTitle>Istoric sincronizare</CardTitle>
              <CardDescription>Ultimele acțiuni de sincronizare</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {recentSyncs.map((sync) => (
                  <div
                    key={sync.id}
                    className="flex items-center justify-between p-4 border rounded-lg"
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
                        <Calendar className="h-5 w-5" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline">
                            {actionLabels[sync.action as keyof typeof actionLabels]}
                          </Badge>
                          <span className="font-medium">{sync.event}</span>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {formatRelativeTime(sync.timestamp)}
                        </p>
                      </div>
                    </div>
                    <Badge
                      className={
                        sync.status === 'success'
                          ? 'bg-green-100 text-green-700'
                          : 'bg-red-100 text-red-700'
                      }
                    >
                      {sync.status === 'success' ? (
                        <Check className="h-3 w-3 mr-1" />
                      ) : (
                        <AlertCircle className="h-3 w-3 mr-1" />
                      )}
                      {sync.status === 'success' ? 'Succes' : 'Eșuat'}
                    </Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
