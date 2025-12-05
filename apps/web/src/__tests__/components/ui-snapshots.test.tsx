/// <reference types="@testing-library/jest-dom" />
/**
 * Snapshot tests for all UI components
 * These tests verify that components render correctly and catch unintended UI changes
 */
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import React from 'react';

// Import all UI components
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from '@/components/ui/card';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { Progress } from '@/components/ui/progress';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';

// ============================================================================
// Button Component Snapshots
// ============================================================================
describe('Button Snapshots', () => {
  it('renders default button', () => {
    const { container } = render(<Button>Click me</Button>);
    expect(container).toMatchSnapshot();
  });

  it('renders all button variants', () => {
    const { container } = render(
      <div>
        <Button variant="default">Default</Button>
        <Button variant="destructive">Destructive</Button>
        <Button variant="outline">Outline</Button>
        <Button variant="secondary">Secondary</Button>
        <Button variant="ghost">Ghost</Button>
        <Button variant="link">Link</Button>
      </div>
    );
    expect(container).toMatchSnapshot();
  });

  it('renders all button sizes', () => {
    const { container } = render(
      <div>
        <Button size="default">Default Size</Button>
        <Button size="sm">Small</Button>
        <Button size="lg">Large</Button>
        <Button size="icon">I</Button>
      </div>
    );
    expect(container).toMatchSnapshot();
  });

  it('renders disabled button', () => {
    const { container } = render(<Button disabled>Disabled</Button>);
    expect(container).toMatchSnapshot();
  });

  it('renders button with custom className', () => {
    const { container } = render(<Button className="custom-class">Custom</Button>);
    expect(container).toMatchSnapshot();
  });
});

// ============================================================================
// Badge Component Snapshots
// ============================================================================
describe('Badge Snapshots', () => {
  it('renders default badge', () => {
    const { container } = render(<Badge>Default</Badge>);
    expect(container).toMatchSnapshot();
  });

  it('renders all badge variants', () => {
    const { container } = render(
      <div>
        <Badge variant="default">Default</Badge>
        <Badge variant="secondary">Secondary</Badge>
        <Badge variant="destructive">Destructive</Badge>
        <Badge variant="outline">Outline</Badge>
        <Badge variant="hot">Hot</Badge>
        <Badge variant="warm">Warm</Badge>
        <Badge variant="cold">Cold</Badge>
        <Badge variant="success">Success</Badge>
      </div>
    );
    expect(container).toMatchSnapshot();
  });
});

// ============================================================================
// Input Component Snapshots
// ============================================================================
describe('Input Snapshots', () => {
  it('renders default input', () => {
    const { container } = render(<Input placeholder="Enter text..." />);
    expect(container).toMatchSnapshot();
  });

  it('renders different input types', () => {
    const { container } = render(
      <div>
        <Input type="text" placeholder="Text input" />
        <Input type="email" placeholder="Email input" />
        <Input type="password" placeholder="Password input" />
        <Input type="number" placeholder="Number input" />
        <Input type="search" placeholder="Search input" />
      </div>
    );
    expect(container).toMatchSnapshot();
  });

  it('renders disabled input', () => {
    const { container } = render(<Input disabled placeholder="Disabled" />);
    expect(container).toMatchSnapshot();
  });

  it('renders input with value', () => {
    const { container } = render(<Input defaultValue="Prefilled value" />);
    expect(container).toMatchSnapshot();
  });
});

// ============================================================================
// Textarea Component Snapshots
// ============================================================================
describe('Textarea Snapshots', () => {
  it('renders default textarea', () => {
    const { container } = render(<Textarea placeholder="Enter text..." />);
    expect(container).toMatchSnapshot();
  });

  it('renders textarea with rows', () => {
    const { container } = render(<Textarea rows={5} placeholder="5 rows" />);
    expect(container).toMatchSnapshot();
  });

  it('renders disabled textarea', () => {
    const { container } = render(<Textarea disabled placeholder="Disabled" />);
    expect(container).toMatchSnapshot();
  });
});

// ============================================================================
// Label Component Snapshots
// ============================================================================
describe('Label Snapshots', () => {
  it('renders label', () => {
    const { container } = render(<Label htmlFor="test">Test Label</Label>);
    expect(container).toMatchSnapshot();
  });

  it('renders label with input', () => {
    const { container } = render(
      <div>
        <Label htmlFor="email">Email</Label>
        <Input id="email" type="email" placeholder="Enter email" />
      </div>
    );
    expect(container).toMatchSnapshot();
  });
});

// ============================================================================
// Card Component Snapshots
// ============================================================================
describe('Card Snapshots', () => {
  it('renders basic card', () => {
    const { container } = render(
      <Card>
        <CardContent>Basic card content</CardContent>
      </Card>
    );
    expect(container).toMatchSnapshot();
  });

  it('renders full card with all sections', () => {
    const { container } = render(
      <Card>
        <CardHeader>
          <CardTitle>Card Title</CardTitle>
          <CardDescription>Card description text</CardDescription>
        </CardHeader>
        <CardContent>
          <p>Card content goes here</p>
        </CardContent>
        <CardFooter>
          <Button>Action</Button>
        </CardFooter>
      </Card>
    );
    expect(container).toMatchSnapshot();
  });

  it('renders card with custom className', () => {
    const { container } = render(
      <Card className="custom-card-class">
        <CardContent>Custom styled card</CardContent>
      </Card>
    );
    expect(container).toMatchSnapshot();
  });
});

