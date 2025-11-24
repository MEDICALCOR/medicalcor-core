/**
 * Masks phone number for display (GDPR compliance)
 * Example: +40721234567 -> +40721***567
 */
export function maskPhone(phone: string): string {
  if (phone.length < 8) return phone;
  const visible = 6;
  const masked = phone.length - visible - 3;
  return `${phone.slice(0, visible)}${'*'.repeat(Math.max(masked, 3))}${phone.slice(-3)}`;
}

/**
 * Formats relative time for display
 */
export function formatRelativeTime(date: string): string {
  const now = new Date();
  const then = new Date(date);
  const diffMs = now.getTime() - then.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'acum';
  if (diffMins < 60) return `acum ${diffMins} min`;
  if (diffHours < 24) return `acum ${diffHours} ore`;
  if (diffDays === 1) return 'ieri';
  if (diffDays < 7) return `acum ${diffDays} zile`;
  return then.toLocaleDateString('ro-RO');
}
