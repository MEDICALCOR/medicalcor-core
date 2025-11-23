'use client';

import { useState } from 'react';
import {
  StickyNote,
  Pin,
  MoreVertical,
  Plus,
  Trash2,
  Edit,
  AlertTriangle,
  FileText,
  Clock,
  CreditCard,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import type { PatientNote } from '@/lib/patients';

interface PatientNotesProps {
  notes: PatientNote[];
  onAddNote?: (content: string) => void;
}

const categoryLabels: Record<NonNullable<PatientNote['category']>, string> = {
  general: 'General',
  medical: 'Medical',
  billing: 'Facturare',
  'follow-up': 'Follow-up',
};

const categoryColors: Record<NonNullable<PatientNote['category']>, string> = {
  general: 'bg-gray-100 text-gray-700',
  medical: 'bg-red-100 text-red-700',
  billing: 'bg-green-100 text-green-700',
  'follow-up': 'bg-blue-100 text-blue-700',
};

const categoryIcons: Record<NonNullable<PatientNote['category']>, React.ElementType> = {
  general: StickyNote,
  medical: AlertTriangle,
  billing: CreditCard,
  'follow-up': Clock,
};

function formatDate(date: Date): string {
  return date.toLocaleDateString('ro-RO', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function PatientNotes({ notes, onAddNote }: PatientNotesProps) {
  const [newNote, setNewNote] = useState('');
  const [isAdding, setIsAdding] = useState(false);

  const pinnedNotes = notes.filter((n) => n.isPinned);
  const regularNotes = notes.filter((n) => !n.isPinned);

  const handleSubmit = () => {
    if (newNote.trim()) {
      onAddNote?.(newNote.trim());
      setNewNote('');
      setIsAdding(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">Note ({notes.length})</h3>
        <Button size="sm" onClick={() => setIsAdding(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Adaugă notă
        </Button>
      </div>

      {/* Add Note Form */}
      {isAdding && (
        <div className="border rounded-lg p-4 space-y-3">
          <Textarea
            value={newNote}
            onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setNewNote(e.target.value)}
            placeholder="Scrie o notă..."
            rows={3}
          />
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setIsAdding(false);
                setNewNote('');
              }}
            >
              Anulează
            </Button>
            <Button size="sm" onClick={handleSubmit} disabled={!newNote.trim()}>
              Salvează
            </Button>
          </div>
        </div>
      )}

      {/* Pinned Notes */}
      {pinnedNotes.length > 0 && (
        <div>
          <h4 className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2">
            <Pin className="h-4 w-4" />
            Note fixate ({pinnedNotes.length})
          </h4>
          <div className="space-y-3">
            {pinnedNotes.map((note) => {
              const CategoryIcon = note.category ? categoryIcons[note.category] : StickyNote;
              return (
                <div
                  key={note.id}
                  className="border rounded-lg p-4 bg-yellow-50/50 border-yellow-200"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-3">
                      <Pin className="h-4 w-4 text-yellow-600 mt-0.5" />
                      <div>
                        <p className="text-sm whitespace-pre-wrap">{note.content}</p>
                        <div className="flex items-center gap-2 mt-2">
                          {note.category && (
                            <Badge
                              variant="secondary"
                              className={cn('text-[10px]', categoryColors[note.category])}
                            >
                              <CategoryIcon className="h-3 w-3 mr-1" />
                              {categoryLabels[note.category]}
                            </Badge>
                          )}
                          <span className="text-xs text-muted-foreground">
                            {note.createdBy} • {formatDate(note.createdAt)}
                          </span>
                        </div>
                      </div>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem>
                          <Edit className="h-4 w-4 mr-2" />
                          Editează
                        </DropdownMenuItem>
                        <DropdownMenuItem>
                          <Pin className="h-4 w-4 mr-2" />
                          Anulează fixare
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
      )}

      {/* Regular Notes */}
      {regularNotes.length > 0 && (
        <div>
          <h4 className="text-sm font-medium text-muted-foreground mb-3">
            Toate notele ({regularNotes.length})
          </h4>
          <div className="space-y-3">
            {regularNotes.map((note) => {
              const CategoryIcon = note.category ? categoryIcons[note.category] : StickyNote;
              return (
                <div key={note.id} className="border rounded-lg p-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-sm whitespace-pre-wrap">{note.content}</p>
                      <div className="flex items-center gap-2 mt-2">
                        {note.category && (
                          <Badge
                            variant="secondary"
                            className={cn('text-[10px]', categoryColors[note.category])}
                          >
                            <CategoryIcon className="h-3 w-3 mr-1" />
                            {categoryLabels[note.category]}
                          </Badge>
                        )}
                        <span className="text-xs text-muted-foreground">
                          {note.createdBy} • {formatDate(note.createdAt)}
                        </span>
                      </div>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem>
                          <Edit className="h-4 w-4 mr-2" />
                          Editează
                        </DropdownMenuItem>
                        <DropdownMenuItem>
                          <Pin className="h-4 w-4 mr-2" />
                          Fixează
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
      )}

      {notes.length === 0 && !isAdding && (
        <div className="text-center py-8 text-muted-foreground">
          <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p>Nu există note</p>
          <Button variant="outline" size="sm" className="mt-2" onClick={() => setIsAdding(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Adaugă prima notă
          </Button>
        </div>
      )}
    </div>
  );
}
