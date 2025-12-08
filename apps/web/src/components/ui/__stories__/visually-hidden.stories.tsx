// @ts-nocheck
import type { Meta, StoryObj } from '@storybook/react';
import { VisuallyHidden } from '../visually-hidden';

const meta = {
  title: 'UI/VisuallyHidden',
  component: VisuallyHidden,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  argTypes: {
    children: {
      control: 'text',
      description: 'The content to be visually hidden but accessible to screen readers',
    },
  },
} satisfies Meta<typeof VisuallyHidden>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    children: 'This text is hidden visually but accessible to screen readers',
  },
  render: (args) => (
    <div className="text-center">
      <p className="text-muted-foreground mb-4">
        The text below is visually hidden but accessible to screen readers:
      </p>
      <VisuallyHidden {...args} />
      <p className="text-sm text-muted-foreground">(Inspect the DOM to see the hidden text)</p>
    </div>
  ),
};

export const WithButton: Story = {
  render: () => (
    <button className="p-2 border rounded-lg hover:bg-muted">
      <span aria-hidden="true">×</span>
      <VisuallyHidden>Close dialog</VisuallyHidden>
    </button>
  ),
};

export const WithIconButton: Story = {
  render: () => (
    <div className="flex gap-4 items-center">
      <button className="p-2 border rounded-lg hover:bg-muted">
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
          />
        </svg>
        <VisuallyHidden>Search</VisuallyHidden>
      </button>
      <button className="p-2 border rounded-lg hover:bg-muted">
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 6v6m0 0v6m0-6h6m-6 0H6"
          />
        </svg>
        <VisuallyHidden>Add new item</VisuallyHidden>
      </button>
    </div>
  ),
};

export const FormLabelUsage: Story = {
  render: () => (
    <form className="space-y-4">
      <div>
        <label htmlFor="search-input">
          <VisuallyHidden>Search patients</VisuallyHidden>
        </label>
        <input
          id="search-input"
          type="search"
          placeholder="Search patients..."
          className="px-4 py-2 border rounded-lg w-64"
        />
      </div>
      <p className="text-xs text-muted-foreground">
        The label is visually hidden but the input is accessible
      </p>
    </form>
  ),
};

export const AccessibilityExample: Story = {
  render: () => (
    <div className="space-y-6">
      <h3 className="text-lg font-semibold">Accessibility Pattern Examples</h3>

      <div className="space-y-4">
        <div className="p-4 border rounded-lg">
          <h4 className="font-medium mb-2">Skip Link</h4>
          <a href="#main-content" className="focus:not-sr-only">
            <VisuallyHidden>Skip to main content</VisuallyHidden>
          </a>
          <p className="text-sm text-muted-foreground">
            Tab to reveal the skip link (focus-visible pattern)
          </p>
        </div>

        <div className="p-4 border rounded-lg">
          <h4 className="font-medium mb-2">Status Message</h4>
          <div role="status" aria-live="polite">
            <VisuallyHidden>3 new notifications</VisuallyHidden>
          </div>
          <p className="text-sm text-muted-foreground">Screen readers will announce this status</p>
        </div>

        <div className="p-4 border rounded-lg">
          <h4 className="font-medium mb-2">Loading State</h4>
          <div role="alert" aria-busy="true">
            <VisuallyHidden>Loading patient data, please wait...</VisuallyHidden>
          </div>
          <p className="text-sm text-muted-foreground">
            Screen readers will announce loading state
          </p>
        </div>
      </div>
    </div>
  ),
};
