import type { Meta, StoryObj } from '@storybook/react';
import { Separator } from '../separator';

const meta = {
  title: 'UI/Separator',
  component: Separator,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  argTypes: {
    orientation: {
      control: 'radio',
      options: ['horizontal', 'vertical'],
      description: 'The orientation of the separator',
    },
    decorative: {
      control: 'boolean',
      description: 'Whether the separator is decorative',
    },
  },
} satisfies Meta<typeof Separator>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Horizontal: Story = {
  render: () => (
    <div className="w-[300px]">
      <div className="space-y-1">
        <h4 className="text-sm font-medium leading-none">MedicalCor Core</h4>
        <p className="text-sm text-muted-foreground">AI-powered medical CRM platform</p>
      </div>
      <Separator className="my-4" />
      <div className="flex h-5 items-center space-x-4 text-sm">
        <div>Dashboard</div>
        <Separator orientation="vertical" />
        <div>Patients</div>
        <Separator orientation="vertical" />
        <div>Settings</div>
      </div>
    </div>
  ),
};

export const Vertical: Story = {
  render: () => (
    <div className="flex h-5 items-center space-x-4 text-sm">
      <div>Home</div>
      <Separator orientation="vertical" />
      <div>About</div>
      <Separator orientation="vertical" />
      <div>Contact</div>
    </div>
  ),
};

export const InCard: Story = {
  render: () => (
    <div className="w-[350px] border rounded-lg p-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">Patient Summary</h3>
        <span className="text-sm text-muted-foreground">ID: PAT-001</span>
      </div>
      <Separator className="my-4" />
      <div className="space-y-3 text-sm">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Name</span>
          <span>Ion Popescu</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Age</span>
          <span>38 years</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Last Visit</span>
          <span>15 Nov 2024</span>
        </div>
      </div>
      <Separator className="my-4" />
      <div className="flex gap-2">
        <button className="text-sm text-primary hover:underline">View Details</button>
        <Separator orientation="vertical" className="h-5" />
        <button className="text-sm text-primary hover:underline">Book Appointment</button>
      </div>
    </div>
  ),
};

export const FormSection: Story = {
  render: () => (
    <div className="w-[400px] space-y-6">
      <div>
        <h3 className="text-lg font-medium">Personal Information</h3>
        <p className="text-sm text-muted-foreground">Update your personal details here.</p>
      </div>
      <Separator />
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-medium">First Name</label>
            <input className="mt-1 w-full border rounded-md p-2 text-sm" placeholder="Ion" />
          </div>
          <div>
            <label className="text-sm font-medium">Last Name</label>
            <input className="mt-1 w-full border rounded-md p-2 text-sm" placeholder="Popescu" />
          </div>
        </div>
        <div>
          <label className="text-sm font-medium">Email</label>
          <input
            className="mt-1 w-full border rounded-md p-2 text-sm"
            placeholder="ion@example.com"
          />
        </div>
      </div>
      <Separator />
      <div>
        <h3 className="text-lg font-medium">Notifications</h3>
        <p className="text-sm text-muted-foreground">Configure how you receive notifications.</p>
      </div>
      <div className="space-y-3">
        <label className="flex items-center gap-2">
          <input type="checkbox" className="rounded" defaultChecked />
          <span className="text-sm">Email notifications</span>
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" className="rounded" />
          <span className="text-sm">SMS notifications</span>
        </label>
      </div>
    </div>
  ),
};

export const NavigationMenu: Story = {
  render: () => (
    <nav className="flex items-center space-x-6 text-sm">
      <a href="#" className="font-medium text-foreground">
        Dashboard
      </a>
      <Separator orientation="vertical" className="h-4" />
      <a href="#" className="text-muted-foreground hover:text-foreground">
        Patients
      </a>
      <Separator orientation="vertical" className="h-4" />
      <a href="#" className="text-muted-foreground hover:text-foreground">
        Appointments
      </a>
      <Separator orientation="vertical" className="h-4" />
      <a href="#" className="text-muted-foreground hover:text-foreground">
        Analytics
      </a>
      <Separator orientation="vertical" className="h-4" />
      <a href="#" className="text-muted-foreground hover:text-foreground">
        Settings
      </a>
    </nav>
  ),
};
