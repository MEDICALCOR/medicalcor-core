'use client';

import { useState } from 'react';
import {
  Mail,
  Check,
  AlertCircle,
  Send,
  Server,
  Shield,
  Inbox,
  BarChart3,
  RefreshCw,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface EmailProvider {
  id: string;
  name: string;
  type: 'smtp' | 'api';
  enabled: boolean;
  status: 'active' | 'inactive' | 'error';
}

const providers: EmailProvider[] = [
  { id: 'smtp', name: 'SMTP Custom', type: 'smtp', enabled: true, status: 'active' },
  { id: 'sendgrid', name: 'SendGrid', type: 'api', enabled: false, status: 'inactive' },
  { id: 'mailgun', name: 'Mailgun', type: 'api', enabled: false, status: 'inactive' },
  { id: 'ses', name: 'Amazon SES', type: 'api', enabled: false, status: 'inactive' },
];

const recentEmails = [
  {
    id: 'e1',
    to: 'pacient@email.com',
    subject: 'Confirmare programare',
    status: 'delivered',
    timestamp: new Date(Date.now() - 10 * 60 * 1000),
  },
  {
    id: 'e2',
    to: 'alt.pacient@email.com',
    subject: 'Rezultate analize',
    status: 'delivered',
    timestamp: new Date(Date.now() - 30 * 60 * 1000),
  },
  {
    id: 'e3',
    to: 'test@email.com',
    subject: 'Reminder consultație',
    status: 'bounced',
    timestamp: new Date(Date.now() - 60 * 60 * 1000),
  },
  {
    id: 'e4',
    to: 'user@example.com',
    subject: 'Factură #1234',
    status: 'delivered',
    timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000),
  },
];

const statusConfig: Record<string, { label: string; color: string }> = {
  delivered: { label: 'Livrat', color: 'bg-green-100 text-green-700' },
  pending: { label: 'În trimitere', color: 'bg-yellow-100 text-yellow-700' },
  bounced: { label: 'Respins', color: 'bg-red-100 text-red-700' },
};

