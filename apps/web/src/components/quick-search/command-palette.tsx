'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  LayoutDashboard,
  Activity,
  Users,
  Calendar,
  MessageSquare,
  BarChart3,
  Settings,
  UserPlus,
  CalendarPlus,
  Send,
  Download,
  Search,
  Command,
  ArrowRight,
  User,
} from 'lucide-react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { allCommandGroups, mockPatients, type SearchResult } from '@/lib/quick-search';
import { VisuallyHidden } from '@/components/ui/visually-hidden';

const iconMap: Record<string, React.ElementType> = {
  LayoutDashboard,
  Activity,
  Users,
  Calendar,
  MessageSquare,
  BarChart3,
  Settings,
  UserPlus,
  CalendarPlus,
  Send,
  Download,
  User,
};

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CommandPalette({ open, onOpenChange }: CommandPaletteProps) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);

  // Filter and search results
  const results = useMemo(() => {
    const searchResults: SearchResult[] = [];
    const lowerQuery = query.toLowerCase().trim();

    if (!lowerQuery) {
      // Show all navigation commands when no query
      allCommandGroups.forEach((group) => {
        group.commands.forEach((cmd) => {
          searchResults.push({
            id: cmd.id,
            type: cmd.type,
            label: cmd.label,
            description: cmd.description,
            href: cmd.href,
            action: cmd.action,
            icon: cmd.icon,
          });
        });
      });
    } else {
      // Search commands
      allCommandGroups.forEach((group) => {
        group.commands.forEach((cmd) => {
          const matches =
            cmd.label.toLowerCase().includes(lowerQuery) ||
            (cmd.description?.toLowerCase().includes(lowerQuery) ?? false) ||
            (cmd.keywords?.some((k) => k.toLowerCase().includes(lowerQuery)) ?? false);

          if (matches) {
            searchResults.push({
              id: cmd.id,
              type: cmd.type,
              label: cmd.label,
              description: cmd.description,
              href: cmd.href,
              action: cmd.action,
              icon: cmd.icon,
            });
          }
        });
      });

      // Search patients
      mockPatients.forEach((patient) => {
        const matches =
          patient.name.toLowerCase().includes(lowerQuery) || patient.phone.includes(lowerQuery);

        if (matches) {
          searchResults.push({
            id: `patient-${patient.id}`,
            type: 'patient',
            label: patient.name,
            description: patient.phone,
            href: `/patients/${patient.id}`,
            icon: 'User',
          });
        }
      });
    }

    return searchResults;
  }, [query]);

  // Reset selection when results change
  useEffect(() => {
    setSelectedIndex(0);
  }, [results]);

  // Reset query when dialog closes
  useEffect(() => {
    if (!open) {
      setQuery('');
      setSelectedIndex(0);
    }
  }, [open]);

  const handleSelect = useCallback(
    (result: SearchResult) => {
      onOpenChange(false);

      if (result.href) {
        router.push(result.href);
      } else if (result.action) {
        result.action();
      }
    },
    [router, onOpenChange]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setSelectedIndex((prev) => (prev + 1) % results.length);
          break;
        case 'ArrowUp':
          e.preventDefault();
          setSelectedIndex((prev) => (prev - 1 + results.length) % results.length);
          break;
        case 'Enter':
          e.preventDefault();
          if (results[selectedIndex]) {
            handleSelect(results[selectedIndex]);
          }
          break;
        case 'Escape':
          e.preventDefault();
          onOpenChange(false);
          break;
        default:
          // No action for other keys
          break;
      }
    },
    [results, selectedIndex, handleSelect, onOpenChange]
  );

  // Group results by type for display
  const groupedResults = useMemo(() => {
    const groups: Record<string, SearchResult[]> = {};

    results.forEach((result) => {
      const groupKey = result.type;
      if (Object.hasOwn(groups, groupKey)) {
        groups[groupKey].push(result);
      } else {
        groups[groupKey] = [result];
      }
    });

    return groups;
  }, [results]);

  const typeLabels: Record<string, string> = {
    navigation: 'Navigare',
    action: 'Acțiuni',
    patient: 'Pacienți',
    conversation: 'Conversații',
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="p-0 overflow-hidden max-w-lg">
        <VisuallyHidden>
          <DialogTitle>Căutare Rapidă</DialogTitle>
        </VisuallyHidden>
        {/* Search Input */}
        <div className="flex items-center border-b px-3">
          <Search className="h-4 w-4 text-muted-foreground shrink-0" />
          <Input
            value={query}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Caută comenzi, pagini, pacienți..."
            className="border-0 focus-visible:ring-0 focus-visible:ring-offset-0"
            autoFocus
          />
          <Badge variant="secondary" className="shrink-0 text-[10px] gap-1">
            <Command className="h-3 w-3" />K
          </Badge>
        </div>

        {/* Results */}
        <div className="max-h-[60vh] overflow-y-auto py-2">
          {results.length === 0 ? (
            <div className="px-4 py-8 text-center text-muted-foreground">
              <Search className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">Nu am găsit rezultate pentru "{query}"</p>
            </div>
          ) : (
            Object.entries(groupedResults).map(([type, items]) => (
              <div key={type}>
                <div className="px-3 py-1.5">
                  <span className="text-xs font-semibold text-muted-foreground uppercase">
                    {typeLabels[type] ?? type}
                  </span>
                </div>
                {items.map((result) => {
                  const Icon = result.icon ? iconMap[result.icon] : ArrowRight;
                  const globalIndex = results.indexOf(result);
                  const isSelected = globalIndex === selectedIndex;

                  return (
                    <button
                      key={result.id}
                      onClick={() => handleSelect(result)}
                      onMouseEnter={() => setSelectedIndex(globalIndex)}
                      className={cn(
                        'w-full flex items-center gap-3 px-3 py-2 text-left transition-colors',
                        isSelected ? 'bg-accent' : 'hover:bg-muted/50'
                      )}
                    >
                      <div
                        className={cn(
                          'w-8 h-8 rounded-lg flex items-center justify-center shrink-0',
                          result.type === 'navigation' && 'bg-blue-100 text-blue-600',
                          result.type === 'action' && 'bg-green-100 text-green-600',
                          result.type === 'patient' && 'bg-purple-100 text-purple-600'
                        )}
                      >
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{result.label}</p>
                        {result.description && (
                          <p className="text-xs text-muted-foreground truncate">
                            {result.description}
                          </p>
                        )}
                      </div>
                      {isSelected && <div className="text-xs text-muted-foreground">Enter ↵</div>}
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="border-t px-3 py-2 flex items-center justify-between text-xs text-muted-foreground">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 bg-muted rounded">↑</kbd>
              <kbd className="px-1.5 py-0.5 bg-muted rounded">↓</kbd>
              navigare
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 bg-muted rounded">Enter</kbd>
              selectare
            </span>
          </div>
          <span className="flex items-center gap-1">
            <kbd className="px-1.5 py-0.5 bg-muted rounded">Esc</kbd>
            închide
          </span>
        </div>
      </DialogContent>
    </Dialog>
  );
}
