import type { Meta, StoryObj } from '@storybook/react';
import { Avatar, AvatarFallback, AvatarImage } from '../avatar';

const meta = {
  title: 'UI/Avatar',
  component: Avatar,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  argTypes: {
    src: {
      control: 'text',
      description: 'Image source URL',
    },
    alt: {
      control: 'text',
      description: 'Image alt text',
    },
    fallback: {
      control: 'text',
      description: 'Fallback text when image is not available',
    },
  },
} satisfies Meta<typeof Avatar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const WithImage: Story = {
  render: () => (
    <Avatar
      src="https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=64&h=64&fit=crop"
      alt="User avatar"
    />
  ),
};

export const WithFallback: Story = {
  render: () => <Avatar fallback="IP" />,
};

export const FallbackOnly: Story = {
  render: () => (
    <Avatar>
      <AvatarFallback>JD</AvatarFallback>
    </Avatar>
  ),
};

export const Sizes: Story = {
  render: () => (
    <div className="flex items-center gap-4">
      <Avatar className="h-6 w-6">
        <AvatarFallback className="text-xs">XS</AvatarFallback>
      </Avatar>
      <Avatar className="h-8 w-8">
        <AvatarFallback className="text-xs">SM</AvatarFallback>
      </Avatar>
      <Avatar>
        <AvatarFallback>MD</AvatarFallback>
      </Avatar>
      <Avatar className="h-14 w-14">
        <AvatarFallback>LG</AvatarFallback>
      </Avatar>
      <Avatar className="h-20 w-20">
        <AvatarFallback className="text-xl">XL</AvatarFallback>
      </Avatar>
    </div>
  ),
};

export const DoctorAvatars: Story = {
  render: () => (
    <div className="flex items-center gap-4">
      <Avatar>
        <AvatarFallback className="bg-blue-100 text-blue-600">MI</AvatarFallback>
      </Avatar>
      <Avatar>
        <AvatarFallback className="bg-green-100 text-green-600">IP</AvatarFallback>
      </Avatar>
      <Avatar>
        <AvatarFallback className="bg-purple-100 text-purple-600">ED</AvatarFallback>
      </Avatar>
    </div>
  ),
};

export const PatientList: Story = {
  render: () => (
    <div className="space-y-3 w-[300px]">
      <div className="flex items-center gap-3 p-2 border rounded-lg">
        <Avatar>
          <AvatarFallback className="bg-primary/10 text-primary">IP</AvatarFallback>
        </Avatar>
        <div>
          <p className="text-sm font-medium">Ion Popescu</p>
          <p className="text-xs text-muted-foreground">Next: Dec 22, 10:00 AM</p>
        </div>
      </div>
      <div className="flex items-center gap-3 p-2 border rounded-lg">
        <Avatar>
          <AvatarFallback className="bg-primary/10 text-primary">MI</AvatarFallback>
        </Avatar>
        <div>
          <p className="text-sm font-medium">Maria Ionescu</p>
          <p className="text-xs text-muted-foreground">Next: Dec 23, 2:00 PM</p>
        </div>
      </div>
      <div className="flex items-center gap-3 p-2 border rounded-lg">
        <Avatar>
          <AvatarFallback className="bg-primary/10 text-primary">AD</AvatarFallback>
        </Avatar>
        <div>
          <p className="text-sm font-medium">Alexandru Dumitrescu</p>
          <p className="text-xs text-muted-foreground">Next: Dec 24, 11:00 AM</p>
        </div>
      </div>
    </div>
  ),
};

export const AvatarGroup: Story = {
  render: () => (
    <div className="flex -space-x-3">
      <Avatar className="border-2 border-background">
        <AvatarFallback className="bg-red-100 text-red-600">A</AvatarFallback>
      </Avatar>
      <Avatar className="border-2 border-background">
        <AvatarFallback className="bg-blue-100 text-blue-600">B</AvatarFallback>
      </Avatar>
      <Avatar className="border-2 border-background">
        <AvatarFallback className="bg-green-100 text-green-600">C</AvatarFallback>
      </Avatar>
      <Avatar className="border-2 border-background">
        <AvatarFallback className="bg-purple-100 text-purple-600">D</AvatarFallback>
      </Avatar>
      <Avatar className="border-2 border-background">
        <AvatarFallback className="bg-muted text-muted-foreground text-xs">+5</AvatarFallback>
      </Avatar>
    </div>
  ),
};

export const WithStatus: Story = {
  render: () => (
    <div className="flex items-center gap-6">
      <div className="relative">
        <Avatar>
          <AvatarFallback className="bg-primary/10 text-primary">MI</AvatarFallback>
        </Avatar>
        <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full bg-green-500 border-2 border-background" />
      </div>
      <div className="relative">
        <Avatar>
          <AvatarFallback className="bg-primary/10 text-primary">IP</AvatarFallback>
        </Avatar>
        <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full bg-yellow-500 border-2 border-background" />
      </div>
      <div className="relative">
        <Avatar>
          <AvatarFallback className="bg-primary/10 text-primary">ED</AvatarFallback>
        </Avatar>
        <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full bg-gray-400 border-2 border-background" />
      </div>
    </div>
  ),
};

export const TeamMembers: Story = {
  render: () => (
    <div className="space-y-4 w-[350px]">
      <h3 className="font-semibold">Team Members</h3>
      <div className="space-y-3">
        <div className="flex items-center justify-between p-3 border rounded-lg">
          <div className="flex items-center gap-3">
            <div className="relative">
              <Avatar>
                <AvatarFallback className="bg-blue-100 text-blue-600">MI</AvatarFallback>
              </Avatar>
              <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full bg-green-500 border-2 border-background" />
            </div>
            <div>
              <p className="text-sm font-medium">Dr. Maria Ionescu</p>
              <p className="text-xs text-muted-foreground">General Dentistry</p>
            </div>
          </div>
          <span className="text-xs text-green-600">Online</span>
        </div>
        <div className="flex items-center justify-between p-3 border rounded-lg">
          <div className="flex items-center gap-3">
            <div className="relative">
              <Avatar>
                <AvatarFallback className="bg-purple-100 text-purple-600">IP</AvatarFallback>
              </Avatar>
              <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full bg-green-500 border-2 border-background" />
            </div>
            <div>
              <p className="text-sm font-medium">Dr. Ion Popescu</p>
              <p className="text-xs text-muted-foreground">Orthodontics</p>
            </div>
          </div>
          <span className="text-xs text-green-600">Online</span>
        </div>
        <div className="flex items-center justify-between p-3 border rounded-lg">
          <div className="flex items-center gap-3">
            <div className="relative">
              <Avatar>
                <AvatarFallback className="bg-green-100 text-green-600">ED</AvatarFallback>
              </Avatar>
              <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full bg-gray-400 border-2 border-background" />
            </div>
            <div>
              <p className="text-sm font-medium">Dr. Elena Dumitrescu</p>
              <p className="text-xs text-muted-foreground">Oral Surgery</p>
            </div>
          </div>
          <span className="text-xs text-muted-foreground">Offline</span>
        </div>
      </div>
    </div>
  ),
};
