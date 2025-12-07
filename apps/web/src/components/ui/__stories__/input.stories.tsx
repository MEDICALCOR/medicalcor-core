import type { Meta, StoryObj } from '@storybook/react';
import { Mail, Search, Eye, EyeOff } from 'lucide-react';
import { useState } from 'react';
import { Input } from '../input';
import { Label } from '../label';
import { Button } from '../button';

const meta = {
  title: 'UI/Input',
  component: Input,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  argTypes: {
    type: {
      control: 'select',
      options: ['text', 'email', 'password', 'number', 'tel', 'url', 'search', 'date'],
      description: 'The type of input',
    },
    placeholder: {
      control: 'text',
      description: 'Placeholder text',
    },
    disabled: {
      control: 'boolean',
      description: 'Whether the input is disabled',
    },
  },
  decorators: [
    (Story) => (
      <div className="w-[350px]">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Input>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    placeholder: 'Enter text...',
  },
};

export const Email: Story = {
  args: {
    type: 'email',
    placeholder: 'email@example.com',
  },
};

export const Password: Story = {
  args: {
    type: 'password',
    placeholder: 'Enter password',
  },
};

export const Number: Story = {
  args: {
    type: 'number',
    placeholder: '0',
    min: 0,
    max: 100,
  },
};

export const Disabled: Story = {
  args: {
    disabled: true,
    placeholder: 'Disabled input',
    value: 'Cannot edit this',
  },
};

export const WithLabel: Story = {
  render: () => (
    <div className="grid w-full gap-1.5">
      <Label htmlFor="email">Email</Label>
      <Input type="email" id="email" placeholder="email@example.com" />
    </div>
  ),
};

export const WithHelperText: Story = {
  render: () => (
    <div className="grid w-full gap-1.5">
      <Label htmlFor="phone">Phone Number</Label>
      <Input type="tel" id="phone" placeholder="+40 XXX XXX XXX" />
      <p className="text-sm text-muted-foreground">
        Enter your phone number including country code.
      </p>
    </div>
  ),
};

export const WithIcon: Story = {
  render: () => (
    <div className="relative">
      <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input className="pl-10" placeholder="Search patients..." />
    </div>
  ),
};

export const WithRightIcon: Story = {
  render: () => (
    <div className="relative">
      <Input type="email" placeholder="Enter your email" className="pr-10" />
      <Mail className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
    </div>
  ),
};

const PasswordInputDemo = () => {
  const [showPassword, setShowPassword] = useState(false);

  return (
    <div className="relative">
      <Input
        type={showPassword ? 'text' : 'password'}
        placeholder="Enter password"
        className="pr-10"
      />
      <button
        type="button"
        onClick={() => setShowPassword(!showPassword)}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
      >
        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
};

export const PasswordToggle: Story = {
  render: () => <PasswordInputDemo />,
};

export const WithError: Story = {
  render: () => (
    <div className="grid w-full gap-1.5">
      <Label htmlFor="email-error" className="text-destructive">
        Email
      </Label>
      <Input
        type="email"
        id="email-error"
        placeholder="email@example.com"
        className="border-destructive focus-visible:ring-destructive"
        defaultValue="invalid-email"
      />
      <p className="text-sm text-destructive">Please enter a valid email address.</p>
    </div>
  ),
};

export const File: Story = {
  args: {
    type: 'file',
  },
};

export const FormExample: Story = {
  render: () => (
    <form className="space-y-4">
      <div className="grid gap-1.5">
        <Label htmlFor="name">Full Name</Label>
        <Input id="name" placeholder="Ion Popescu" />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="email-form">Email</Label>
        <Input type="email" id="email-form" placeholder="ion@example.com" />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="phone-form">Phone</Label>
        <Input type="tel" id="phone-form" placeholder="+40 XXX XXX XXX" />
      </div>
      <Button type="submit" className="w-full">
        Submit
      </Button>
    </form>
  ),
};
