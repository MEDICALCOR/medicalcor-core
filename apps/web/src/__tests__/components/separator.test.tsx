import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Separator } from '@/components/ui/separator';

describe('Separator', () => {
  it('should render separator element', () => {
    render(<Separator data-testid="separator" />);

    const separator = screen.getByTestId('separator');
    expect(separator).toBeInTheDocument();
  });

  it('should have horizontal orientation by default', () => {
    render(<Separator data-testid="separator" />);

    const separator = screen.getByTestId('separator');
    expect(separator).toHaveAttribute('data-orientation', 'horizontal');
  });

  it('should apply horizontal styling by default', () => {
    render(<Separator data-testid="separator" />);

    const separator = screen.getByTestId('separator');
    expect(separator.className).toContain('h-[1px]');
    expect(separator.className).toContain('w-full');
  });

  it('should support vertical orientation', () => {
    render(<Separator orientation="vertical" data-testid="separator" />);

    const separator = screen.getByTestId('separator');
    expect(separator).toHaveAttribute('data-orientation', 'vertical');
  });

  it('should apply vertical styling when orientation is vertical', () => {
    render(<Separator orientation="vertical" data-testid="separator" />);

    const separator = screen.getByTestId('separator');
    expect(separator.className).toContain('h-full');
    expect(separator.className).toContain('w-[1px]');
  });

  it('should be decorative by default', () => {
    render(<Separator data-testid="separator" />);

    const separator = screen.getByTestId('separator');
    expect(separator).toHaveAttribute('role', 'none');
  });

  it('should support non-decorative mode', () => {
    render(<Separator decorative={false} data-testid="separator" />);

    const separator = screen.getByTestId('separator');
    expect(separator).toHaveAttribute('role', 'separator');
  });

  it('should apply custom className', () => {
    render(<Separator className="custom-separator" data-testid="separator" />);

    const separator = screen.getByTestId('separator');
    expect(separator).toHaveClass('custom-separator');
  });

  it('should maintain base styling with custom className', () => {
    render(<Separator className="custom-separator" data-testid="separator" />);

    const separator = screen.getByTestId('separator');
    expect(separator).toHaveClass('custom-separator');
    expect(separator.className).toContain('bg-border');
    expect(separator.className).toContain('shrink-0');
  });

  it('should render in a layout correctly', () => {
    render(
      <div>
        <div>Section 1</div>
        <Separator data-testid="separator" />
        <div>Section 2</div>
      </div>
    );

    expect(screen.getByText('Section 1')).toBeInTheDocument();
    expect(screen.getByTestId('separator')).toBeInTheDocument();
    expect(screen.getByText('Section 2')).toBeInTheDocument();
  });

  it('should support aria-orientation for non-decorative separators', () => {
    render(<Separator decorative={false} orientation="vertical" data-testid="separator" />);

    const separator = screen.getByTestId('separator');
    expect(separator).toHaveAttribute('aria-orientation', 'vertical');
  });

  it('should apply base border styling', () => {
    render(<Separator data-testid="separator" />);

    const separator = screen.getByTestId('separator');
    expect(separator.className).toContain('bg-border');
  });

  it('should support ref forwarding', () => {
    const ref = { current: null };

    render(<Separator ref={ref as any} data-testid="separator" />);

    expect(ref.current).not.toBeNull();
  });

  it('should render multiple separators independently', () => {
    render(
      <div>
        <Separator data-testid="separator-1" />
        <Separator orientation="vertical" data-testid="separator-2" />
        <Separator className="custom" data-testid="separator-3" />
      </div>
    );

    expect(screen.getByTestId('separator-1')).toHaveAttribute('data-orientation', 'horizontal');
    expect(screen.getByTestId('separator-2')).toHaveAttribute('data-orientation', 'vertical');
    expect(screen.getByTestId('separator-3')).toHaveClass('custom');
  });

  it('should work in a menu context', () => {
    render(
      <div role="menu">
        <button role="menuitem">Item 1</button>
        <Separator data-testid="separator" />
        <button role="menuitem">Item 2</button>
      </div>
    );

    const separator = screen.getByTestId('separator');
    expect(separator).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Item 1' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Item 2' })).toBeInTheDocument();
  });

  it('should work in a toolbar context', () => {
    render(
      <div role="toolbar">
        <button>Button 1</button>
        <Separator orientation="vertical" data-testid="separator" />
        <button>Button 2</button>
      </div>
    );

    const separator = screen.getByTestId('separator');
    expect(separator).toHaveAttribute('data-orientation', 'vertical');
  });

  it('should accept additional HTML attributes', () => {
    render(<Separator data-testid="separator" id="my-separator" aria-label="Custom separator" />);

    const separator = screen.getByTestId('separator');
    expect(separator).toHaveAttribute('id', 'my-separator');
  });
});
