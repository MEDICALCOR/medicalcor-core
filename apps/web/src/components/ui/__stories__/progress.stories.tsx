import type { Meta, StoryObj } from '@storybook/react';
import { useEffect, useState } from 'react';
import { Progress } from '../progress';

const meta = {
  title: 'UI/Progress',
  component: Progress,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  argTypes: {
    value: {
      control: { type: 'range', min: 0, max: 100 },
      description: 'Progress value (0-100)',
    },
  },
  decorators: [
    (Story) => (
      <div className="w-[400px]">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Progress>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    value: 60,
  },
};

export const Empty: Story = {
  args: {
    value: 0,
  },
};

export const Complete: Story = {
  args: {
    value: 100,
  },
};

export const Values: Story = {
  render: () => (
    <div className="space-y-4">
      <div className="space-y-2">
        <div className="flex justify-between text-sm">
          <span>0%</span>
        </div>
        <Progress value={0} />
      </div>
      <div className="space-y-2">
        <div className="flex justify-between text-sm">
          <span>25%</span>
        </div>
        <Progress value={25} />
      </div>
      <div className="space-y-2">
        <div className="flex justify-between text-sm">
          <span>50%</span>
        </div>
        <Progress value={50} />
      </div>
      <div className="space-y-2">
        <div className="flex justify-between text-sm">
          <span>75%</span>
        </div>
        <Progress value={75} />
      </div>
      <div className="space-y-2">
        <div className="flex justify-between text-sm">
          <span>100%</span>
        </div>
        <Progress value={100} />
      </div>
    </div>
  ),
};

const AnimatedProgress = () => {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 100) return 0;
        return prev + 10;
      });
    }, 500);

    return () => clearInterval(timer);
  }, []);

  return (
    <div className="space-y-2">
      <div className="flex justify-between text-sm">
        <span>Loading...</span>
        <span>{progress}%</span>
      </div>
      <Progress value={progress} />
    </div>
  );
};

export const Animated: Story = {
  render: () => <AnimatedProgress />,
};

export const WithLabel: Story = {
  render: () => (
    <div className="space-y-2">
      <div className="flex justify-between text-sm">
        <span className="font-medium">Profile Completion</span>
        <span className="text-muted-foreground">75%</span>
      </div>
      <Progress value={75} />
    </div>
  ),
};

export const FileUpload: Story = {
  render: () => (
    <div className="space-y-4">
      <div className="space-y-2">
        <div className="flex justify-between text-sm">
          <span className="truncate">patient-records.pdf</span>
          <span className="text-muted-foreground">100%</span>
        </div>
        <Progress value={100} className="h-2" />
      </div>
      <div className="space-y-2">
        <div className="flex justify-between text-sm">
          <span className="truncate">x-ray-images.zip</span>
          <span className="text-muted-foreground">65%</span>
        </div>
        <Progress value={65} className="h-2" />
      </div>
      <div className="space-y-2">
        <div className="flex justify-between text-sm">
          <span className="truncate">consent-form.pdf</span>
          <span className="text-muted-foreground">23%</span>
        </div>
        <Progress value={23} className="h-2" />
      </div>
    </div>
  ),
};

export const LeadScore: Story = {
  render: () => (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold">Lead Scores</h3>
      <div className="space-y-3">
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span>Ion Popescu</span>
            <span className="font-medium text-green-600">85</span>
          </div>
          <Progress value={85} className="[&>div]:bg-green-500" />
        </div>
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span>Maria Ionescu</span>
            <span className="font-medium text-amber-600">62</span>
          </div>
          <Progress value={62} className="[&>div]:bg-amber-500" />
        </div>
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span>Alexandru Dumitrescu</span>
            <span className="font-medium text-red-600">28</span>
          </div>
          <Progress value={28} className="[&>div]:bg-red-500" />
        </div>
      </div>
    </div>
  ),
};

export const GoalProgress: Story = {
  render: () => (
    <div className="border rounded-lg p-4 space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="font-medium">Monthly Appointments Goal</h3>
        <span className="text-2xl font-bold">48/60</span>
      </div>
      <Progress value={80} className="h-3" />
      <p className="text-sm text-muted-foreground">12 more appointments to reach your goal</p>
    </div>
  ),
};

export const Sizes: Story = {
  render: () => (
    <div className="space-y-6">
      <div className="space-y-2">
        <span className="text-sm">Small (h-1)</span>
        <Progress value={60} className="h-1" />
      </div>
      <div className="space-y-2">
        <span className="text-sm">Default (h-4)</span>
        <Progress value={60} />
      </div>
      <div className="space-y-2">
        <span className="text-sm">Medium (h-3)</span>
        <Progress value={60} className="h-3" />
      </div>
      <div className="space-y-2">
        <span className="text-sm">Large (h-6)</span>
        <Progress value={60} className="h-6" />
      </div>
    </div>
  ),
};
