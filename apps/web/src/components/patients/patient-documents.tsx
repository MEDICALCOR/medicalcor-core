'use client';

import {
  FileText,
  Download,
  Trash2,
  MoreVertical,
  Upload,
  Eye,
  Image,
  File,
  FileSpreadsheet,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import type { PatientDocument } from '@/lib/patients';

interface PatientDocumentsProps {
  documents: PatientDocument[];
  onUpload?: () => void;
}

const typeLabels: Record<PatientDocument['type'], string> = {
  medical_record: 'Fișă medicală',
  lab_result: 'Rezultat laborator',
  imaging: 'Imagistică',
  prescription: 'Rețetă',
  consent: 'Consimțământ',
  other: 'Altele',
};

const typeColors: Record<PatientDocument['type'], string> = {
  medical_record: 'bg-blue-100 text-blue-700',
  lab_result: 'bg-green-100 text-green-700',
  imaging: 'bg-purple-100 text-purple-700',
  prescription: 'bg-orange-100 text-orange-700',
  consent: 'bg-yellow-100 text-yellow-700',
  other: 'bg-gray-100 text-gray-700',
};

function getFileIcon(mimeType: string): React.ElementType {
  if (mimeType.startsWith('image/')) return Image;
  if (mimeType.includes('spreadsheet') || mimeType.includes('excel')) return FileSpreadsheet;
  if (mimeType.includes('pdf')) return FileText;
  return File;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(date: Date): string {
  return date.toLocaleDateString('ro-RO', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function PatientDocuments({ documents, onUpload }: PatientDocumentsProps) {
  // Group documents by type
  const groupedDocs = documents.reduce<Record<string, PatientDocument[]>>((acc, doc) => {
    const type = doc.type;
    if (Object.hasOwn(acc, type)) {
      acc[type].push(doc);
    } else {
      acc[type] = [doc];
    }
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">Documente ({documents.length})</h3>
        <Button size="sm" onClick={onUpload}>
          <Upload className="h-4 w-4 mr-2" />
          Încarcă document
        </Button>
      </div>

      {/* Documents by type */}
      {Object.entries(groupedDocs).map(([type, docs]) => (
        <div key={type}>
          <h4 className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2">
            <Badge
              variant="secondary"
              className={cn('text-xs', typeColors[type as PatientDocument['type']])}
            >
              {typeLabels[type as PatientDocument['type']]}
            </Badge>
            <span>({docs.length})</span>
          </h4>
          <div className="space-y-2">
            {docs.map((doc) => {
              const FileIcon = getFileIcon(doc.mimeType);
              return (
                <div
                  key={doc.id}
                  className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center">
                      <FileIcon className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="font-medium text-sm">{doc.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatFileSize(doc.size)} • {formatDate(doc.uploadedAt)}
                        {doc.uploadedBy && ` • ${doc.uploadedBy}`}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="icon" className="h-8 w-8">
                      <Eye className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8">
                      <Download className="h-4 w-4" />
                    </Button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem>
                          <Eye className="h-4 w-4 mr-2" />
                          Vizualizează
                        </DropdownMenuItem>
                        <DropdownMenuItem>
                          <Download className="h-4 w-4 mr-2" />
                          Descarcă
                        </DropdownMenuItem>
                        <DropdownMenuItem className="text-red-600">
                          <Trash2 className="h-4 w-4 mr-2" />
                          Șterge
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {documents.length === 0 && (
        <div className="text-center py-8 text-muted-foreground border-2 border-dashed rounded-lg">
          <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p>Nu există documente</p>
          <Button variant="outline" size="sm" className="mt-2" onClick={onUpload}>
            <Upload className="h-4 w-4 mr-2" />
            Încarcă primul document
          </Button>
        </div>
      )}
    </div>
  );
}
