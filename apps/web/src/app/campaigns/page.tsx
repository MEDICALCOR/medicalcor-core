'use client';

import {
  Mail,
  Plus,
  Send,
  Users,
  BarChart3,
  Edit,
  Trash2,
  Copy,
  Eye,
  Clock,
  CheckCircle2,
  XCircle,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';

interface Campaign {
  id: string;
  name: string;
  subject: string;
  status: 'draft' | 'scheduled' | 'sending' | 'sent' | 'paused';
  recipients: number;
  sent: number;
  opened: number;
  clicked: number;
  scheduledAt?: Date;
  sentAt?: Date;
}

const campaigns: Campaign[] = [
  {
    id: 'c1',
    name: 'Promoție Consultații Ianuarie',
    subject: 'Reducere 20% la consultații',
    status: 'sent',
    recipients: 1500,
    sent: 1487,
    opened: 456,
    clicked: 89,
    sentAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
  },
  {
    id: 'c2',
    name: 'Newsletter Săptămânal',
    subject: 'Noutăți și sfaturi medicale',
    status: 'scheduled',
    recipients: 2300,
    sent: 0,
    opened: 0,
    clicked: 0,
    scheduledAt: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
  },
  {
    id: 'c3',
    name: 'Campanie Vaccinare',
    subject: 'Programează-te pentru vaccinare',
    status: 'sending',
    recipients: 800,
    sent: 456,
    opened: 0,
    clicked: 0,
  },
  {
    id: 'c4',
    name: 'Reminder Control Anual',
    subject: 'Este timpul pentru controlul anual',
    status: 'draft',
    recipients: 0,
    sent: 0,
    opened: 0,
    clicked: 0,
  },
  {
    id: 'c5',
    name: 'Promoție Analize',
    subject: 'Pachete analize la preț special',
    status: 'sent',
    recipients: 2100,
    sent: 2089,
    opened: 678,
    clicked: 156,
    sentAt: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000),
  },
];

const statusConfig = {
  draft: { label: 'Ciornă', color: 'bg-gray-100 text-gray-700', icon: Edit },
  scheduled: { label: 'Programat', color: 'bg-blue-100 text-blue-700', icon: Clock },
  sending: { label: 'Se trimite', color: 'bg-yellow-100 text-yellow-700', icon: Send },
  sent: { label: 'Trimis', color: 'bg-green-100 text-green-700', icon: CheckCircle2 },
  paused: { label: 'Pauză', color: 'bg-orange-100 text-orange-700', icon: XCircle },
};

export default function CampaignsPage() {
  const totalSent = campaigns.reduce((sum, c) => sum + c.sent, 0);
  const totalOpened = campaigns.reduce((sum, c) => sum + c.opened, 0);
  const totalClicked = campaigns.reduce((sum, c) => sum + c.clicked, 0);
  const avgOpenRate = totalSent > 0 ? ((totalOpened / totalSent) * 100).toFixed(1) : '0';
  const avgClickRate = totalOpened > 0 ? ((totalClicked / totalOpened) * 100).toFixed(1) : '0';

  const formatDate = (date: Date): string => {
    return date.toLocaleDateString('ro-RO', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Mail className="h-6 w-6 text-primary" />
            Campanii Email
          </h1>
          <p className="text-muted-foreground mt-1">
            Creează și gestionează campanii de email marketing
          </p>
        </div>
        <Button>
          <Plus className="h-4 w-4 mr-2" />
          Campanie nouă
        </Button>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
                <Send className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total trimise</p>
                <p className="text-xl font-bold">{totalSent.toLocaleString()}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center">
                <Eye className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Rată deschidere</p>
                <p className="text-xl font-bold">{avgOpenRate}%</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-purple-100 flex items-center justify-center">
                <BarChart3 className="h-5 w-5 text-purple-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Rată click</p>
                <p className="text-xl font-bold">{avgClickRate}%</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-yellow-100 flex items-center justify-center">
                <Users className="h-5 w-5 text-yellow-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Abonați activi</p>
                <p className="text-xl font-bold">4,521</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Campaniile mele</CardTitle>
          <CardDescription>Toate campaniile de email create</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {campaigns.map((campaign) => {
              const StatusIcon = statusConfig[campaign.status].icon;
              const openRate = campaign.sent > 0 ? (campaign.opened / campaign.sent) * 100 : 0;

              return (
                <div key={campaign.id} className="p-4 border rounded-lg">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <h4 className="font-medium">{campaign.name}</h4>
                        <Badge className={cn('text-xs', statusConfig[campaign.status].color)}>
                          <StatusIcon className="h-3 w-3 mr-1" />
                          {statusConfig[campaign.status].label}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">{campaign.subject}</p>
                      {campaign.status === 'scheduled' && campaign.scheduledAt && (
                        <p className="text-xs text-muted-foreground mt-2">
                          <Clock className="h-3 w-3 inline mr-1" />
                          Programat: {formatDate(campaign.scheduledAt)}
                        </p>
                      )}
                      {campaign.status === 'sent' && campaign.sentAt && (
                        <p className="text-xs text-muted-foreground mt-2">
                          <CheckCircle2 className="h-3 w-3 inline mr-1" />
                          Trimis: {formatDate(campaign.sentAt)}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <Button variant="ghost" size="icon">
                        <Eye className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon">
                        <Copy className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  {(campaign.status === 'sent' || campaign.status === 'sending') && (
                    <div className="mt-4 pt-4 border-t">
                      <div className="grid grid-cols-4 gap-4 text-center text-sm">
                        <div>
                          <p className="text-muted-foreground">Destinatari</p>
                          <p className="font-medium">{campaign.recipients.toLocaleString()}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Trimise</p>
                          <p className="font-medium">{campaign.sent.toLocaleString()}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Deschise</p>
                          <p className="font-medium">
                            {campaign.opened.toLocaleString()} ({openRate.toFixed(0)}%)
                          </p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Click-uri</p>
                          <p className="font-medium">{campaign.clicked.toLocaleString()}</p>
                        </div>
                      </div>
                      {campaign.status === 'sending' && (
                        <div className="mt-3">
                          <Progress
                            value={(campaign.sent / campaign.recipients) * 100}
                            className="h-2"
                          />
                          <p className="text-xs text-muted-foreground mt-1 text-center">
                            {Math.round((campaign.sent / campaign.recipients) * 100)}% completat
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
