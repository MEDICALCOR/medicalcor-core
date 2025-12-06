import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Checkbox } from '@/components/ui/checkbox';

describe('Checkbox', () => {
  it('should render unchecked checkbox', () => {
    const { container } = render(<Checkbox />);
    const checkbox = container.querySelector('button[role="checkbox"]');

    expect(checkbox).toBeInTheDocument();
    expect(checkbox).toHaveAttribute('aria-checked', 'false');
  });

  it('should render checked checkbox', () => {
    const { container } = render(<Checkbox checked />);
    const checkbox = container.querySelector('button[role="checkbox"]');

    expect(checkbox).toHaveAttribute('aria-checked', 'true');
  });

  it('should toggle checkbox on click', async () => {
    const user = userEvent.setup();
    const handleChange = vi.fn();

    const { container } = render(<Checkbox onCheckedChange={handleChange} />);
    const checkbox = container.querySelector('button[role="checkbox"]');

    expect(checkbox).toHaveAttribute('aria-checked', 'false');

    if (checkbox) {
      await user.click(checkbox);
    }

    expect(handleChange).toHaveBeenCalledWith(true);
  });

  it('should be disabled when disabled prop is true', () => {
    const { container } = render(<Checkbox disabled />);
    const checkbox = container.querySelector('button[role="checkbox"]');

    expect(checkbox).toBeDisabled();
  });

  it('should not trigger onChange when disabled', async () => {
    const user = userEvent.setup();
    const handleChange = vi.fn();

    const { container } = render(<Checkbox disabled onCheckedChange={handleChange} />);
    const checkbox = container.querySelector('button[role="checkbox"]');

    if (checkbox) {
      await user.click(checkbox);
    }

    expect(handleChange).not.toHaveBeenCalled();
  });

  it('should apply custom className', () => {
    const { container } = render(<Checkbox className="custom-class" />);
    const checkbox = container.querySelector('button[role="checkbox"]');

    expect(checkbox).toHaveClass('custom-class');
  });

  it('should forward ref correctly', () => {
    const ref = vi.fn();

    render(<Checkbox ref={ref} />);

    expect(ref).toHaveBeenCalled();
  });

  it('should show check icon when checked', () => {
    const { container } = render(<Checkbox checked />);
    const svg = container.querySelector('svg');

    expect(svg).toBeInTheDocument();
  });

  it('should support indeterminate state', () => {
    const { container } = render(<Checkbox checked="indeterminate" />);
    const checkbox = container.querySelector('button[role="checkbox"]');

    expect(checkbox).toHaveAttribute('data-state', 'indeterminate');
  });

  it('should handle controlled component', async () => {
    const user = userEvent.setup();
    const handleChange = vi.fn();

    const { container, rerender } = render(
      <Checkbox checked={false} onCheckedChange={handleChange} />
    );
    const checkbox = container.querySelector('button[role="checkbox"]');

    expect(checkbox).toHaveAttribute('aria-checked', 'false');

    if (checkbox) {
      await user.click(checkbox);
    }

    expect(handleChange).toHaveBeenCalledWith(true);

    // Simulate parent updating the state
    rerender(<Checkbox checked={true} onCheckedChange={handleChange} />);

    expect(checkbox).toHaveAttribute('aria-checked', 'true');
  });

  it('should support keyboard interaction', async () => {
    const user = userEvent.setup();
    const handleChange = vi.fn();

    const { container } = render(<Checkbox onCheckedChange={handleChange} />);
    const checkbox = container.querySelector('button[role="checkbox"]');

    if (checkbox) {
      checkbox.focus();
      await user.keyboard(' ');
    }

    expect(handleChange).toHaveBeenCalled();
  });

  it('should support required attribute', () => {
    const { container } = render(<Checkbox required />);
    const checkbox = container.querySelector('button[role="checkbox"]');

    expect(checkbox).toHaveAttribute('aria-required', 'true');
  });

  it('should support name attribute', () => {
    const { container } = render(<Checkbox name="agreement" />);
    const checkbox = container.querySelector('button[role="checkbox"]');

    expect(checkbox).toHaveAttribute('name', 'agreement');
  });

  it('should support value attribute', () => {
    const { container } = render(<Checkbox value="yes" />);
    const checkbox = container.querySelector('button[role="checkbox"]');

    expect(checkbox).toHaveAttribute('value', 'yes');
  });

  it('should apply focus styles', async () => {
    const user = userEvent.setup();
    const { container } = render(<Checkbox />);
    const checkbox = container.querySelector('button[role="checkbox"]');

    if (checkbox) {
      await user.tab();
    }

    expect(checkbox).toHaveFocus();
  });

  it('should handle defaultChecked for uncontrolled component', () => {
    const { container } = render(<Checkbox defaultChecked />);
    const checkbox = container.querySelector('button[role="checkbox"]');

    expect(checkbox).toHaveAttribute('aria-checked', 'true');
  });
});
