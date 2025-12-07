import type { Meta, StoryObj } from '@storybook/react';
import { useState } from 'react';
import { ChevronsUpDown, Plus, X } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '../collapsible';
import { Button } from '../button';

const meta = {
  title: 'UI/Collapsible',
  component: Collapsible,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <div className="w-[380px]">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Collapsible>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <Collapsible>
      <CollapsibleTrigger asChild>
        <Button variant="ghost" className="w-full justify-between">
          Click to expand
          <ChevronsUpDown className="h-4 w-4" />
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-2 p-4 border rounded-lg">
        <p className="text-sm text-muted-foreground">
          This is the collapsible content. It can contain any content you want.
        </p>
      </CollapsibleContent>
    </Collapsible>
  ),
};

export const DefaultOpen: Story = {
  render: () => (
    <Collapsible defaultOpen>
      <CollapsibleTrigger asChild>
        <Button variant="ghost" className="w-full justify-between">
          Open by default
          <ChevronsUpDown className="h-4 w-4" />
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-2 p-4 border rounded-lg">
        <p className="text-sm text-muted-foreground">This collapsible is open by default.</p>
      </CollapsibleContent>
    </Collapsible>
  ),
};

const ControlledCollapsible = () => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <div className="flex items-center justify-between space-x-4 px-4">
        <h4 className="text-sm font-semibold">@medicalcor/core</h4>
        <CollapsibleTrigger asChild>
          <Button variant="ghost" size="sm">
            <ChevronsUpDown className="h-4 w-4" />
            <span className="sr-only">Toggle</span>
          </Button>
        </CollapsibleTrigger>
      </div>
      <div className="rounded-md border px-4 py-2 font-mono text-sm shadow-sm mt-2">
        @medicalcor/types
      </div>
      <CollapsibleContent className="space-y-2 mt-2">
        <div className="rounded-md border px-4 py-2 font-mono text-sm shadow-sm">
          @medicalcor/domain
        </div>
        <div className="rounded-md border px-4 py-2 font-mono text-sm shadow-sm">
          @medicalcor/integrations
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
};

export const Controlled: Story = {
  render: () => <ControlledCollapsible />,
};

export const FilterSection: Story = {
  render: () => (
    <div className="space-y-2">
      <Collapsible defaultOpen>
        <CollapsibleTrigger asChild>
          <Button variant="ghost" size="sm" className="w-full justify-between px-2">
            <span className="text-sm font-medium">Lead Status</span>
            <ChevronsUpDown className="h-4 w-4" />
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="space-y-2 pt-2">
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" defaultChecked className="rounded" />
            <span>Hot Leads</span>
            <span className="ml-auto text-muted-foreground text-xs">24</span>
          </label>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" defaultChecked className="rounded" />
            <span>Warm Leads</span>
            <span className="ml-auto text-muted-foreground text-xs">56</span>
          </label>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" className="rounded" />
            <span>Cold Leads</span>
            <span className="ml-auto text-muted-foreground text-xs">128</span>
          </label>
        </CollapsibleContent>
      </Collapsible>

      <Collapsible>
        <CollapsibleTrigger asChild>
          <Button variant="ghost" size="sm" className="w-full justify-between px-2">
            <span className="text-sm font-medium">Appointment Type</span>
            <ChevronsUpDown className="h-4 w-4" />
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="space-y-2 pt-2">
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" defaultChecked className="rounded" />
            <span>Consultation</span>
          </label>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" className="rounded" />
            <span>Procedure</span>
          </label>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" className="rounded" />
            <span>Follow-up</span>
          </label>
        </CollapsibleContent>
      </Collapsible>
    </div>
  ),
};

export const ExpandableList: Story = {
  render: () => (
    <Collapsible>
      <div className="flex items-center justify-between border rounded-t-lg p-3">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
            <span className="text-sm font-medium">3</span>
          </div>
          <span className="font-medium">Team Members</span>
        </div>
        <CollapsibleTrigger asChild>
          <Button variant="ghost" size="sm">
            <Plus className="h-4 w-4" />
          </Button>
        </CollapsibleTrigger>
      </div>
      <div className="border border-t-0 p-3">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-full bg-muted"></div>
          <span className="text-sm">Dr. Maria Ionescu</span>
        </div>
      </div>
      <CollapsibleContent>
        <div className="border border-t-0 p-3">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-full bg-muted"></div>
            <span className="text-sm">Dr. Ion Popescu</span>
          </div>
        </div>
        <div className="border border-t-0 rounded-b-lg p-3">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-full bg-muted"></div>
            <span className="text-sm">Dr. Elena Dumitrescu</span>
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  ),
};
