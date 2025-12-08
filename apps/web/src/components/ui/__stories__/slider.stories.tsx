import type { Meta, StoryObj } from '@storybook/react';
import { fn } from 'storybook/test';
import { useState } from 'react';
import { Slider } from '../slider';
import { Label } from '../label';

const meta = {
  title: 'UI/Slider',
  component: Slider,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  argTypes: {
    min: {
      control: 'number',
      description: 'Minimum value',
    },
    max: {
      control: 'number',
      description: 'Maximum value',
    },
    step: {
      control: 'number',
      description: 'Step increment',
    },
    defaultValue: {
      control: 'number',
      description: 'Default value',
    },
    showValue: {
      control: 'boolean',
      description: 'Show current value',
    },
    disabled: {
      control: 'boolean',
      description: 'Disable the slider',
    },
  },
  args: {
    onValueChange: fn(),
  },
  decorators: [
    (Story) => (
      <div className="w-[350px]">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Slider>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    defaultValue: 50,
  },
};

export const WithValue: Story = {
  args: {
    defaultValue: 75,
    showValue: true,
  },
};

export const CustomRange: Story = {
  args: {
    min: 0,
    max: 10,
    step: 1,
    defaultValue: 5,
    showValue: true,
  },
};

export const Disabled: Story = {
  args: {
    defaultValue: 50,
    disabled: true,
    showValue: true,
  },
};

export const WithLabel: Story = {
  render: () => (
    <div className="space-y-4">
      <div className="flex justify-between">
        <Label>Volume</Label>
        <span className="text-sm text-muted-foreground">75%</span>
      </div>
      <Slider defaultValue={75} />
    </div>
  ),
};

export const LeadScoreFilter: Story = {
  render: () => {
    const [value, setValue] = useState(50);

    return (
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <Label>Minimum Lead Score</Label>
          <span className="text-sm font-medium">{value}</span>
        </div>
        <Slider value={value} onValueChange={setValue} min={0} max={100} step={5} />
        <p className="text-sm text-muted-foreground">Showing leads with score {value} or higher</p>
      </div>
    );
  },
};

export const PriceRange: Story = {
  render: () => {
    const [value, setValue] = useState(500);

    return (
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <Label>Max Price</Label>
          <span className="text-sm font-medium">€{value}</span>
        </div>
        <Slider value={value} onValueChange={setValue} min={0} max={1000} step={50} />
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>€0</span>
          <span>€1,000</span>
        </div>
      </div>
    );
  },
};

export const TimeSelector: Story = {
  render: () => {
    const [hours, setHours] = useState(9);

    return (
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <Label>Appointment Time</Label>
          <span className="text-sm font-medium">{hours.toString().padStart(2, '0')}:00</span>
        </div>
        <Slider value={hours} onValueChange={setHours} min={8} max={18} step={1} />
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>8:00 AM</span>
          <span>6:00 PM</span>
        </div>
      </div>
    );
  },
};

export const FormattedValue: Story = {
  args: {
    defaultValue: 30,
    min: 0,
    max: 60,
    step: 5,
    showValue: true,
    formatValue: (v: number) => `${v} min`,
  },
};

export const PercentageSlider: Story = {
  render: () => {
    const [value, setValue] = useState(25);

    return (
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <Label>Discount</Label>
          <span className="text-sm font-medium">{value}%</span>
        </div>
        <Slider value={value} onValueChange={setValue} min={0} max={100} step={5} />
      </div>
    );
  },
};

export const MultipleSliders: Story = {
  render: () => (
    <div className="space-y-6">
      <h3 className="text-lg font-semibold">Notification Settings</h3>

      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <Label>Email Frequency</Label>
          <span className="text-sm text-muted-foreground">Daily</span>
        </div>
        <Slider defaultValue={2} min={0} max={3} step={1} />
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>Never</span>
          <span>Hourly</span>
          <span>Daily</span>
          <span>Weekly</span>
        </div>
      </div>

      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <Label>Reminder Time (hours before)</Label>
          <span className="text-sm text-muted-foreground">24h</span>
        </div>
        <Slider defaultValue={24} min={1} max={48} step={1} />
      </div>

      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <Label>Quiet Hours Start</Label>
          <span className="text-sm text-muted-foreground">22:00</span>
        </div>
        <Slider defaultValue={22} min={18} max={23} step={1} />
      </div>
    </div>
  ),
};

export const AllStates: Story = {
  render: () => (
    <div className="space-y-6">
      <div className="space-y-2">
        <Label>Empty (0%)</Label>
        <Slider defaultValue={0} />
      </div>
      <div className="space-y-2">
        <Label>Quarter (25%)</Label>
        <Slider defaultValue={25} />
      </div>
      <div className="space-y-2">
        <Label>Half (50%)</Label>
        <Slider defaultValue={50} />
      </div>
      <div className="space-y-2">
        <Label>Three Quarters (75%)</Label>
        <Slider defaultValue={75} />
      </div>
      <div className="space-y-2">
        <Label>Full (100%)</Label>
        <Slider defaultValue={100} />
      </div>
      <div className="space-y-2">
        <Label>Disabled</Label>
        <Slider defaultValue={50} disabled />
      </div>
    </div>
  ),
};
