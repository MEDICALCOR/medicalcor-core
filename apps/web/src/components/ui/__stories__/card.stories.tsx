import type { Meta, StoryObj } from '@storybook/react';
import { Calendar, Users, CreditCard, Activity } from 'lucide-react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '../card';
import { Button } from '../button';
import { Input } from '../input';
import { Label } from '../label';

const meta = {
  title: 'UI/Card',
  component: Card,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <div className="w-[400px]">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Card>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <Card>
      <CardHeader>
        <CardTitle>Card Title</CardTitle>
        <CardDescription>Card description goes here.</CardDescription>
      </CardHeader>
      <CardContent>
        <p>Card content goes here.</p>
      </CardContent>
    </Card>
  ),
};

export const WithFooter: Story = {
  render: () => (
    <Card>
      <CardHeader>
        <CardTitle>Create Project</CardTitle>
        <CardDescription>Deploy your new project in one-click.</CardDescription>
      </CardHeader>
      <CardContent>
        <form>
          <div className="grid w-full gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor="name">Name</Label>
              <Input id="name" placeholder="Project name" />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="framework">Framework</Label>
              <Input id="framework" placeholder="Next.js" />
            </div>
          </div>
        </form>
      </CardContent>
      <CardFooter className="flex justify-between">
        <Button variant="outline">Cancel</Button>
        <Button>Deploy</Button>
      </CardFooter>
    </Card>
  ),
};

export const SimpleCard: Story = {
  render: () => (
    <Card>
      <CardContent className="pt-6">
        <p className="text-center text-muted-foreground">A simple card with only content.</p>
      </CardContent>
    </Card>
  ),
};

export const PatientCard: Story = {
  render: () => (
    <Card>
      <CardHeader className="flex flex-row items-center gap-4">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
          <span className="text-lg font-semibold">IP</span>
        </div>
        <div>
          <CardTitle>Ion Popescu</CardTitle>
          <CardDescription>Patient ID: PAT-2024-001</CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid gap-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Last Visit:</span>
            <span>15 Nov 2024</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Next Appointment:</span>
            <span>22 Dec 2024</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Lead Score:</span>
            <span className="text-emerald-600 font-medium">85/100</span>
          </div>
        </div>
      </CardContent>
      <CardFooter className="gap-2">
        <Button className="flex-1" variant="outline">
          View Profile
        </Button>
        <Button className="flex-1">Book Appointment</Button>
      </CardFooter>
    </Card>
  ),
};

export const StatsCards: Story = {
  render: () => (
    <div className="grid grid-cols-2 gap-4 w-[500px]">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium">Total Patients</CardTitle>
          <Users className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">2,350</div>
          <p className="text-xs text-muted-foreground">+12% from last month</p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium">Appointments</CardTitle>
          <Calendar className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">48</div>
          <p className="text-xs text-muted-foreground">This week</p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium">Revenue</CardTitle>
          <CreditCard className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">€45,231</div>
          <p className="text-xs text-muted-foreground">+8.2% from last month</p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium">Active Now</CardTitle>
          <Activity className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">+573</div>
          <p className="text-xs text-muted-foreground">+201 since last hour</p>
        </CardContent>
      </Card>
    </div>
  ),
};

export const AppointmentCard: Story = {
  render: () => (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Upcoming Appointment</CardTitle>
          <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded-full">
            Confirmed
          </span>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-3">
          <Calendar className="h-5 w-5 text-muted-foreground" />
          <div>
            <p className="font-medium">December 22, 2024</p>
            <p className="text-sm text-muted-foreground">10:00 AM - 11:00 AM</p>
          </div>
        </div>
        <div className="border-t pt-4">
          <p className="text-sm text-muted-foreground">Procedure</p>
          <p className="font-medium">Routine Checkup & Cleaning</p>
        </div>
        <div>
          <p className="text-sm text-muted-foreground">Doctor</p>
          <p className="font-medium">Dr. Maria Ionescu</p>
        </div>
      </CardContent>
      <CardFooter className="gap-2">
        <Button variant="outline" className="flex-1">
          Reschedule
        </Button>
        <Button variant="destructive" className="flex-1">
          Cancel
        </Button>
      </CardFooter>
    </Card>
  ),
};
