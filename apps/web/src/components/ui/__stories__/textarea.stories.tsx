import type { Meta, StoryObj } from '@storybook/react';
import { Textarea } from '../textarea';
import { Label } from '../label';
import { Button } from '../button';

const meta = {
  title: 'UI/Textarea',
  component: Textarea,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  argTypes: {
    placeholder: {
      control: 'text',
      description: 'Placeholder text',
    },
    disabled: {
      control: 'boolean',
      description: 'Whether the textarea is disabled',
    },
    rows: {
      control: 'number',
      description: 'Number of visible rows',
    },
  },
  decorators: [
    (Story) => (
      <div className="w-[400px]">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Textarea>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    placeholder: 'Type your message here...',
  },
};

export const WithLabel: Story = {
  render: () => (
    <div className="grid gap-1.5">
      <Label htmlFor="message">Message</Label>
      <Textarea id="message" placeholder="Type your message here..." />
    </div>
  ),
};

export const WithHelperText: Story = {
  render: () => (
    <div className="grid gap-1.5">
      <Label htmlFor="notes">Clinical Notes</Label>
      <Textarea id="notes" placeholder="Enter clinical observations..." rows={4} />
      <p className="text-sm text-muted-foreground">
        Include all relevant patient observations and treatment notes.
      </p>
    </div>
  ),
};

export const Disabled: Story = {
  args: {
    disabled: true,
    placeholder: 'This textarea is disabled',
    value: 'Cannot edit this content',
  },
};

export const WithCharacterCount: Story = {
  render: () => {
    const maxLength = 500;
    const currentLength = 125;
    return (
      <div className="grid gap-1.5">
        <Label htmlFor="bio">Bio</Label>
        <Textarea
          id="bio"
          placeholder="Tell us about yourself..."
          maxLength={maxLength}
          defaultValue="Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore."
        />
        <p className="text-sm text-muted-foreground text-right">
          {currentLength}/{maxLength} characters
        </p>
      </div>
    );
  },
};

export const WithError: Story = {
  render: () => (
    <div className="grid gap-1.5">
      <Label htmlFor="description" className="text-destructive">
        Description
      </Label>
      <Textarea
        id="description"
        placeholder="Enter description..."
        className="border-destructive focus-visible:ring-destructive"
        defaultValue="Too short"
      />
      <p className="text-sm text-destructive">Description must be at least 50 characters.</p>
    </div>
  ),
};

export const Resizable: Story = {
  args: {
    placeholder: 'This textarea can be resized...',
    className: 'resize',
    rows: 3,
  },
};

export const PatientNotes: Story = {
  render: () => (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold">Patient Visit Notes</h3>
      <div className="grid gap-1.5">
        <Label htmlFor="chief-complaint">Chief Complaint</Label>
        <Textarea
          id="chief-complaint"
          placeholder="Patient's main concern..."
          rows={2}
          defaultValue="Patient reports sensitivity to cold on lower right molars."
        />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="findings">Clinical Findings</Label>
        <Textarea id="findings" placeholder="Examination findings..." rows={4} />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="treatment-plan">Treatment Plan</Label>
        <Textarea id="treatment-plan" placeholder="Recommended treatment..." rows={3} />
      </div>
      <Button className="w-full">Save Notes</Button>
    </div>
  ),
};
