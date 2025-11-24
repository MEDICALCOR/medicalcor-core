import crypto from 'crypto';

/**
 * Date Helper Utilities for Trigger Jobs
 *
 * Provides consistent date calculations and formatting
 * for cron jobs and scheduled tasks.
 */

/**
 * Generates a unique correlation ID for job tracking
 */
export function generateCorrelationId(): string {
  return `cron_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;
}

/**
 * Returns timestamp string for N days ago
 * @param days - Number of days in the past
 */
export function daysAgo(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.getTime().toString();
}

/**
 * Returns timestamp string for N months ago
 * @param months - Number of months in the past
 */
export function monthsAgo(months: number): string {
  const date = new Date();
  date.setMonth(date.getMonth() - months);
  return date.getTime().toString();
}

/**
 * Legacy helper: Returns timestamp for 6 months ago
 * @deprecated Use monthsAgo(6) instead
 */
export function sixMonthsAgo(): string {
  return monthsAgo(6);
}

/**
 * Legacy helper: Returns timestamp for 7 days ago
 * @deprecated Use daysAgo(7) instead
 */
export function sevenDaysAgo(): string {
  return daysAgo(7);
}

/**
 * Legacy helper: Returns timestamp for 90 days ago
 * @deprecated Use daysAgo(90) instead
 */
export function ninetyDaysAgo(): string {
  return daysAgo(90);
}

/**
 * Legacy helper: Returns timestamp for ~2 years ago (23 months)
 * @deprecated Use monthsAgo(23) instead
 */
export function almostTwoYearsAgo(): string {
  return monthsAgo(23);
}

/**
 * Checks if a date string falls within a specified hour window
 * @param dateStr - ISO date string to check
 * @param minHours - Minimum hours from now (inclusive)
 * @param maxHours - Maximum hours from now (inclusive)
 */
export function isWithinHours(dateStr: string, minHours: number, maxHours: number): boolean {
  const date = new Date(dateStr);
  const now = new Date();
  const diffHours = (date.getTime() - now.getTime()) / (1000 * 60 * 60);
  return diffHours > minHours && diffHours <= maxHours;
}

/**
 * Checks if appointment is approximately 24 hours away (23-25 hour window)
 */
export function isIn24Hours(dateStr: string): boolean {
  return isWithinHours(dateStr, 23, 25);
}

/**
 * Checks if appointment is approximately 2 hours away (1.5-2.5 hour window)
 */
export function isIn2Hours(dateStr: string): boolean {
  return isWithinHours(dateStr, 1.5, 2.5);
}

/**
 * Formats a date string for localized display
 * @param dateStr - ISO date string
 * @param language - Target language (ro, en, de)
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
 * Formats a date string to time only (HH:MM format)
 * @param dateStr - ISO date string
 */
export function formatTime(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleTimeString('ro-RO', { hour: '2-digit', minute: '2-digit' });
}
