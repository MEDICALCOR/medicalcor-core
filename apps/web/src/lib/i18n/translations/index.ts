/**
 * Combined translations module
 * Split by locale to reduce file size (max 1000 lines per file)
 */
import { ro } from './ro';
import { en } from './en';

export const translations = {
  ro,
  en,
} as const;

export type Language = keyof typeof translations;
export type TranslationKey = keyof typeof translations.ro;
