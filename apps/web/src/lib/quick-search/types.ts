'use client';

export type CommandType = 'navigation' | 'action' | 'patient' | 'conversation';

export interface Command {
  id: string;
  type: CommandType;
  label: string;
  description?: string;
  icon?: string;
  shortcut?: string;
  href?: string;
  action?: () => void;
  keywords?: string[];
}

export interface CommandGroup {
  id: string;
  label: string;
  commands: Command[];
}

export interface SearchResult {
  id: string;
  type: CommandType;
  label: string;
  description?: string;
  href?: string;
  action?: () => void;
  icon?: string;
}
