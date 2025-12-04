'use client';

import { useState, useEffect, useTransition } from 'react';
import {
  getRemindersAction,
  getReminderStatsAction,
  toggleReminderAction,
  deleteReminderAction,
  type Reminder,
  type ReminderStats,
} from '@/app/actions';
import { useToast } from '@/hooks/use-toast';
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
  Loader2,
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

const typeLabels: Record<string, string> = {
  appointment: 'Programare',
  follow_up: 'Follow-up',
  followup: 'Follow-up',
  medication: 'Medicație',
  payment: 'Plată',
  birthday: 'Zi de naștere',
  custom: 'Personalizat',
};

const typeColors: Record<string, string> = {
  appointment: 'bg-blue-100 text-blue-700',
  follow_up: 'bg-green-100 text-green-700',
  followup: 'bg-green-100 text-green-700',
  medication: 'bg-orange-100 text-orange-700',
  payment: 'bg-yellow-100 text-yellow-700',
  birthday: 'bg-pink-100 text-pink-700',
  custom: 'bg-purple-100 text-purple-700',
};

export default function RemindersPage() {
  const [remindersList, setRemindersList] = useState<Reminder[]>([]);
  const [stats, setStats] = useState<ReminderStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isPending, startTransition] = useTransition();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setIsLoading(true);
    try {
      const [remindersResult, statsResult] = await Promise.all([
        getRemindersAction(),
        getReminderStatsAction(),
      ]);

      if (remindersResult.reminders) {
        setRemindersList(remindersResult.reminders);
      }
      if (statsResult.stats) {
        setStats(statsResult.stats);
      }
    } catch (_error) {
      toast({
        title: 'Eroare',
        description: 'Nu s-au putut încărca reminderele',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  }

  async function handleToggle(id: string) {
    startTransition(async () => {
      const result = await toggleReminderAction(id);
      if (result.reminder) {
        setRemindersList((prev) =>
          prev.map((r) => (r.id === id ? result.reminder! : r))
        );
        toast({
          title: 'Succes',
          description: result.reminder.isActive ? 'Reminder activat' : 'Reminder dezactivat',
        });
      } else {
        toast({ title: 'Eroare', description: result.error, variant: 'destructive' });
      }
    });
  }

  async function handleDelete(id: string) {
    startTransition(async () => {
      const result = await deleteReminderAction(id);
      if (result.success) {
        setRemindersList((prev) => prev.filter((r) => r.id !== id));
        toast({ title: 'Succes', description: 'Reminderul a fost șters' });
      } else {
        toast({ title: 'Eroare', description: result.error, variant: 'destructive' });
      }
    });
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
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
                      <SelectItem value="follow_up">Follow-up</SelectItem>
                      <SelectItem value="medication">Medicație</SelectItem>
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

      <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <Send className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total trimise</p>
                <p className="text-xl font-bold">{(stats?.totalSent ?? 0).toLocaleString()}</p>
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
                <p className="text-xl font-bold">{(stats?.smsCount ?? 0).toLocaleString()}</p>
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
                <p className="text-xl font-bold">{(stats?.emailCount ?? 0).toLocaleString()}</p>
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
                <p className="text-xl font-bold">{(stats?.whatsappCount ?? 0).toLocaleString()}</p>
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
                <p className="text-xl font-bold">{stats?.deliveryRate?.toFixed(1) ?? 0}%</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Remindere active</CardTitle>
          <CardDescription>Gestionează notificările automate pentru pacienți</CardDescription>
        </CardHeader>
        <CardContent>
          {remindersList.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Bell className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>Nu există remindere configurate</p>
              <p className="text-sm">Creează primul reminder automat</p>
            </div>
          ) : (
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
                          typeColors[reminder.type] ?? 'bg-gray-100 text-gray-700'
                        )}
                      >
                        {reminder.type === 'appointment' && <Calendar className="h-5 w-5" />}
                        {reminder.type === 'payment' && <Clock className="h-5 w-5" />}
                        {reminder.type === 'birthday' && <Bell className="h-5 w-5" />}
                        {reminder.type === 'medication' && <Bell className="h-5 w-5" />}
                        {reminder.type === 'custom' && <Settings className="h-5 w-5" />}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="font-medium">{reminder.name}</h4>
                          <Badge variant="outline" className="text-xs">
                            {typeLabels[reminder.type] ?? reminder.type}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground mt-1">{reminder.timing}</p>
                        <div className="flex items-center gap-2 mt-2">
                          {reminder.channels?.includes('sms') && (
                            <Badge variant="secondary" className="text-xs gap-1">
                              <MessageSquare className="h-3 w-3" />
                              SMS
                            </Badge>
                          )}
                          {reminder.channels?.includes('email') && (
                            <Badge variant="secondary" className="text-xs gap-1">
                              <Mail className="h-3 w-3" />
                              Email
                            </Badge>
                          )}
                          {reminder.channels?.includes('whatsapp') && (
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
                        onCheckedChange={() => handleToggle(reminder.id)}
                        disabled={isPending}
                      />
                      <Button variant="ghost" size="icon">
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDelete(reminder.id)}
                        disabled={isPending}
                      >
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
          )}
        </CardContent>
      </Card>
    </div>
  );
}
