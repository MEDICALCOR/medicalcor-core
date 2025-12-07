import type { Meta, StoryObj } from '@storybook/react';
import { fn } from '@storybook/test';
import { Switch } from '../switch';
import { Label } from '../label';

const meta = {
  title: 'UI/Switch',
  component: Switch,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  argTypes: {
    checked: {
      control: 'boolean',
      description: 'The controlled checked state',
    },
    disabled: {
      control: 'boolean',
      description: 'Whether the switch is disabled',
    },
  },
  args: {
    onCheckedChange: fn(),
  },
} satisfies Meta<typeof Switch>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {},
};

export const Checked: Story = {
  args: {
    defaultChecked: true,
  },
};

export const Disabled: Story = {
  args: {
    disabled: true,
  },
};

export const DisabledChecked: Story = {
  args: {
    disabled: true,
    defaultChecked: true,
  },
};

export const WithLabel: Story = {
  render: () => (
    <div className="flex items-center space-x-2">
      <Switch id="airplane-mode" />
      <Label htmlFor="airplane-mode">Airplane Mode</Label>
    </div>
  ),
};

export const WithDescription: Story = {
  render: () => (
    <div className="flex items-start space-x-3">
      <Switch id="notifications" className="mt-1" defaultChecked />
      <div className="space-y-1">
        <Label htmlFor="notifications">Enable Notifications</Label>
        <p className="text-sm text-muted-foreground">
          Receive notifications about new appointments and messages.
        </p>
      </div>
    </div>
  ),
};

export const SettingsGroup: Story = {
  render: () => (
    <div className="space-y-6">
      <h3 className="text-lg font-semibold">Notification Settings</h3>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label htmlFor="email-notif">Email Notifications</Label>
            <p className="text-sm text-muted-foreground">Receive updates via email</p>
          </div>
          <Switch id="email-notif" defaultChecked />
        </div>

        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label htmlFor="sms-notif">SMS Notifications</Label>
            <p className="text-sm text-muted-foreground">Receive updates via SMS</p>
          </div>
          <Switch id="sms-notif" />
        </div>

        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label htmlFor="push-notif">Push Notifications</Label>
            <p className="text-sm text-muted-foreground">Receive in-app notifications</p>
          </div>
          <Switch id="push-notif" defaultChecked />
        </div>

        <div className="flex items-center justify-between opacity-50">
          <div className="space-y-0.5">
            <Label htmlFor="marketing">Marketing Emails</Label>
            <p className="text-sm text-muted-foreground">Receive marketing updates (disabled)</p>
          </div>
          <Switch id="marketing" disabled />
        </div>
      </div>
    </div>
  ),
};

export const AllStates: Story = {
  render: () => (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <Switch />
        <span className="text-sm">Unchecked</span>
      </div>
      <div className="flex items-center gap-4">
        <Switch defaultChecked />
        <span className="text-sm">Checked</span>
      </div>
      <div className="flex items-center gap-4">
        <Switch disabled />
        <span className="text-sm">Disabled Unchecked</span>
      </div>
      <div className="flex items-center gap-4">
        <Switch disabled defaultChecked />
        <span className="text-sm">Disabled Checked</span>
      </div>
    </div>
  ),
};
