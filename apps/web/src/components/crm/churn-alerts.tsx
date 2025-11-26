'use client';

import { AlertTriangle, Phone, MessageSquare, Award } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { ChurnRiskAlert } from '@medicalcor/types';

interface ChurnAlertsProps {
  alerts: ChurnRiskAlert[];
}

export function ChurnAlerts({ alerts }: ChurnAlertsProps) {
  if (alerts.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          <AlertTriangle className="mx-auto mb-2 h-12 w-12 opacity-50" />
          <p>Nicio alertă de abandon activă</p>
          <p className="text-xs text-emerald-600">Toți pacienții sunt în siguranță</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-destructive/50">
      <CardHeader className="bg-destructive/10">
        <CardTitle className="flex items-center gap-2 text-destructive">
          <AlertTriangle className="h-5 w-5" />
          Alerte Critice - Acțiune URGENTĂ Necesară ({alerts.length})
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 pt-4">
        {alerts.map((alert) => (
          <div key={alert.patientId} className="rounded-lg border bg-card p-4 shadow-sm">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="mb-2 flex items-center gap-3">
                  <span className="font-bold">{alert.patientName}</span>
                  <Badge variant={alert.churnRisk === 'FOARTE_RIDICAT' ? 'destructive' : 'outline'}>
                    {alert.churnRisk.replace('_', ' ')}
                  </Badge>
                  <span className="text-sm text-muted-foreground">
                    Scor: {alert.retentionScore}/100
                  </span>
                </div>
                {alert.npsFeedback && (
                  <p className="mb-2 text-sm text-muted-foreground">
                    <span className="font-semibold">NPS {alert.npsScore}/10:</span> &quot;
                    {alert.npsFeedback}&quot;
                  </p>
                )}
                <p className="text-sm text-muted-foreground">
                  LTV: {alert.lifetimeValue.toLocaleString('ro-RO')} RON | Inactiv:{' '}
                  {alert.daysInactive} zile | Anulări: {alert.canceledAppointments}
                </p>
                <p className="mt-2 text-sm font-medium text-blue-600">💡 {alert.suggestedAction}</p>
              </div>
            </div>
            <div className="mt-3 flex gap-2">
              <Button size="sm" className="gap-2">
                <Phone className="h-4 w-4" />
                Apel Personal
              </Button>
              <Button size="sm" variant="secondary" className="gap-2">
                <MessageSquare className="h-4 w-4" />
                WhatsApp
              </Button>
              <Button size="sm" variant="outline" className="gap-2">
                <Award className="h-4 w-4" />
                Ofertă Recuperare
              </Button>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
