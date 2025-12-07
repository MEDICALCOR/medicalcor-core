import type { Meta, StoryObj } from '@storybook/react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../card';
import { Input } from '../input';
import { Label } from '../label';
import { Button } from '../button';

const meta = {
  title: 'UI/Tabs',
  component: Tabs,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <div className="w-[500px]">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Tabs>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <Tabs defaultValue="account">
      <TabsList>
        <TabsTrigger value="account">Account</TabsTrigger>
        <TabsTrigger value="password">Password</TabsTrigger>
      </TabsList>
      <TabsContent value="account">
        <p className="text-sm text-muted-foreground">
          Make changes to your account here. Click save when you&apos;re done.
        </p>
      </TabsContent>
      <TabsContent value="password">
        <p className="text-sm text-muted-foreground">
          Change your password here. After saving, you&apos;ll be logged out.
        </p>
      </TabsContent>
    </Tabs>
  ),
};

export const WithCards: Story = {
  render: () => (
    <Tabs defaultValue="account">
      <TabsList className="grid w-full grid-cols-2">
        <TabsTrigger value="account">Account</TabsTrigger>
        <TabsTrigger value="password">Password</TabsTrigger>
      </TabsList>
      <TabsContent value="account">
        <Card>
          <CardHeader>
            <CardTitle>Account</CardTitle>
            <CardDescription>
              Make changes to your account here. Click save when you&apos;re done.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-1.5">
              <Label htmlFor="name">Name</Label>
              <Input id="name" defaultValue="Ion Popescu" />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="username">Username</Label>
              <Input id="username" defaultValue="@ionpopescu" />
            </div>
            <Button>Save changes</Button>
          </CardContent>
        </Card>
      </TabsContent>
      <TabsContent value="password">
        <Card>
          <CardHeader>
            <CardTitle>Password</CardTitle>
            <CardDescription>
              Change your password here. After saving, you&apos;ll be logged out.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-1.5">
              <Label htmlFor="current">Current password</Label>
              <Input id="current" type="password" />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="new">New password</Label>
              <Input id="new" type="password" />
            </div>
            <Button>Change password</Button>
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  ),
};

export const ThreeTabs: Story = {
  render: () => (
    <Tabs defaultValue="overview">
      <TabsList className="grid w-full grid-cols-3">
        <TabsTrigger value="overview">Overview</TabsTrigger>
        <TabsTrigger value="analytics">Analytics</TabsTrigger>
        <TabsTrigger value="reports">Reports</TabsTrigger>
      </TabsList>
      <TabsContent value="overview" className="mt-4">
        <div className="rounded-lg border p-4">
          <h3 className="font-medium">Dashboard Overview</h3>
          <p className="text-sm text-muted-foreground mt-2">
            View your clinic&apos;s key metrics and performance indicators.
          </p>
        </div>
      </TabsContent>
      <TabsContent value="analytics" className="mt-4">
        <div className="rounded-lg border p-4">
          <h3 className="font-medium">Analytics</h3>
          <p className="text-sm text-muted-foreground mt-2">
            Detailed analytics and trends for patient visits and revenue.
          </p>
        </div>
      </TabsContent>
      <TabsContent value="reports" className="mt-4">
        <div className="rounded-lg border p-4">
          <h3 className="font-medium">Reports</h3>
          <p className="text-sm text-muted-foreground mt-2">
            Generate and export custom reports for your clinic.
          </p>
        </div>
      </TabsContent>
    </Tabs>
  ),
};

export const PatientTabs: Story = {
  render: () => (
    <Tabs defaultValue="info">
      <TabsList>
        <TabsTrigger value="info">Info</TabsTrigger>
        <TabsTrigger value="appointments">Appointments</TabsTrigger>
        <TabsTrigger value="documents">Documents</TabsTrigger>
        <TabsTrigger value="notes">Notes</TabsTrigger>
      </TabsList>
      <TabsContent value="info" className="mt-4 space-y-4">
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-muted-foreground">Full Name</span>
            <p className="font-medium">Ion Popescu</p>
          </div>
          <div>
            <span className="text-muted-foreground">Date of Birth</span>
            <p className="font-medium">15 March 1985</p>
          </div>
          <div>
            <span className="text-muted-foreground">Phone</span>
            <p className="font-medium">+40 721 234 567</p>
          </div>
          <div>
            <span className="text-muted-foreground">Email</span>
            <p className="font-medium">ion.popescu@email.com</p>
          </div>
        </div>
      </TabsContent>
      <TabsContent value="appointments" className="mt-4">
        <div className="space-y-2">
          <div className="flex justify-between items-center p-3 border rounded-lg">
            <div>
              <p className="font-medium">Routine Checkup</p>
              <p className="text-sm text-muted-foreground">22 Dec 2024, 10:00 AM</p>
            </div>
            <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded-full">
              Upcoming
            </span>
          </div>
          <div className="flex justify-between items-center p-3 border rounded-lg">
            <div>
              <p className="font-medium">Teeth Cleaning</p>
              <p className="text-sm text-muted-foreground">15 Nov 2024, 2:00 PM</p>
            </div>
            <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded-full">
              Completed
            </span>
          </div>
        </div>
      </TabsContent>
      <TabsContent value="documents" className="mt-4">
        <p className="text-sm text-muted-foreground">No documents uploaded yet.</p>
      </TabsContent>
      <TabsContent value="notes" className="mt-4">
        <p className="text-sm text-muted-foreground">No clinical notes available.</p>
      </TabsContent>
    </Tabs>
  ),
};

export const DisabledTab: Story = {
  render: () => (
    <Tabs defaultValue="active">
      <TabsList>
        <TabsTrigger value="active">Active</TabsTrigger>
        <TabsTrigger value="disabled" disabled>
          Disabled
        </TabsTrigger>
        <TabsTrigger value="other">Other</TabsTrigger>
      </TabsList>
      <TabsContent value="active">
        <p className="text-sm text-muted-foreground mt-2">This tab is active.</p>
      </TabsContent>
      <TabsContent value="other">
        <p className="text-sm text-muted-foreground mt-2">This is the other tab.</p>
      </TabsContent>
    </Tabs>
  ),
};
