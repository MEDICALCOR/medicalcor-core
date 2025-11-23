'use client';

import { useState } from 'react';
import {
  CreditCard,
  Check,
  AlertCircle,
  Wallet,
  Building2,
  RefreshCw,
  Copy,
  Eye,
  EyeOff,
  TrendingUp,
  DollarSign,
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
import { cn } from '@/lib/utils';

interface PaymentProvider {
  id: string;
  name: string;
  logo: string;
  enabled: boolean;
  testMode: boolean;
  status: 'active' | 'inactive' | 'error';
}

const providers: PaymentProvider[] = [
  { id: 'stripe', name: 'Stripe', logo: '💳', enabled: true, testMode: false, status: 'active' },
  {
    id: 'netopia',
    name: 'Netopia (mobilPay)',
    logo: '🏦',
    enabled: true,
    testMode: true,
    status: 'active',
  },
  { id: 'paypal', name: 'PayPal', logo: '🅿️', enabled: false, testMode: true, status: 'inactive' },
];

const recentTransactions = [
  {
    id: 't1',
    amount: 350,
    currency: 'RON',
    status: 'completed',
    method: 'Stripe',
    date: new Date(Date.now() - 30 * 60 * 1000),
  },
  {
    id: 't2',
    amount: 200,
    currency: 'RON',
    status: 'completed',
    method: 'Netopia',
    date: new Date(Date.now() - 2 * 60 * 60 * 1000),
  },
  {
    id: 't3',
    amount: 500,
    currency: 'RON',
    status: 'pending',
    method: 'Stripe',
    date: new Date(Date.now() - 3 * 60 * 60 * 1000),
  },
  {
    id: 't4',
    amount: 150,
    currency: 'RON',
    status: 'failed',
    method: 'Netopia',
    date: new Date(Date.now() - 5 * 60 * 60 * 1000),
  },
];

const statusConfig: Record<string, { label: string; color: string }> = {
  completed: { label: 'Finalizat', color: 'bg-green-100 text-green-700' },
  pending: { label: 'În așteptare', color: 'bg-yellow-100 text-yellow-700' },
  failed: { label: 'Eșuat', color: 'bg-red-100 text-red-700' },
};

export default function PaymentsPage() {
  const [showSecrets, setShowSecrets] = useState<Record<string, boolean>>({});
  const [selectedProvider, setSelectedProvider] = useState('stripe');

  const toggleSecret = (key: string) => {
    setShowSecrets((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const todayTotal = recentTransactions
    .filter((t) => t.status === 'completed')
    .reduce((sum, t) => sum + t.amount, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <CreditCard className="h-6 w-6 text-primary" />
            Gateway de Plăți
          </h1>
          <p className="text-muted-foreground mt-1">
            Configurare procesatori de plăți și tranzacții
          </p>
        </div>
        <Button>
          <RefreshCw className="h-4 w-4 mr-2" />
          Sincronizează
        </Button>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center">
              <DollarSign className="h-5 w-5 text-green-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Încasări azi</p>
              <p className="text-xl font-bold">{todayTotal} RON</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
              <TrendingUp className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Tranzacții azi</p>
              <p className="text-xl font-bold">{recentTransactions.length}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-purple-100 flex items-center justify-center">
              <Wallet className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Provideri activi</p>
              <p className="text-xl font-bold">{providers.filter((p) => p.enabled).length}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-yellow-100 flex items-center justify-center">
              <AlertCircle className="h-5 w-5 text-yellow-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">În așteptare</p>
              <p className="text-xl font-bold">
                {recentTransactions.filter((t) => t.status === 'pending').length}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="providers" className="space-y-4">
        <TabsList>
          <TabsTrigger value="providers">Provideri</TabsTrigger>
          <TabsTrigger value="config">Configurare</TabsTrigger>
          <TabsTrigger value="transactions">Tranzacții</TabsTrigger>
        </TabsList>

        <TabsContent value="providers">
          <Card>
            <CardHeader>
              <CardTitle>Provideri de plăți</CardTitle>
              <CardDescription>Gestionează provideriii de procesare plăți</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {providers.map((provider) => (
                <div
                  key={provider.id}
                  className="flex items-center justify-between p-4 border rounded-lg"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-lg bg-muted flex items-center justify-center text-2xl">
                      {provider.logo}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-medium">{provider.name}</h3>
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
                        {provider.testMode && <Badge variant="outline">Test Mode</Badge>}
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {provider.id === 'stripe' &&
                          'Procesare globală, carduri și Apple/Google Pay'}
                        {provider.id === 'netopia' && 'Plăți locale România, rate și carduri'}
                        {provider.id === 'paypal' && 'Plăți internaționale PayPal'}
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

        <TabsContent value="config">
          <div className="grid lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Building2 className="h-5 w-5" />
                  Configurare{' '}
                  {selectedProvider === 'stripe'
                    ? 'Stripe'
                    : selectedProvider === 'netopia'
                      ? 'Netopia'
                      : 'PayPal'}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>API Key (Public)</Label>
                  <div className="flex gap-2">
                    <Input
                      type={showSecrets.publicKey ? 'text' : 'password'}
                      placeholder="pk_live_..."
                      defaultValue="pk_live_51234567890abcdef"
                    />
                    <Button variant="outline" size="icon" onClick={() => toggleSecret('publicKey')}>
                      {showSecrets.publicKey ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </Button>
                    <Button variant="outline" size="icon">
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Secret Key</Label>
                  <div className="flex gap-2">
                    <Input
                      type={showSecrets.secretKey ? 'text' : 'password'}
                      placeholder="sk_live_..."
                      defaultValue="sk_live_51234567890abcdef"
                    />
                    <Button variant="outline" size="icon" onClick={() => toggleSecret('secretKey')}>
                      {showSecrets.secretKey ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Webhook Secret</Label>
                  <Input type="password" placeholder="whsec_..." />
                </div>
                <div className="flex items-center justify-between">
                  <Label>Mode Test</Label>
                  <Switch />
                </div>
                <div className="flex justify-end gap-2 pt-4">
                  <Button variant="outline">Testează conexiunea</Button>
                  <Button>Salvează</Button>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Setări generale</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Moneda implicită</Label>
                  <Select defaultValue="RON">
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="RON">RON - Leu românesc</SelectItem>
                      <SelectItem value="EUR">EUR - Euro</SelectItem>
                      <SelectItem value="USD">USD - Dolar american</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Webhook URL</Label>
                  <div className="flex gap-2">
                    <Input readOnly value="https://api.medicalcor.ro/webhooks/payments" />
                    <Button variant="outline" size="icon">
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <Label>Notificări email la plată</Label>
                  <Switch defaultChecked />
                </div>
                <div className="flex items-center justify-between">
                  <Label>Facturare automată</Label>
                  <Switch defaultChecked />
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="transactions">
          <Card>
            <CardHeader>
              <CardTitle>Tranzacții recente</CardTitle>
              <CardDescription>Ultimele plăți procesate</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {recentTransactions.map((tx) => (
                  <div
                    key={tx.id}
                    className="flex items-center justify-between p-4 border rounded-lg"
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
                        <CreditCard className="h-5 w-5" />
                      </div>
                      <div>
                        <p className="font-medium">
                          {tx.amount} {tx.currency}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {tx.method} •{' '}
                          {tx.date.toLocaleTimeString('ro-RO', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </p>
                      </div>
                    </div>
                    <Badge className={cn(statusConfig[tx.status].color)}>
                      {statusConfig[tx.status].label}
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