// ============================================================================
// Alert Component Snapshots
// ============================================================================
describe('Alert Snapshots', () => {
  it('renders default alert', () => {
    const { container } = render(
      <Alert>
        <AlertTitle>Default Alert</AlertTitle>
        <AlertDescription>This is a default alert message.</AlertDescription>
      </Alert>
    );
    expect(container).toMatchSnapshot();
  });

  it('renders destructive alert', () => {
    const { container } = render(
      <Alert variant="destructive">
        <AlertTitle>Error</AlertTitle>
        <AlertDescription>Something went wrong!</AlertDescription>
      </Alert>
    );
    expect(container).toMatchSnapshot();
  });

  it('renders alert with only description', () => {
    const { container } = render(
      <Alert>
        <AlertDescription>Simple alert message</AlertDescription>
      </Alert>
    );
    expect(container).toMatchSnapshot();
  });
});

// ============================================================================
// Skeleton Component Snapshots
// ============================================================================
describe('Skeleton Snapshots', () => {
  it('renders default skeleton', () => {
    const { container } = render(<Skeleton className="h-4 w-[250px]" />);
    expect(container).toMatchSnapshot();
  });

  it('renders skeleton card', () => {
    const { container } = render(
      <div className="flex flex-col space-y-3">
        <Skeleton className="h-[125px] w-[250px] rounded-xl" />
        <div className="space-y-2">
          <Skeleton className="h-4 w-[250px]" />
          <Skeleton className="h-4 w-[200px]" />
        </div>
      </div>
    );
    expect(container).toMatchSnapshot();
  });

  it('renders skeleton avatar', () => {
    const { container } = render(<Skeleton className="h-12 w-12 rounded-full" />);
    expect(container).toMatchSnapshot();
  });
});

// ============================================================================
// Separator Component Snapshots
// ============================================================================
describe('Separator Snapshots', () => {
  it('renders horizontal separator', () => {
    const { container } = render(<Separator />);
    expect(container).toMatchSnapshot();
  });

  it('renders vertical separator', () => {
    const { container } = render(
      <div className="h-20">
        <Separator orientation="vertical" />
      </div>
    );
    expect(container).toMatchSnapshot();
  });
});

// ============================================================================
// Progress Component Snapshots
// ============================================================================
describe('Progress Snapshots', () => {
  it('renders progress at 0%', () => {
    const { container } = render(<Progress value={0} />);
    expect(container).toMatchSnapshot();
  });

  it('renders progress at 50%', () => {
    const { container } = render(<Progress value={50} />);
    expect(container).toMatchSnapshot();
  });

  it('renders progress at 100%', () => {
    const { container } = render(<Progress value={100} />);
    expect(container).toMatchSnapshot();
  });
});

// ============================================================================
// Avatar Component Snapshots
// ============================================================================
describe('Avatar Snapshots', () => {
  it('renders avatar with fallback', () => {
    const { container } = render(
      <Avatar>
        <AvatarFallback>JD</AvatarFallback>
      </Avatar>
    );
    expect(container).toMatchSnapshot();
  });

  it('renders avatar with image', () => {
    const { container } = render(
      <Avatar>
        <AvatarImage src="https://example.com/avatar.jpg" alt="User" />
        <AvatarFallback>JD</AvatarFallback>
      </Avatar>
    );
    expect(container).toMatchSnapshot();
  });
});

// ============================================================================
// Checkbox Component Snapshots
// ============================================================================
describe('Checkbox Snapshots', () => {
  it('renders unchecked checkbox', () => {
    const { container } = render(<Checkbox />);
    expect(container).toMatchSnapshot();
  });

  it('renders checked checkbox', () => {
    const { container } = render(<Checkbox defaultChecked />);
    expect(container).toMatchSnapshot();
  });

  it('renders disabled checkbox', () => {
    const { container } = render(<Checkbox disabled />);
    expect(container).toMatchSnapshot();
  });

  it('renders checkbox with label', () => {
    const { container } = render(
      <div className="flex items-center space-x-2">
        <Checkbox id="terms" />
        <Label htmlFor="terms">Accept terms and conditions</Label>
      </div>
    );
    expect(container).toMatchSnapshot();
  });
});

// ============================================================================
// Switch Component Snapshots
// ============================================================================
describe('Switch Snapshots', () => {
  it('renders unchecked switch', () => {
    const { container } = render(<Switch />);
    expect(container).toMatchSnapshot();
  });

  it('renders checked switch', () => {
    const { container } = render(<Switch defaultChecked />);
    expect(container).toMatchSnapshot();
  });

  it('renders disabled switch', () => {
    const { container } = render(<Switch disabled />);
    expect(container).toMatchSnapshot();
  });

  it('renders switch with label', () => {
    const { container } = render(
      <div className="flex items-center space-x-2">
        <Switch id="airplane-mode" />
        <Label htmlFor="airplane-mode">Airplane Mode</Label>
      </div>
    );
    expect(container).toMatchSnapshot();
  });
});
