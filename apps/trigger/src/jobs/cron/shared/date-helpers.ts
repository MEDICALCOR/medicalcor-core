/**
 * Date helper functions for cron jobs
 */

import crypto from 'crypto';

/**
 * Generate a unique correlation ID for job tracking
 */
export function generateCorrelationId(): string {
  return `cron_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;
}

/**
 * Get timestamp for 6 months ago
 */
export function sixMonthsAgo(): string {
  const date = new Date();
  date.setMonth(date.getMonth() - 6);
  return date.getTime().toString();
}

/**
 * Get timestamp for 7 days ago
 */
export function sevenDaysAgo(): string {
  const date = new Date();
  date.setDate(date.getDate() - 7);
  return date.getTime().toString();
}

/**
 * Get timestamp for 90 days ago
 */
export function ninetyDaysAgo(): string {
  const date = new Date();
  date.setDate(date.getDate() - 90);
  return date.getTime().toString();
}

/**
 * Get timestamp for almost 2 years ago (23 months)
 */
export function almostTwoYearsAgo(): string {
  const date = new Date();
  date.setMonth(date.getMonth() - 23); // 23 months = almost 2 years
  return date.getTime().toString();
}

/**
 * Check if a date is within 24 hours from now
 */
export function isIn24Hours(dateStr: string): boolean {
  const date = new Date(dateStr);
  const now = new Date();
  const diffHours = (date.getTime() - now.getTime()) / (1000 * 60 * 60);
  return diffHours > 23 && diffHours <= 25; // 23-25 hours window
}

/**
 * Check if a date is within 2 hours from now
 */
export function isIn2Hours(dateStr: string): boolean {
  const date = new Date(dateStr);
  const now = new Date();
  const diffHours = (date.getTime() - now.getTime()) / (1000 * 60 * 60);
  return diffHours > 1.5 && diffHours <= 2.5; // 1.5-2.5 hours window
}

/**
 * Format date for display in various languages
 */
export function formatDate(dateStr: string, language: 'ro' | 'en' | 'de' = 'ro'): string {
  const date = new Date(dateStr);
  const formatters: Record<string, Intl.DateTimeFormat> = {
    ro: new Intl.DateTimeFormat('ro-RO', { weekday: 'long', day: 'numeric', month: 'long' }),
    en: new Intl.DateTimeFormat('en-US', { weekday: 'long', day: 'numeric', month: 'long' }),
    de: new Intl.DateTimeFormat('de-DE', { weekday: 'long', day: 'numeric', month: 'long' }),
  };
  return formatters[language]?.format(date) ?? date.toLocaleDateString();
}

/**
 * Format time for display (Romanian locale)
 */
export function formatTime(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleTimeString('ro-RO', { hour: '2-digit', minute: '2-digit' });
}
