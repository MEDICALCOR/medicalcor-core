'use client';

import { useState } from 'react';
import {
  Bell,
  Plus,
  Clock,
  Mail,
  MessageSquare,
  Calendar,
  Settings,
  Edit,
  Trash2,
  Check,
  Send,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';

interface Reminder {
  id: string;
  name: string;
  type: 'appointment' | 'followup' | 'birthday' | 'custom';
  channels: ('sms' | 'email' | 'whatsapp')[];
  timing: string;
  isActive: boolean;
  sentCount: number;
  template: string;
}

const reminders: Reminder[] = [
  {
    id: 'r1',
    name: 'Reminder programare - 24h',
    type: 'appointment',
    channels: ['sms', 'email'],
    timing: '24 ore înainte',
    isActive: true,
    sentCount: 1234,
    template: 'Bună ziua {nume}! Vă reamintim că aveți programare mâine la ora {ora}...',
  },
  {
    id: 'r2',
    name: 'Reminder programare - 2h',
    type: 'appointment',
    channels: ['sms'],
    timing: '2 ore înainte',
    isActive: true,
    sentCount: 1189,
    template: 'Programarea dvs. este peste 2 ore. Vă așteptăm la {adresa}!',
  },
  {
    id: 'r3',
    name: 'Follow-up post consultație',
    type: 'followup',
    channels: ['email'],
    timing: '3 zile după',
    isActive: true,
    sentCount: 456,
    template: 'Bună ziua {nume}! Sperăm că vă simțiți mai bine...',
  },
  {
    id: 'r4',
    name: 'Urări de ziua de naștere',
    type: 'birthday',
    channels: ['sms', 'whatsapp'],
    timing: 'În ziua evenimentului',
    isActive: false,
    sentCount: 89,
    template: 'La mulți ani, {nume}! Echipa MedicalCor vă urează...',
  },
  {
    id: 'r5',
    name: 'Reminder control periodic',
    type: 'custom',
    channels: ['email', 'sms'],
    timing: '6 luni după ultima vizită',
    isActive: true,
    sentCount: 234,
    template: 'Au trecut 6 luni de la ultima vizită. Vă recomandăm un control...',
  },
];

const stats = {
  totalSent: 3202,
  smsCount: 1845,
  emailCount: 1120,
  whatsappCount: 237,
  deliveryRate: 98.5,
};

const typeLabels = {
  appointment: 'Programare',
  followup: 'Follow-up',
  birthday: 'Zi de naștere',
  custom: 'Personalizat',
};

const typeColors = {
  appointment: 'bg-blue-100 text-blue-700',
  followup: 'bg-green-100 text-green-700',
  birthday: 'bg-pink-100 text-pink-700',
  custom: 'bg-purple-100 text-purple-700',
};

export default function RemindersPage() {
  const [remindersList, setRemindersList] = useState(reminders);
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const toggleReminder = (id: string) => {
    setRemindersList((prev) =>
      prev.map((r) => (r.id === id ? { ...r, isActive: !r.isActive } : r))
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Bell className="h-6 w-6 text-primary" />
            Sistem Remindere
          </h1>
          <p className="text-muted-foreground mt-1">
            Notificări automate SMS și Email pentru pacienți
          </p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Reminder nou
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Creează reminder nou</DialogTitle>
              <DialogDescription>
                Configurează un nou reminder automat pentru pacienți
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Nume reminder</Label>
                  <Input placeholder="ex: Reminder programare" />
                </div>
                <div className="space-y-2">
                  <Label>Tip</Label>
                  <Select>
                    <SelectTrigger>
                      <SelectValue placeholder="Selectează tipul" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="appointment">Programare</SelectItem>
                      <SelectItem value="followup">Follow-up</SelectItem>
                      <SelectItem value="birthday">Zi de naștere</SelectItem>
                      <SelectItem value="custom">Personalizat</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Canale de comunicare</Label>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" className="rounded" defaultChecked />
                    <Mail className="h-4 w-4" />
                    <span className="text-sm">Email</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" className="rounded" defaultChecked />
                    <MessageSquare className="h-4 w-4" />
                    <span className="text-sm">SMS</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" className="rounded" />
                    <MessageSquare className="h-4 w-4" />
                    <span className="text-sm">WhatsApp</span>
                  </label>
                </div>
              </div>
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Timing</Label>
                  <Select>
                    <SelectTrigger>
                      <SelectValue placeholder="Când să se trimită" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="24h-before">24 ore înainte</SelectItem>
                      <SelectItem value="2h-before">2 ore înainte</SelectItem>
                      <SelectItem value="1d-after">1 zi după</SelectItem>
                      <SelectItem value="3d-after">3 zile după</SelectItem>
                      <SelectItem value="1w-after">1 săptămână după</SelectItem>
                      <SelectItem value="1m-after">1 lună după</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Oră trimitere</Label>
                  <Select>
                    <SelectTrigger>
                      <SelectValue placeholder="Ora preferată" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="09:00">09:00</SelectItem>
                      <SelectItem value="10:00">10:00</SelectItem>
                      <SelectItem value="12:00">12:00</SelectItem>
                      <SelectItem value="14:00">14:00</SelectItem>
                      <SelectItem value="16:00">16:00</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Mesaj template</Label>
                <Textarea
                  placeholder="Bună ziua {nume}! Vă reamintim că aveți programare..."
                  rows={4}
                />
                <p className="text-xs text-muted-foreground">
                  Variabile disponibile: {'{nume}'}, {'{data}'}, {'{ora}'}, {'{medic}'},{' '}
                  {'{serviciu}'}
                </p>
              </div>
              <div className="flex justify-end gap-2 pt-4">
                <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                  Anulează
                </Button>
                <Button onClick={() => setIsDialogOpen(false)}>
                  <Check className="h-4 w-4 mr-2" />
                  Salvează
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Stats */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <Send className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total trimise</p>
                <p className="text-xl font-bold">{stats.totalSent.toLocaleString()}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
                <MessageSquare className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">SMS-uri</p>
                <p className="text-xl font-bold">{stats.smsCount.toLocaleString()}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center">
                <Mail className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Email-uri</p>
                <p className="text-xl font-bold">{stats.emailCount.toLocaleString()}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-emerald-100 flex items-center justify-center">
                <MessageSquare className="h-5 w-5 text-emerald-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">WhatsApp</p>
                <p className="text-xl font-bold">{stats.whatsappCount.toLocaleString()}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-yellow-100 flex items-center justify-center">
                <Check className="h-5 w-5 text-yellow-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Rată livrare</p>
                <p className="text-xl font-bold">{stats.deliveryRate}%</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Reminders List */}
      <Card>
        <CardHeader>
          <CardTitle>Remindere active</CardTitle>
          <CardDescription>Gestionează notificările automate pentru pacienți</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {remindersList.map((reminder) => (
              <div
                key={reminder.id}
                className={cn(
                  'p-4 border rounded-lg transition-opacity',
                  !reminder.isActive && 'opacity-60'
                )}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-4">
                    <div
                      className={cn(
                        'w-10 h-10 rounded-lg flex items-center justify-center',
                        typeColors[reminder.type]
                      )}
                    >
                      {reminder.type === 'appointment' && <Calendar className="h-5 w-5" />}
                      {reminder.type === 'followup' && <Clock className="h-5 w-5" />}
                      {reminder.type === 'birthday' && <Bell className="h-5 w-5" />}
                      {reminder.type === 'custom' && <Settings className="h-5 w-5" />}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="font-medium">{reminder.name}</h4>
                        <Badge variant="outline" className="text-xs">
                          {typeLabels[reminder.type]}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">{reminder.timing}</p>
                      <div className="flex items-center gap-2 mt-2">
                        {reminder.channels.includes('sms') && (
                          <Badge variant="secondary" className="text-xs gap-1">
                            <MessageSquare className="h-3 w-3" />
                            SMS
                          </Badge>
                        )}
                        {reminder.channels.includes('email') && (
                          <Badge variant="secondary" className="text-xs gap-1">
                            <Mail className="h-3 w-3" />
                            Email
                          </Badge>
                        )}
                        {reminder.channels.includes('whatsapp') && (
                          <Badge variant="secondary" className="text-xs gap-1">
                            <MessageSquare className="h-3 w-3" />
                            WhatsApp
                          </Badge>
                        )}
                        <span className="text-xs text-muted-foreground ml-2">
                          {reminder.sentCount.toLocaleString()} trimise
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={reminder.isActive}
                      onCheckedChange={() => toggleReminder(reminder.id)}
                    />
                    <Button variant="ghost" size="icon">
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <div className="mt-3 p-3 bg-muted/50 rounded text-sm text-muted-foreground">
                  {reminder.template}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
