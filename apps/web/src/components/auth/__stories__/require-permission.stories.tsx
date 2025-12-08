import type { Meta, StoryObj } from '@storybook/react';
import { ShieldAlert, Lock, Check, X } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

type UserRole = 'staff' | 'receptionist' | 'doctor' | 'admin';

interface PermissionDemoProps {
  hasPermission?: boolean;
  role?: UserRole;
}

function AccessDeniedDemo({
  message = 'Nu aveți permisiunea de a accesa această pagină',
  showBackButton = true,
}: {
  message?: string;
  showBackButton?: boolean;
}) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[400px] p-8 text-center border rounded-lg">
      <div className="rounded-full bg-destructive/10 p-6 mb-6">
        <ShieldAlert className="h-12 w-12 text-destructive" />
      </div>
      <h2 className="text-2xl font-semibold mb-2">Acces Interzis</h2>
      <p className="text-muted-foreground max-w-md mb-6">{message}</p>
      {showBackButton && <Button variant="default">Înapoi</Button>}
    </div>
  );
}

function LockedFeatureDemo({
  isLocked = true,
  children,
}: {
  isLocked?: boolean;
  children: React.ReactNode;
}) {
  if (!isLocked) {
    return <>{children}</>;
  }

  return (
    <div
      className="relative opacity-50 cursor-not-allowed"
      title="Această funcție necesită permisiuni suplimentare"
    >
      <div className="pointer-events-none">{children}</div>
      <div className="absolute inset-0 flex items-center justify-center bg-background/50">
        <Lock className="h-4 w-4 text-muted-foreground" />
      </div>
    </div>
  );
}

function PermissionGateDemoWrapper({ hasPermission = true, role = 'admin' }: PermissionDemoProps) {
  const roleHierarchy: Record<UserRole, number> = {
    staff: 1,
    receptionist: 2,
    doctor: 3,
    admin: 4,
  };

  return (
    <Card className="max-w-md">
      <CardHeader>
        <CardTitle>Permission Check Demo</CardTitle>
        <CardDescription>
          Current role: <Badge variant="outline">{role}</Badge>
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-2">
          {hasPermission ? (
            <>
              <Check className="h-5 w-5 text-green-500" />
              <span className="text-sm">Permission granted</span>
            </>
          ) : (
            <>
              <X className="h-5 w-5 text-red-500" />
              <span className="text-sm">Permission denied</span>
            </>
          )}
        </div>

        {hasPermission ? (
          <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-lg">
            <p className="text-sm text-green-700 dark:text-green-300">
              Protected content is visible
            </p>
          </div>
        ) : (
          <div className="p-4 bg-red-50 dark:bg-red-900/20 rounded-lg">
            <p className="text-sm text-red-700 dark:text-red-300">
              Access denied - insufficient permissions
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

const meta = {
  title: 'Auth/RequirePermission',
  component: PermissionGateDemoWrapper,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
} satisfies Meta<typeof PermissionGateDemoWrapper>;

export default meta;
type Story = StoryObj<typeof meta>;

export const PermissionGranted: Story = {
  args: {
    hasPermission: true,
    role: 'admin',
  },
};

export const PermissionDenied: Story = {
  args: {
    hasPermission: false,
    role: 'staff',
  },
};

export const AccessDeniedPage: Story = {
  render: () => <AccessDeniedDemo />,
};

export const AccessDeniedCustomMessage: Story = {
  render: () => (
    <AccessDeniedDemo
      message="Doar doctorii pot accesa dosarele medicale ale pacienților"
      showBackButton={true}
    />
  ),
};

export const AccessDeniedNoButton: Story = {
  render: () => (
    <AccessDeniedDemo message="Contactează administratorul pentru acces" showBackButton={false} />
  ),
};

export const LockedFeature: Story = {
  render: () => (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold">Locked Feature Demo</h3>
      <div className="flex gap-4">
        <div>
          <p className="text-sm text-muted-foreground mb-2">Locked:</p>
          <LockedFeatureDemo isLocked>
            <Button>Create Invoice</Button>
          </LockedFeatureDemo>
        </div>
        <div>
          <p className="text-sm text-muted-foreground mb-2">Unlocked:</p>
          <LockedFeatureDemo isLocked={false}>
            <Button>Create Invoice</Button>
          </LockedFeatureDemo>
        </div>
      </div>
    </div>
  ),
};

export const RoleHierarchy: Story = {
  render: () => (
    <Card className="max-w-md">
      <CardHeader>
        <CardTitle>Role Hierarchy</CardTitle>
        <CardDescription>Higher roles have more permissions</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {(['staff', 'receptionist', 'doctor', 'admin'] as UserRole[]).map((role, index) => (
            <div key={role} className="flex items-center justify-between p-3 border rounded-lg">
              <div className="flex items-center gap-2">
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium"
                  style={{
                    backgroundColor: `hsl(${120 + index * 30}, 70%, 90%)`,
                    color: `hsl(${120 + index * 30}, 70%, 30%)`,
                  }}
                >
                  {index + 1}
                </div>
                <span className="capitalize font-medium">{role}</span>
              </div>
              <Badge variant="outline">Level {index + 1}</Badge>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  ),
};

export const PermissionExamples: Story = {
  render: () => (
    <Card className="max-w-lg">
      <CardHeader>
        <CardTitle>Permission Examples</CardTitle>
        <CardDescription>Common permission patterns in the application</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {[
            { permission: 'patients:read', description: 'View patient list' },
            { permission: 'patients:edit', description: 'Edit patient records' },
            { permission: 'patients:medical_records', description: 'Access medical records' },
            { permission: 'billing:create', description: 'Create invoices' },
            { permission: 'settings:manage', description: 'Manage system settings' },
          ].map((perm) => (
            <div
              key={perm.permission}
              className="flex items-center justify-between p-2 border rounded"
            >
              <div>
                <code className="text-xs bg-muted px-1 py-0.5 rounded">{perm.permission}</code>
                <p className="text-sm text-muted-foreground mt-0.5">{perm.description}</p>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  ),
};
