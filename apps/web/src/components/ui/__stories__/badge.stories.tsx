import type { Meta, StoryObj } from '@storybook/react';
import { Badge } from '../badge';

const meta = {
  title: 'UI/Badge',
  component: Badge,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  argTypes: {
    variant: {
      control: 'select',
      options: ['default', 'secondary', 'destructive', 'outline', 'hot', 'warm', 'cold', 'success'],
      description: 'The visual style of the badge',
    },
  },
} satisfies Meta<typeof Badge>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    children: 'Badge',
  },
};

export const Secondary: Story = {
  args: {
    variant: 'secondary',
    children: 'Secondary',
  },
};

export const Destructive: Story = {
  args: {
    variant: 'destructive',
    children: 'Destructive',
  },
};

export const Outline: Story = {
  args: {
    variant: 'outline',
    children: 'Outline',
  },
};

export const Hot: Story = {
  args: {
    variant: 'hot',
    children: 'Hot Lead',
  },
};

export const Warm: Story = {
  args: {
    variant: 'warm',
    children: 'Warm Lead',
  },
};

export const Cold: Story = {
  args: {
    variant: 'cold',
    children: 'Cold Lead',
  },
};

export const Success: Story = {
  args: {
    variant: 'success',
    children: 'Success',
  },
};

export const AllVariants: Story = {
  render: () => (
    <div className="flex flex-wrap gap-2">
      <Badge variant="default">Default</Badge>
      <Badge variant="secondary">Secondary</Badge>
      <Badge variant="destructive">Destructive</Badge>
      <Badge variant="outline">Outline</Badge>
      <Badge variant="hot">Hot</Badge>
      <Badge variant="warm">Warm</Badge>
      <Badge variant="cold">Cold</Badge>
      <Badge variant="success">Success</Badge>
    </div>
  ),
};

export const LeadScoring: Story = {
  render: () => (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold">Lead Temperature Badges</h3>
      <div className="flex gap-2">
        <Badge variant="hot">Score: 5</Badge>
        <Badge variant="warm">Score: 3-4</Badge>
        <Badge variant="cold">Score: 1-2</Badge>
      </div>
    </div>
  ),
};
