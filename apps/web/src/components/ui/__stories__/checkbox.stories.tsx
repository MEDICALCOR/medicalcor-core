import type { Meta, StoryObj } from '@storybook/react';
import { fn } from 'storybook/test';
import { Checkbox } from '../checkbox';
import { Label } from '../label';

const meta = {
  title: 'UI/Checkbox',
  component: Checkbox,
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
      description: 'Whether the checkbox is disabled',
    },
  },
  args: {
    onCheckedChange: fn(),
  },
} satisfies Meta<typeof Checkbox>;

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
      <Checkbox id="terms" />
      <Label htmlFor="terms">Accept terms and conditions</Label>
    </div>
  ),
};

export const WithDescription: Story = {
  render: () => (
    <div className="flex items-start space-x-2">
      <Checkbox id="notifications" className="mt-1" />
      <div className="grid gap-1.5 leading-none">
        <Label htmlFor="notifications">Email Notifications</Label>
        <p className="text-sm text-muted-foreground">
          Receive email updates about new appointments and messages.
        </p>
      </div>
    </div>
  ),
};

export const FormGroup: Story = {
  render: () => (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold">Notification Preferences</h3>
      <div className="space-y-3">
        <div className="flex items-center space-x-2">
          <Checkbox id="email" defaultChecked />
          <Label htmlFor="email">Email notifications</Label>
        </div>
        <div className="flex items-center space-x-2">
          <Checkbox id="sms" />
          <Label htmlFor="sms">SMS notifications</Label>
        </div>
        <div className="flex items-center space-x-2">
          <Checkbox id="push" defaultChecked />
          <Label htmlFor="push">Push notifications</Label>
        </div>
        <div className="flex items-center space-x-2">
          <Checkbox id="marketing" disabled />
          <Label htmlFor="marketing" className="opacity-50">
            Marketing emails (disabled)
          </Label>
        </div>
      </div>
    </div>
  ),
};
