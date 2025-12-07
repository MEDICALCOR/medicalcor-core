'use client';

import {
  Shield,
  FileText,
  Calendar,
  Database,
  ArrowRight,
  CheckCircle2,
  XCircle,
  Download,
  Printer,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';
import type { ComplianceReportView } from '../actions';

// =============================================================================
// TYPES
// =============================================================================

interface ComplianceReportProps {
  report: ComplianceReportView;
}

// =============================================================================
// CONSTANTS
// =============================================================================

const FRAMEWORK_COLORS: Record<string, { bg: string; text: string }> = {
  HIPAA: { bg: 'bg-green-100', text: 'text-green-700' },
  GDPR: { bg: 'bg-blue-100', text: 'text-blue-700' },
  PCI: { bg: 'bg-purple-100', text: 'text-purple-700' },
  SOC2: { bg: 'bg-orange-100', text: 'text-orange-700' },
  CCPA: { bg: 'bg-teal-100', text: 'text-teal-700' },
};

const LEGAL_BASIS_LABELS: Record<string, string> = {
  consent: 'Consent (Art. 6(1)(a))',
  contract: 'Contract Performance (Art. 6(1)(b))',
  legal_obligation: 'Legal Obligation (Art. 6(1)(c))',
  vital_interests: 'Vital Interests (Art. 6(1)(d))',
  public_task: 'Public Task (Art. 6(1)(e))',
  legitimate_interests: 'Legitimate Interests (Art. 6(1)(f))',
};

const SENSITIVITY_COLORS: Record<string, string> = {
  phi: 'text-red-600',
  pii: 'text-orange-600',
  confidential: 'text-yellow-600',
  restricted: 'text-purple-600',
  internal: 'text-blue-600',
  public: 'text-green-600',
};

// =============================================================================
// COMPONENT
// =============================================================================

export function ComplianceReport({ report }: ComplianceReportProps) {
  const frameworkColors = FRAMEWORK_COLORS[report.framework] ?? FRAMEWORK_COLORS.HIPAA;
  const startDate = new Date(report.period.start).toLocaleDateString();
  const endDate = new Date(report.period.end).toLocaleDateString();
  const generatedAt = new Date(report.generatedAt).toLocaleString();

  const handleExport = () => {
    // Create export content
    const content = JSON.stringify(report, null, 2);
    const blob = new Blob([content], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `compliance-report-${report.framework}-${report.subject.aggregateId}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-6 print:space-y-4">
      {/* Report Header */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className={cn('p-3 rounded-lg', frameworkColors.bg)}>
                <Shield className={cn('h-6 w-6', frameworkColors.text)} />
              </div>
              <div>
                <CardTitle className="text-xl">{report.framework} Compliance Report</CardTitle>
                <p className="text-sm text-muted-foreground mt-1">
                  Data Processing Activities Report
                </p>
              </div>
            </div>
            <Badge className={cn(frameworkColors.bg, frameworkColors.text, 'text-sm')}>
              {report.framework}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <div className="text-sm text-muted-foreground">Subject</div>
              <div className="font-medium">{report.subject.aggregateType}</div>
              <code className="text-xs text-muted-foreground">{report.subject.aggregateId}</code>
            </div>
            <div>
              <div className="text-sm text-muted-foreground">Report Period</div>
              <div className="font-medium flex items-center gap-1">
                <Calendar className="h-4 w-4" />
                {startDate} - {endDate}
              </div>
            </div>
            <div>
              <div className="text-sm text-muted-foreground">Generated</div>
              <div className="font-medium">{generatedAt}</div>
            </div>
            <div className="flex items-end justify-end gap-2 print:hidden">
              <Button variant="outline" size="sm" onClick={handleExport}>
                <Download className="h-4 w-4 mr-1" />
                Export
              </Button>
              <Button variant="outline" size="sm" onClick={handlePrint}>
                <Printer className="h-4 w-4 mr-1" />
                Print
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Processing Activities */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Processing Activities
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Activity</TableHead>
                <TableHead>Legal Basis</TableHead>
                <TableHead>Purpose</TableHead>
                <TableHead className="text-right">Count</TableHead>
                <TableHead>Period</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {report.processingActivities.map((activity, i) => (
                <TableRow key={i}>
                  <TableCell>
                    <div>
                      <span className="font-medium capitalize">
                        {activity.transformationType.replace(/_/g, ' ')}
                      </span>
                      {activity.description && (
                        <p className="text-xs text-muted-foreground">{activity.description}</p>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    {activity.legalBasis ? (
                      <Badge variant="outline" className="text-xs">
                        {LEGAL_BASIS_LABELS[activity.legalBasis] ?? activity.legalBasis}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {activity.purpose ?? <span className="text-muted-foreground">-</span>}
                  </TableCell>
                  <TableCell className="text-right font-medium">{activity.count}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {new Date(activity.firstOccurrence).toLocaleDateString()}
                    {' - '}
                    {new Date(activity.lastOccurrence).toLocaleDateString()}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Data Flow */}
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Data Sources */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Database className="h-4 w-4" />
              Data Sources
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {report.dataSources.map((source, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between p-3 rounded-lg bg-muted/30"
                >
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded bg-blue-100">
                      <Database className="h-4 w-4 text-blue-600" />
                    </div>
                    <div>
                      <div className="font-medium">{source.aggregateType}</div>
                      {source.sensitivity && (
                        <span
                          className={cn(
                            'text-xs uppercase',
                            SENSITIVITY_COLORS[source.sensitivity] ?? 'text-gray-600'
                          )}
                        >
                          {source.sensitivity}
                        </span>
                      )}
                    </div>
                  </div>
                  <Badge variant="secondary">{source.count} records</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Data Recipients */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <ArrowRight className="h-4 w-4" />
              Data Recipients
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {report.dataRecipients.map((recipient, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between p-3 rounded-lg bg-muted/30"
                >
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded bg-green-100">
                      <ArrowRight className="h-4 w-4 text-green-600" />
                    </div>
                    <div>
                      <div className="font-medium">{recipient.aggregateType}</div>
                      <span className="text-xs text-muted-foreground capitalize">
                        via {recipient.transformationType.replace(/_/g, ' ')}
                      </span>
                    </div>
                  </div>
                  <Badge variant="secondary">{recipient.count} records</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Consents */}
      {report.consents.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4" />
              Consent Records
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Consent ID</TableHead>
                  <TableHead>Purpose</TableHead>
                  <TableHead>Granted</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {report.consents.map((consent, i) => (
                  <TableRow key={i}>
                    <TableCell>
                      <code className="text-xs">{consent.consentId}</code>
                    </TableCell>
                    <TableCell>{consent.purpose}</TableCell>
                    <TableCell>{new Date(consent.grantedAt).toLocaleDateString()}</TableCell>
                    <TableCell>
                      {consent.withdrawnAt ? (
                        <Badge variant="destructive" className="gap-1">
                          <XCircle className="h-3 w-3" />
                          Withdrawn
                        </Badge>
                      ) : (
                        <Badge variant="success" className="gap-1">
                          <CheckCircle2 className="h-3 w-3" />
                          Active
                        </Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Summary */}
      <Card className="print:break-before-page">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Compliance Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="p-4 rounded-lg bg-muted/50 text-center">
              <div className="text-3xl font-bold">{report.processingActivities.length}</div>
              <div className="text-sm text-muted-foreground">Processing Activities</div>
            </div>
            <div className="p-4 rounded-lg bg-muted/50 text-center">
              <div className="text-3xl font-bold">{report.dataSources.length}</div>
              <div className="text-sm text-muted-foreground">Data Sources</div>
            </div>
            <div className="p-4 rounded-lg bg-muted/50 text-center">
              <div className="text-3xl font-bold">{report.dataRecipients.length}</div>
              <div className="text-sm text-muted-foreground">Data Recipients</div>
            </div>
            <div className="p-4 rounded-lg bg-muted/50 text-center">
              <div className="text-3xl font-bold">
                {report.consents.filter((c) => !c.withdrawnAt).length}
              </div>
              <div className="text-sm text-muted-foreground">Active Consents</div>
            </div>
          </div>

          <Separator className="my-4" />

          <div className="text-sm text-muted-foreground">
            <p>
              This report was generated on {generatedAt} for {report.framework} compliance purposes.
              It covers data processing activities for{' '}
              <strong>{report.subject.aggregateType}</strong> (ID: {report.subject.aggregateId})
              during the period from {startDate} to {endDate}.
            </p>
            <p className="mt-2">
              All processing activities listed have been tracked through the data lineage system and
              include relevant compliance metadata such as legal basis, purpose of processing, and
              consent records.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
