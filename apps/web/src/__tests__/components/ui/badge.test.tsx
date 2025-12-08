// @ts-nocheck
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Badge } from '@/components/ui/badge';

describe('Badge', () => {
  it('should render badge with text', () => {
    render(<Badge>Test Badge</Badge>);
    const badge = screen.getByText('Test Badge');

    expect(badge).toBeInTheDocument();
  });

  it('should render with default variant', () => {
    render(<Badge>Default</Badge>);
    const badge = screen.getByText('Default');

    expect(badge).toBeInTheDocument();
    expect(badge).toHaveClass('bg-primary');
  });

  it('should render with secondary variant', () => {
    render(<Badge variant="secondary">Secondary</Badge>);
    const badge = screen.getByText('Secondary');

    expect(badge).toHaveClass('bg-secondary');
  });

  it('should render with destructive variant', () => {
    render(<Badge variant="destructive">Destructive</Badge>);
    const badge = screen.getByText('Destructive');

    expect(badge).toHaveClass('bg-destructive');
  });

  it('should render with outline variant', () => {
    render(<Badge variant="outline">Outline</Badge>);
    const badge = screen.getByText('Outline');

    expect(badge).toHaveClass('text-foreground');
  });

  it('should render with hot variant', () => {
    render(<Badge variant="hot">HOT</Badge>);
    const badge = screen.getByText('HOT');

    expect(badge).toHaveClass('bg-red-100');
    expect(badge).toHaveClass('text-red-800');
  });

  it('should render with warm variant', () => {
    render(<Badge variant="warm">WARM</Badge>);
    const badge = screen.getByText('WARM');

    expect(badge).toHaveClass('bg-amber-100');
    expect(badge).toHaveClass('text-amber-800');
  });

  it('should render with cold variant', () => {
    render(<Badge variant="cold">COLD</Badge>);
    const badge = screen.getByText('COLD');

    expect(badge).toHaveClass('bg-blue-100');
    expect(badge).toHaveClass('text-blue-800');
  });

  it('should render with success variant', () => {
    render(<Badge variant="success">Success</Badge>);
    const badge = screen.getByText('Success');

    expect(badge).toHaveClass('bg-emerald-100');
    expect(badge).toHaveClass('text-emerald-800');
  });

  it('should apply custom className', () => {
    render(<Badge className="custom-class">Custom</Badge>);
    const badge = screen.getByText('Custom');

    expect(badge).toHaveClass('custom-class');
  });

  it('should merge custom className with variant classes', () => {
    render(
      <Badge variant="hot" className="custom-class">
        Test
      </Badge>
    );
    const badge = screen.getByText('Test');

    expect(badge).toHaveClass('custom-class');
    expect(badge).toHaveClass('bg-red-100');
  });

  it('should render as div element', () => {
    render(<Badge>Test</Badge>);
    const badge = screen.getByText('Test');

    expect(badge.tagName).toBe('DIV');
  });

  it('should support onClick handler', () => {
    const handleClick = vi.fn();
    render(<Badge onClick={handleClick}>Clickable</Badge>);
    const badge = screen.getByText('Clickable');

    badge.click();

    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('should support additional HTML attributes', () => {
    render(
      <Badge data-testid="custom-badge" aria-label="Status badge">
        Test
      </Badge>
    );
    const badge = screen.getByTestId('custom-badge');

    expect(badge).toBeInTheDocument();
    expect(badge).toHaveAttribute('aria-label', 'Status badge');
  });

  it('should render with children', () => {
    render(
      <Badge>
        <span>Icon</span>
        <span>Text</span>
      </Badge>
    );

    expect(screen.getByText('Icon')).toBeInTheDocument();
    expect(screen.getByText('Text')).toBeInTheDocument();
  });

  it('should have proper styling classes', () => {
    render(<Badge>Styled</Badge>);
    const badge = screen.getByText('Styled');

    expect(badge).toHaveClass('inline-flex');
    expect(badge).toHaveClass('items-center');
    expect(badge).toHaveClass('rounded-full');
    expect(badge).toHaveClass('border');
    expect(badge).toHaveClass('px-2.5');
    expect(badge).toHaveClass('py-0.5');
    expect(badge).toHaveClass('text-xs');
    expect(badge).toHaveClass('font-semibold');
  });

  it('should handle empty content', () => {
    const { container } = render(<Badge />);
    const badge = container.querySelector('div');

    expect(badge).toBeInTheDocument();
  });

  it('should support title attribute', () => {
    render(<Badge title="Badge tooltip">Test</Badge>);
    const badge = screen.getByText('Test');

    expect(badge).toHaveAttribute('title', 'Badge tooltip');
  });

  it('should support id attribute', () => {
    render(<Badge id="status-badge">Status</Badge>);
    const badge = screen.getByText('Status');

    expect(badge).toHaveAttribute('id', 'status-badge');
  });

  it('should support role attribute', () => {
    render(<Badge role="status">Status</Badge>);
    const badge = screen.getByText('Status');

    expect(badge).toHaveAttribute('role', 'status');
  });

  it('should render with numeric content', () => {
    render(<Badge>{5}</Badge>);
    const badge = screen.getByText('5');

    expect(badge).toBeInTheDocument();
  });

  it('should handle long text content', () => {
    const longText = 'This is a very long badge text that might wrap';
    render(<Badge>{longText}</Badge>);
    const badge = screen.getByText(longText);

    expect(badge).toBeInTheDocument();
  });

  it('should apply hover styles', () => {
    render(<Badge variant="default">Hover</Badge>);
    const badge = screen.getByText('Hover');

    expect(badge).toHaveClass('hover:bg-primary/80');
  });

  it('should apply focus styles', () => {
    render(<Badge>Focus</Badge>);
    const badge = screen.getByText('Focus');

    expect(badge).toHaveClass('focus:outline-none');
    expect(badge).toHaveClass('focus:ring-2');
    expect(badge).toHaveClass('focus:ring-ring');
  });
});
