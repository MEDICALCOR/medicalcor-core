import type { Meta, StoryObj } from '@storybook/react';
import { fn } from 'storybook/test';
import { Loader2, Save, Send, Plus, Check } from 'lucide-react';
import { SubmitButton } from '../submit-button';

/**
 * SubmitButton Demo Component
 * Since useFormStatus only works within a form with server actions,
 * we create demo components to showcase the button states.
 */
function SubmitButtonDemo({
  children,
  pendingText,
  variant,
  size,
  disabled,
}: {
  children: React.ReactNode;
  pendingText?: string;
  variant?: 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link';
  size?: 'default' | 'sm' | 'lg' | 'icon';
  disabled?: boolean;
}) {
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
      }}
    >
      <SubmitButton pendingText={pendingText} variant={variant} size={size} disabled={disabled}>
        {children}
      </SubmitButton>
    </form>
  );
}

/**
 * Demo component to show the pending state appearance
 */
function PendingStateDemo({
  children,
  pendingText,
}: {
  children: React.ReactNode;
  pendingText?: string;
}) {
  return (
    <button
      type="button"
      disabled
      className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-4 py-2"
    >
      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
      {pendingText ?? children}
    </button>
  );
}

const meta = {
  title: 'UI/SubmitButton',
  component: SubmitButton,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  argTypes: {
    variant: {
      control: 'select',
      options: ['default', 'destructive', 'outline', 'secondary', 'ghost', 'link'],
      description: 'The visual style of the button',
    },
    size: {
      control: 'select',
      options: ['default', 'sm', 'lg', 'icon'],
      description: 'The size of the button',
    },
    disabled: {
      control: 'boolean',
      description: 'Whether the button is disabled',
    },
    pendingText: {
      control: 'text',
      description: 'Text to show while submitting',
    },
  },
  args: {
    onClick: fn(),
  },
} satisfies Meta<typeof SubmitButton>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => <SubmitButtonDemo>Submit</SubmitButtonDemo>,
};

export const WithPendingText: Story = {
  render: () => <SubmitButtonDemo pendingText="Saving...">Save Changes</SubmitButtonDemo>,
};

export const PendingState: Story = {
  render: () => (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        This shows how the button looks during form submission:
      </p>
      <PendingStateDemo pendingText="Saving...">Save Changes</PendingStateDemo>
    </div>
  ),
};

export const WithIcon: Story = {
  render: () => (
    <SubmitButtonDemo>
      <Save className="mr-2 h-4 w-4" />
      Save
    </SubmitButtonDemo>
  ),
};

export const Destructive: Story = {
  render: () => (
    <SubmitButtonDemo variant="destructive" pendingText="Deleting...">
      Delete Patient
    </SubmitButtonDemo>
  ),
};

export const Secondary: Story = {
  render: () => (
    <SubmitButtonDemo variant="secondary">
      <Plus className="mr-2 h-4 w-4" />
      Add Note
    </SubmitButtonDemo>
  ),
};

export const Outline: Story = {
  render: () => <SubmitButtonDemo variant="outline">Cancel</SubmitButtonDemo>,
};

export const Small: Story = {
  render: () => <SubmitButtonDemo size="sm">Submit</SubmitButtonDemo>,
};

export const Large: Story = {
  render: () => (
    <SubmitButtonDemo size="lg">
      <Send className="mr-2 h-5 w-5" />
      Send Message
    </SubmitButtonDemo>
  ),
};

export const Disabled: Story = {
  render: () => <SubmitButtonDemo disabled>Submit</SubmitButtonDemo>,
};

export const AllStates: Story = {
  render: () => (
    <div className="space-y-6">
      <div>
        <h4 className="text-sm font-medium mb-3">Normal State</h4>
        <SubmitButtonDemo>
          <Check className="mr-2 h-4 w-4" />
          Confirm Appointment
        </SubmitButtonDemo>
      </div>

      <div>
        <h4 className="text-sm font-medium mb-3">Pending State (simulated)</h4>
        <PendingStateDemo pendingText="Confirming...">Confirm Appointment</PendingStateDemo>
      </div>

      <div>
        <h4 className="text-sm font-medium mb-3">Disabled State</h4>
        <SubmitButtonDemo disabled>
          <Check className="mr-2 h-4 w-4" />
          Confirm Appointment
        </SubmitButtonDemo>
      </div>
    </div>
  ),
};

export const FormExample: Story = {
  render: () => (
    <form
      className="space-y-4 w-80"
      onSubmit={(e) => {
        e.preventDefault();
      }}
    >
      <div className="space-y-2">
        <label htmlFor="email" className="text-sm font-medium">
          Email
        </label>
        <input
          id="email"
          type="email"
          placeholder="patient@example.com"
          className="w-full px-3 py-2 border rounded-md"
        />
      </div>
      <div className="space-y-2">
        <label htmlFor="message" className="text-sm font-medium">
          Message
        </label>
        <textarea
          id="message"
          rows={3}
          placeholder="Enter your message..."
          className="w-full px-3 py-2 border rounded-md"
        />
      </div>
      <div className="flex justify-end gap-2">
        <button type="button" className="px-4 py-2 border rounded-md hover:bg-muted">
          Cancel
        </button>
        <SubmitButton pendingText="Sending...">
          <Send className="mr-2 h-4 w-4" />
          Send
        </SubmitButton>
      </div>
    </form>
  ),
};
