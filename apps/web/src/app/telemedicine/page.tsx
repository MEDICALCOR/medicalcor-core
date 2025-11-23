'use client';

import { useState } from 'react';
import {
  Video,
  Calendar,
  Clock,
  Users,
  Plus,
  Play,
  Settings,
  Link2,
  Copy,
  CheckCircle,
  Monitor,
  Mic,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
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

interface VideoConsultation {
  id: string;
  patientId: string;
  patientName: string;
  doctorId: string;
  doctorName: string;
  scheduledAt: Date;
  duration: number;
  status: 'scheduled' | 'in_progress' | 'completed' | 'cancelled' | 'no_show';
  meetingUrl: string;
  notes?: string;
}

const consultations: VideoConsultation[] = [
  {
    id: 'vc1',
    patientId: 'p1',
    patientName: 'Ion Popescu',
    doctorId: 'd1',
    doctorName: 'Dr. Maria Ionescu',
    scheduledAt: new Date(Date.now() + 30 * 60 * 1000),
    duration: 30,
    status: 'scheduled',
    meetingUrl: 'https://meet.medicalcor.ro/abc123',
  },
  {
    id: 'vc2',
    patientId: 'p2',
    patientName: 'Maria Stan',
    doctorId: 'd2',
    doctorName: 'Dr. Elena Dumitrescu',
    scheduledAt: new Date(Date.now() + 2 * 60 * 60 * 1000),
    duration: 45,
    status: 'scheduled',
    meetingUrl: 'https://meet.medicalcor.ro/def456',
  },
  {
    id: 'vc3',
    patientId: 'p3',
    patientName: 'Andrei Georgescu',
    doctorId: 'd1',
    doctorName: 'Dr. Maria Ionescu',
    scheduledAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
    duration: 30,
    status: 'completed',
    meetingUrl: 'https://meet.medicalcor.ro/ghi789',
    notes: 'Consultație de control - pacient în stare bună',
  },
  {
    id: 'vc4',
    patientId: 'p4',
    patientName: 'Elena Dumitrescu',
    doctorId: 'd3',
    doctorName: 'Dr. Andrei Popa',
    scheduledAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
    duration: 20,
    status: 'no_show',
    meetingUrl: 'https://meet.medicalcor.ro/jkl012',
  },
  {
    id: 'vc5',
    patientId: 'p5',
    patientName: 'Alexandru Stan',
    doctorId: 'd2',
    doctorName: 'Dr. Elena Dumitrescu',
    scheduledAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    duration: 30,
    status: 'scheduled',
    meetingUrl: 'https://meet.medicalcor.ro/mno345',
  },
];

const statusConfig = {
  scheduled: { label: 'Programat', color: 'bg-blue-100 text-blue-700' },
  in_progress: { label: 'În desfășurare', color: 'bg-green-100 text-green-700' },
  completed: { label: 'Finalizat', color: 'bg-gray-100 text-gray-700' },
  cancelled: { label: 'Anulat', color: 'bg-red-100 text-red-700' },
  no_show: { label: 'Neprezentare', color: 'bg-yellow-100 text-yellow-700' },
};

export default function TelemedicinePage() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [copiedLink, setCopiedLink] = useState<string | null>(null);

  const formatDateTime = (date: Date): string => {
    return date.toLocaleString('ro-RO', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const copyLink = (url: string, id: string) => {
    void navigator.clipboard.writeText(url);
    setCopiedLink(id);
    setTimeout(() => setCopiedLink(null), 2000);
  };

  const upcomingConsultations = consultations.filter(
    (c) => c.status === 'scheduled' && c.scheduledAt > new Date()
  );
  const todayCount = consultations.filter(
    (c) => c.scheduledAt.toDateString() === new Date().toDateString()
  ).length;
  const completedCount = consultations.filter((c) => c.status === 'completed').length;

  const nextConsultation = upcomingConsultations.at(0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Video className="h-6 w-6 text-primary" />
            Telemedicină
          </h1>
          <p className="text-muted-foreground mt-1">Consultații video și comunicare la distanță</p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Programează consultație
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Consultație video nouă</DialogTitle>
              <DialogDescription>Programează o consultație video cu pacientul</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Pacient</Label>
                <Select>
                  <SelectTrigger>
                    <SelectValue placeholder="Selectează pacient" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="p1">Ion Popescu</SelectItem>
                    <SelectItem value="p2">Maria Stan</SelectItem>
                    <SelectItem value="p3">Andrei Georgescu</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Data</Label>
                  <Input type="date" />
                </div>
                <div className="space-y-2">
                  <Label>Ora</Label>
                  <Input type="time" />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Durată</Label>
                <Select defaultValue="30">
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="15">15 minute</SelectItem>
                    <SelectItem value="30">30 minute</SelectItem>
                    <SelectItem value="45">45 minute</SelectItem>
                    <SelectItem value="60">60 minute</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center justify-between">
                <Label>Trimite reminder automat</Label>
                <Switch defaultChecked />
              </div>
              <div className="flex justify-end gap-2 pt-4">
                <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                  Anulează
                </Button>
                <Button onClick={() => setIsDialogOpen(false)}>Programează</Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
              <Calendar className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Programate azi</p>
              <p className="text-xl font-bold">{todayCount}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center">
              <CheckCircle className="h-5 w-5 text-green-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Finalizate</p>
              <p className="text-xl font-bold">{completedCount}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-purple-100 flex items-center justify-center">
              <Clock className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Următoarea</p>
              <p className="text-sm font-medium">
                {nextConsultation ? formatDateTime(nextConsultation.scheduledAt) : 'N/A'}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-yellow-100 flex items-center justify-center">
              <Users className="h-5 w-5 text-yellow-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">În așteptare</p>
              <p className="text-xl font-bold">{upcomingConsultations.length}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {nextConsultation && (
        <Card className="border-primary/50 bg-primary/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Video className="h-5 w-5 text-primary" />
              Următoarea consultație
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <Avatar className="h-12 w-12">
                  <AvatarFallback>
                    {nextConsultation.patientName
                      .split(' ')
                      .map((n) => n[0])
                      .join('')}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <h4 className="font-medium">{nextConsultation.patientName}</h4>
                  <p className="text-sm text-muted-foreground">
                    {formatDateTime(nextConsultation.scheduledAt)} • {nextConsultation.duration} min
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => copyLink(nextConsultation.meetingUrl, nextConsultation.id)}
                >
                  {copiedLink === nextConsultation.id ? (
                    <>
                      <CheckCircle className="h-4 w-4 mr-2" />
                      Copiat!
                    </>
                  ) : (
                    <>
                      <Link2 className="h-4 w-4 mr-2" />
                      Copiază link
                    </>
                  )}
                </Button>
                <Button>
                  <Play className="h-4 w-4 mr-2" />
                  Începe acum
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Consultații programate</CardTitle>
            <CardDescription>Lista consultațiilor video</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {consultations.map((consultation) => (
                <div
                  key={consultation.id}
                  className="flex items-center justify-between p-4 border rounded-lg"
                >
                  <div className="flex items-center gap-4">
                    <Avatar>
                      <AvatarFallback>
                        {consultation.patientName
                          .split(' ')
                          .map((n) => n[0])
                          .join('')}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="font-medium">{consultation.patientName}</h4>
                        <Badge className={cn('text-xs', statusConfig[consultation.status].color)}>
                          {statusConfig[consultation.status].label}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {consultation.doctorName} • {consultation.duration} min
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <p className="text-sm font-medium">
                        {formatDateTime(consultation.scheduledAt)}
                      </p>
                    </div>
                    <div className="flex gap-1">
                      {consultation.status === 'scheduled' && (
                        <>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => copyLink(consultation.meetingUrl, consultation.id)}
                          >
                            {copiedLink === consultation.id ? (
                              <CheckCircle className="h-4 w-4 text-green-600" />
                            ) : (
                              <Copy className="h-4 w-4" />
                            )}
                          </Button>
                          <Button variant="ghost" size="icon">
                            <Play className="h-4 w-4" />
                          </Button>
                        </>
                      )}
                      <Button variant="ghost" size="icon">
                        <Settings className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Verificare echipament</CardTitle>
            <CardDescription>Testează camera și microfonul</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="aspect-video bg-muted rounded-lg flex items-center justify-center">
              <Monitor className="h-12 w-12 text-muted-foreground" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" className="w-full">
                <Mic className="h-4 w-4 mr-2" />
                Test microfon
              </Button>
              <Button variant="outline" className="w-full">
                <Video className="h-4 w-4 mr-2" />
                Test cameră
              </Button>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between p-2 border rounded">
                <span className="text-sm">Cameră</span>
                <Badge className="bg-green-100 text-green-700">Funcțional</Badge>
              </div>
              <div className="flex items-center justify-between p-2 border rounded">
                <span className="text-sm">Microfon</span>
                <Badge className="bg-green-100 text-green-700">Funcțional</Badge>
              </div>
              <div className="flex items-center justify-between p-2 border rounded">
                <span className="text-sm">Conexiune</span>
                <Badge className="bg-green-100 text-green-700">Stabilă</Badge>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
