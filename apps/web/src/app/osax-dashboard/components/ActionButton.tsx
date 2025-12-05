/**
 * Action Button Component
 * Extracted to reduce OsaxCaseTable complexity
 */

interface ActionButtonProps {
  label: string;
  href: string;
  variant?: 'primary' | 'secondary' | 'warning' | 'danger';
}

export function ActionButton({ label, href, variant = 'primary' }: ActionButtonProps) {
  const variantClasses = {
    primary: 'bg-blue-600 text-white hover:bg-blue-700',
    secondary: 'bg-gray-100 text-gray-700 hover:bg-gray-200',
    warning: 'bg-yellow-500 text-white hover:bg-yellow-600',
    danger: 'bg-red-600 text-white hover:bg-red-700',
  };

  return (
    <a
      href={href}
      className={`rounded px-3 py-1 text-xs font-medium transition-colors ${variantClasses[variant]}`}
    >
      {label}
    </a>
  );
}


