import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(date: Date | string, locale = 'ro-RO'): string {
  return new Date(date).toLocaleDateString(locale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function formatDateTime(date: Date | string, locale = 'ro-RO'): string {
  return new Date(date).toLocaleString(locale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatRelativeTime(date: Date | string): string {
  const now = new Date();
  const then = new Date(date);
  const diffInSeconds = Math.floor((now.getTime() - then.getTime()) / 1000);

  if (diffInSeconds < 60) return 'acum';
  if (diffInSeconds < 3600) return `acum ${Math.floor(diffInSeconds / 60)} min`;
  if (diffInSeconds < 86400) return `acum ${Math.floor(diffInSeconds / 3600)} ore`;
  if (diffInSeconds < 604800) return `acum ${Math.floor(diffInSeconds / 86400)} zile`;

  return formatDate(date);
}

export function getScoreColor(score: number): string {
  if (score >= 4) return 'status-hot';
  if (score >= 3) return 'status-warm';
  return 'status-cold';
}

export function getClassificationColor(classification: string): string {
  switch (classification) {
    case 'HOT':
      return 'status-hot';
    case 'WARM':
      return 'status-warm';
    case 'COLD':
      return 'status-cold';
    default:
      return 'bg-gray-100 text-gray-800';
  }
}
