import type { Meta, StoryObj } from '@storybook/react';
import { Settings, X } from 'lucide-react';
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '../sheet';
import { Button } from '../button';
import { Input } from '../input';
import { Label } from '../label';
import { Separator } from '../separator';
import { Switch } from '../switch';

const meta = {
  title: 'UI/Sheet',
  component: Sheet,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
} satisfies Meta<typeof Sheet>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline">Open Sheet</Button>
      </SheetTrigger>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Sheet Title</SheetTitle>
          <SheetDescription>
            This is a sheet description. It provides context about the sheet content.
          </SheetDescription>
        </SheetHeader>
        <div className="py-4">
          <p className="text-sm text-muted-foreground">Sheet content goes here.</p>
        </div>
      </SheetContent>
    </Sheet>
  ),
};

export const LeftSide: Story = {
  render: () => (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline">Open Left Sheet</Button>
      </SheetTrigger>
      <SheetContent side="left">
        <SheetHeader>
          <SheetTitle>Navigation</SheetTitle>
          <SheetDescription>Access different sections of the application.</SheetDescription>
        </SheetHeader>
        <nav className="flex flex-col gap-2 py-4">
          <a href="#" className="rounded-md px-3 py-2 text-sm font-medium hover:bg-muted">
            Dashboard
          </a>
          <a href="#" className="rounded-md px-3 py-2 text-sm font-medium hover:bg-muted">
            Patients
          </a>
          <a href="#" className="rounded-md px-3 py-2 text-sm font-medium hover:bg-muted">
            Appointments
          </a>
          <a href="#" className="rounded-md px-3 py-2 text-sm font-medium hover:bg-muted">
            Analytics
          </a>
          <a href="#" className="rounded-md px-3 py-2 text-sm font-medium hover:bg-muted">
            Settings
          </a>
        </nav>
      </SheetContent>
    </Sheet>
  ),
};

export const TopSide: Story = {
  render: () => (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline">Open Top Sheet</Button>
      </SheetTrigger>
      <SheetContent side="top" className="h-auto">
        <SheetHeader>
          <SheetTitle>Notification</SheetTitle>
          <SheetDescription>You have new updates available.</SheetDescription>
        </SheetHeader>
        <div className="flex items-center justify-end gap-2 pt-4">
          <SheetClose asChild>
            <Button variant="outline" size="sm">
              Dismiss
            </Button>
          </SheetClose>
          <Button size="sm">View Updates</Button>
        </div>
      </SheetContent>
    </Sheet>
  ),
};

export const BottomSide: Story = {
  render: () => (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline">Open Bottom Sheet</Button>
      </SheetTrigger>
      <SheetContent side="bottom" className="h-auto">
        <SheetHeader>
          <SheetTitle>Quick Actions</SheetTitle>
        </SheetHeader>
        <div className="grid grid-cols-4 gap-4 py-4">
          <button className="flex flex-col items-center gap-2 rounded-lg p-4 hover:bg-muted">
            <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
              📅
            </div>
            <span className="text-xs">Book</span>
          </button>
          <button className="flex flex-col items-center gap-2 rounded-lg p-4 hover:bg-muted">
            <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
              👤
            </div>
            <span className="text-xs">Patient</span>
          </button>
          <button className="flex flex-col items-center gap-2 rounded-lg p-4 hover:bg-muted">
            <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
              💬
            </div>
            <span className="text-xs">Message</span>
          </button>
          <button className="flex flex-col items-center gap-2 rounded-lg p-4 hover:bg-muted">
            <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
              📊
            </div>
            <span className="text-xs">Reports</span>
          </button>
        </div>
      </SheetContent>
    </Sheet>
  ),
};

export const EditProfile: Story = {
  render: () => (
    <Sheet>
      <SheetTrigger asChild>
        <Button>Edit Profile</Button>
      </SheetTrigger>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Edit Profile</SheetTitle>
          <SheetDescription>
            Make changes to your profile here. Click save when you&apos;re done.
          </SheetDescription>
        </SheetHeader>
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="name">Name</Label>
            <Input id="name" defaultValue="Ion Popescu" />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" defaultValue="ion@example.com" />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="phone">Phone</Label>
            <Input id="phone" type="tel" defaultValue="+40 721 234 567" />
          </div>
        </div>
        <SheetFooter>
          <SheetClose asChild>
            <Button variant="outline">Cancel</Button>
          </SheetClose>
          <Button>Save changes</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  ),
};

export const SettingsPanel: Story = {
  render: () => (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline" size="icon">
          <Settings className="h-4 w-4" />
        </Button>
      </SheetTrigger>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Settings</SheetTitle>
          <SheetDescription>Configure your application preferences.</SheetDescription>
        </SheetHeader>
        <div className="space-y-6 py-4">
          <div className="space-y-4">
            <h4 className="text-sm font-medium">Notifications</h4>
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Email Notifications</Label>
                <p className="text-sm text-muted-foreground">Receive updates via email</p>
              </div>
              <Switch defaultChecked />
            </div>
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Push Notifications</Label>
                <p className="text-sm text-muted-foreground">Receive in-app notifications</p>
              </div>
              <Switch defaultChecked />
            </div>
          </div>
          <Separator />
          <div className="space-y-4">
            <h4 className="text-sm font-medium">Appearance</h4>
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Dark Mode</Label>
                <p className="text-sm text-muted-foreground">Use dark theme</p>
              </div>
              <Switch />
            </div>
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Compact Mode</Label>
                <p className="text-sm text-muted-foreground">Reduce spacing in UI</p>
              </div>
              <Switch />
            </div>
          </div>
          <Separator />
          <div className="space-y-4">
            <h4 className="text-sm font-medium">Language</h4>
            <select className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
              <option value="en">English</option>
              <option value="ro">Română</option>
              <option value="de">Deutsch</option>
            </select>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  ),
};

export const PatientDetails: Story = {
  render: () => (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline">View Patient</Button>
      </SheetTrigger>
      <SheetContent className="sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>Patient Details</SheetTitle>
          <SheetDescription>View and manage patient information.</SheetDescription>
        </SheetHeader>
        <div className="space-y-6 py-4">
          <div className="flex items-center gap-4">
            <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center">
              <span className="text-xl font-semibold">IP</span>
            </div>
            <div>
              <h3 className="font-semibold">Ion Popescu</h3>
              <p className="text-sm text-muted-foreground">PAT-2024-001</p>
            </div>
          </div>
          <Separator />
          <div className="grid gap-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Email</span>
              <span>ion@example.com</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Phone</span>
              <span>+40 721 234 567</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Date of Birth</span>
              <span>15 March 1985</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Lead Score</span>
              <span className="text-emerald-600 font-medium">85/100</span>
            </div>
          </div>
          <Separator />
          <div>
            <h4 className="text-sm font-medium mb-2">Recent Appointments</h4>
            <div className="space-y-2">
              <div className="flex justify-between items-center p-2 border rounded text-sm">
                <span>Routine Checkup</span>
                <span className="text-muted-foreground">15 Nov 2024</span>
              </div>
              <div className="flex justify-between items-center p-2 border rounded text-sm">
                <span>Teeth Cleaning</span>
                <span className="text-muted-foreground">01 Oct 2024</span>
              </div>
            </div>
          </div>
        </div>
        <SheetFooter>
          <Button variant="outline" className="w-full">
            Edit Patient
          </Button>
          <Button className="w-full">Book Appointment</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  ),
};