export default function EmailProviderPage() {
  const [_selectedProvider, setSelectedProvider] = useState('smtp');
  const [testEmail, setTestEmail] = useState('');

  const deliveredCount = recentEmails.filter((e) => e.status === 'delivered').length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Mail className="h-6 w-6 text-primary" />
            Provider Email
          </h1>
          <p className="text-muted-foreground mt-1">Configurare SMTP și servicii de email</p>
        </div>
        <Button>
          <Send className="h-4 w-4 mr-2" />
          Email de test
        </Button>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center">
              <Send className="h-5 w-5 text-green-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Trimise azi</p>
              <p className="text-xl font-bold">{deliveredCount}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
              <BarChart3 className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Rată livrare</p>
              <p className="text-xl font-bold">97.2%</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-purple-100 flex items-center justify-center">
              <Inbox className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Inbox Rate</p>
              <p className="text-xl font-bold">94.8%</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-red-100 flex items-center justify-center">
              <AlertCircle className="h-5 w-5 text-red-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Bounce</p>
              <p className="text-xl font-bold">
                {recentEmails.filter((e) => e.status === 'bounced').length}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="providers" className="space-y-4">
        <TabsList>
          <TabsTrigger value="providers">Provideri</TabsTrigger>
          <TabsTrigger value="smtp">SMTP</TabsTrigger>
          <TabsTrigger value="templates">Șabloane</TabsTrigger>
          <TabsTrigger value="logs">Istoric</TabsTrigger>
        </TabsList>

        <TabsContent value="providers">
          <Card>
            <CardHeader>
              <CardTitle>Provideri Email</CardTitle>
              <CardDescription>Selectează metoda de trimitere email</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {providers.map((provider) => (
                <div
                  key={provider.id}
                  className="flex items-center justify-between p-4 border rounded-lg"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-lg bg-muted flex items-center justify-center">
                      {provider.type === 'smtp' ? (
                        <Server className="h-6 w-6" />
                      ) : (
                        <Mail className="h-6 w-6" />
                      )}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-medium">{provider.name}</h3>
                        <Badge variant="outline">{provider.type.toUpperCase()}</Badge>
                        {provider.enabled && (
                          <Badge
                            className={
                              provider.status === 'active'
                                ? 'bg-green-100 text-green-700'
                                : 'bg-red-100 text-red-700'
                            }
                          >
                            {provider.status === 'active' ? (
                              <Check className="h-3 w-3 mr-1" />
                            ) : (
                              <AlertCircle className="h-3 w-3 mr-1" />
                            )}
                            {provider.status === 'active' ? 'Activ' : 'Eroare'}
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {provider.id === 'smtp' && 'Server SMTP personalizat'}
                        {provider.id === 'sendgrid' && 'API SendGrid pentru volum mare'}
                        {provider.id === 'mailgun' && 'Mailgun transactional email'}
                        {provider.id === 'ses' && 'Amazon Simple Email Service'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Switch checked={provider.enabled} />
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setSelectedProvider(provider.id)}
                    >
                      Configurează
                    </Button>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="smtp">
          <div className="grid lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Server className="h-5 w-5" />
                  Configurare SMTP
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Server SMTP</Label>
                  <Input placeholder="smtp.example.com" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Port</Label>
                    <Select defaultValue="587">
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="25">25 (No SSL)</SelectItem>
                        <SelectItem value="465">465 (SSL)</SelectItem>
                        <SelectItem value="587">587 (TLS)</SelectItem>
                        <SelectItem value="2525">2525 (Alt TLS)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Encriptare</Label>
                    <Select defaultValue="tls">
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Fără</SelectItem>
                        <SelectItem value="ssl">SSL</SelectItem>
                        <SelectItem value="tls">TLS</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Username</Label>
                  <Input placeholder="user@example.com" />
                </div>
                <div className="space-y-2">
                  <Label>Parolă</Label>
                  <Input type="password" placeholder="••••••••••••" />
                </div>
                <div className="space-y-2">
                  <Label>Email expeditor (From)</Label>
                  <Input placeholder="noreply@clinica.ro" />
                </div>
                <div className="space-y-2">
                  <Label>Nume expeditor</Label>
                  <Input placeholder="Clinica MedicalCor" />
                </div>
                <div className="flex justify-end gap-2 pt-4">
                  <Button variant="outline">
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Testează
                  </Button>
                  <Button>Salvează</Button>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Shield className="h-5 w-5" />
                  Securitate
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <Label>DKIM Signing</Label>
                    <p className="text-sm text-muted-foreground">
                      Semnătură digitală pentru autenticitate
                    </p>
                  </div>
                  <Switch defaultChecked />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <Label>SPF Record</Label>
                    <p className="text-sm text-muted-foreground">Verificare expeditor autorizat</p>
                  </div>
                  <Badge className="bg-green-100 text-green-700">Configurat</Badge>
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <Label>DMARC Policy</Label>
                    <p className="text-sm text-muted-foreground">Politică anti-spoofing</p>
                  </div>
                  <Badge className="bg-yellow-100 text-yellow-700">Parțial</Badge>
                </div>
                <div className="space-y-2 pt-4">
                  <Label>Email de test</Label>
                  <div className="flex gap-2">
                    <Input
                      placeholder="test@email.com"
                      value={testEmail}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                        setTestEmail(e.target.value)
                      }
                    />
                    <Button variant="outline">
                      <Send className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="templates">
          <Card>
            <CardHeader>
              <CardTitle>Șabloane Email</CardTitle>
              <CardDescription>Template-uri pentru email-uri automate</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="p-4 border rounded-lg space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="font-medium">Confirmare programare</h4>
                  <Switch defaultChecked />
                </div>
                <Input defaultValue="Confirmare programare - {{doctor}}" />
                <Textarea
                  defaultValue="Stimate/ă {{name}},\n\nProgramarea dvs. la {{doctor}} a fost confirmată pentru {{date}} la ora {{time}}.\n\nVă mulțumim!"
                  rows={4}
                />
              </div>
              <div className="p-4 border rounded-lg space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="font-medium">Reminder programare</h4>
                  <Switch defaultChecked />
                </div>
                <Input defaultValue="Reminder: Programare mâine la {{time}}" />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="logs">
          <Card>
            <CardHeader>
              <CardTitle>Istoric email-uri</CardTitle>
              <CardDescription>Ultimele email-uri trimise</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {recentEmails.map((email) => (
                  <div
                    key={email.id}
                    className="flex items-center justify-between p-4 border rounded-lg"
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
                        <Mail className="h-5 w-5" />
                      </div>
                      <div>
                        <p className="font-medium">{email.subject}</p>
                        <p className="text-sm text-muted-foreground">
                          {email.to} •{' '}
                          {email.timestamp.toLocaleTimeString('ro-RO', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </p>
                      </div>
                    </div>
                    <Badge className={statusConfig[email.status].color}>
                      {statusConfig[email.status].label}
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
