'use client';

import { useState } from 'react';
import { Users, MessageSquare, Calendar, Search } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { CRMPatient } from '@medicalcor/types';

interface PatientsTableProps {
  patients: CRMPatient[];
}

const riskColors: Record<string, string> = {
  SCAZUT: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100',
  MEDIU: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-100',
  RIDICAT: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-100',
  FOARTE_RIDICAT: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-100',
};

const segmentColors: Record<string, string> = {
  Platinum: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-100',
  Gold: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-100',
  Silver: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-100',
  Bronze: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-100',
};

const npsColors: Record<string, string> = {
  PROMOTOR: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-100',
  PASIV: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-100',
  DETRACTOR: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-100',
};

export function PatientsTable({ patients }: PatientsTableProps) {
  const [searchTerm, setSearchTerm] = useState('');

  const filteredPatients = patients.filter(
    (p) =>
      p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.phone.includes(searchTerm) ||
      p.email?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <Card>
      <CardHeader className="bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-t-lg">
        <CardTitle className="text-xl">Bază Pacienți cu Scoruri AI</CardTitle>
        <CardDescription className="text-blue-100">
          {patients.length} pacienți activi | Predicție abandon în timp real
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-4">
        <div className="mb-4 flex items-center gap-2">
          <Search className="h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Caută pacient după nume, telefon sau email..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="max-w-sm"
          />
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b-2">
                <th className="p-3 text-left text-sm font-semibold">Pacient</th>
                <th className="p-3 text-center text-sm font-semibold">Scor</th>
                <th className="p-3 text-center text-sm font-semibold">Risc</th>
                <th className="p-3 text-right text-sm font-semibold">LTV</th>
                <th className="p-3 text-center text-sm font-semibold">NPS</th>
                <th className="p-3 text-center text-sm font-semibold">Segment</th>
                <th className="p-3 text-left text-sm font-semibold">Acțiuni</th>
              </tr>
            </thead>
            <tbody>
              {filteredPatients.map((patient) => (
                <tr key={patient.id} className="border-b transition-colors hover:bg-muted/50">
                  <td className="p-3">
                    <div>
                      <p className="font-bold">{patient.name}</p>
                      <p className="text-sm text-muted-foreground">{patient.phone}</p>
                      {patient.lastAppointmentDate && (
                        <p className="text-xs text-muted-foreground">
                          Ultima vizită:{' '}
                          {new Date(patient.lastAppointmentDate).toLocaleDateString('ro-RO')}
                        </p>
                      )}
                    </div>
                  </td>
                  <td className="p-3 text-center">
                    <div
                      className={`mx-auto flex h-14 w-14 items-center justify-center rounded-full text-lg font-bold ${
                        patient.retentionScore >= 80
                          ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-100'
                          : patient.retentionScore >= 50
                            ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-100'
                            : 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-100'
                      }`}
                    >
                      {patient.retentionScore}
                    </div>
                  </td>
                  <td className="p-3 text-center">
                    <Badge className={riskColors[patient.churnRisk]}>
                      {patient.churnRisk.replace('_', ' ')}
                    </Badge>
                  </td>
                  <td className="p-3 text-right">
                    <p className="font-bold">{patient.lifetimeValue.toLocaleString('ro-RO')} RON</p>
                  </td>
                  <td className="p-3 text-center">
                    {patient.npsScore !== null && patient.npsCategory && (
                      <div
                        className={`mx-auto flex h-10 w-10 items-center justify-center rounded-full font-bold ${npsColors[patient.npsCategory]}`}
                      >
                        {patient.npsScore}
                      </div>
                    )}
                  </td>
                  <td className="p-3 text-center">
                    <Badge className={segmentColors[patient.loyaltySegment]}>
                      {patient.loyaltySegment}
                    </Badge>
                  </td>
                  <td className="p-3">
                    <div className="flex gap-1">
                      <Button size="icon" variant="ghost" title="Detalii">
                        <Users className="h-4 w-4" />
                      </Button>
                      <Button size="icon" variant="ghost" title="WhatsApp">
                        <MessageSquare className="h-4 w-4" />
                      </Button>
                      <Button size="icon" variant="ghost" title="Programare">
                        <Calendar className="h-4 w-4" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
