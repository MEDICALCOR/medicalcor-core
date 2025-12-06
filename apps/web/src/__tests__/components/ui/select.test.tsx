import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SelectGroup,
  SelectLabel,
  SelectSeparator,
} from '@/components/ui/select';

describe('Select', () => {
  const BasicSelect = ({ onValueChange }: { onValueChange?: (value: string) => void }) => (
    <Select onValueChange={onValueChange}>
      <SelectTrigger>
        <SelectValue placeholder="Select an option" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="option1">Option 1</SelectItem>
        <SelectItem value="option2">Option 2</SelectItem>
        <SelectItem value="option3">Option 3</SelectItem>
      </SelectContent>
    </Select>
  );

  it('should render select trigger', () => {
    render(<BasicSelect />);
    const trigger = screen.getByRole('combobox');

    expect(trigger).toBeInTheDocument();
  });

  it('should display placeholder', () => {
    render(<BasicSelect />);
    const placeholder = screen.getByText('Select an option');

    expect(placeholder).toBeInTheDocument();
  });

  it('should show chevron down icon', () => {
    const { container } = render(<BasicSelect />);
    const icon = container.querySelector('svg');

    expect(icon).toBeInTheDocument();
  });

  it('should open dropdown on click', async () => {
    const user = userEvent.setup();
    render(<BasicSelect />);
    const trigger = screen.getByRole('combobox');

    await user.click(trigger);

    expect(screen.getByText('Option 1')).toBeInTheDocument();
    expect(screen.getByText('Option 2')).toBeInTheDocument();
    expect(screen.getByText('Option 3')).toBeInTheDocument();
  });

  it('should select an option', async () => {
    const user = userEvent.setup();
    const handleChange = vi.fn();

    render(<BasicSelect onValueChange={handleChange} />);
    const trigger = screen.getByRole('combobox');

    await user.click(trigger);
    const option = screen.getByText('Option 2');
    await user.click(option);

    expect(handleChange).toHaveBeenCalledWith('option2');
  });

  it('should support disabled state', () => {
    render(
      <Select disabled>
        <SelectTrigger>
          <SelectValue placeholder="Disabled" />
        </SelectTrigger>
      </Select>
    );
    const trigger = screen.getByRole('combobox');

    expect(trigger).toBeDisabled();
  });

  it('should render with custom className on trigger', () => {
    render(
      <Select>
        <SelectTrigger className="custom-trigger">
          <SelectValue />
        </SelectTrigger>
      </Select>
    );
    const trigger = screen.getByRole('combobox');

    expect(trigger).toHaveClass('custom-trigger');
  });

  it('should render SelectGroup with label', async () => {
    const user = userEvent.setup();

    render(
      <Select>
        <SelectTrigger>
          <SelectValue placeholder="Select" />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectLabel>Group Label</SelectLabel>
            <SelectItem value="item1">Item 1</SelectItem>
          </SelectGroup>
        </SelectContent>
      </Select>
    );

    const trigger = screen.getByRole('combobox');
    await user.click(trigger);

    expect(screen.getByText('Group Label')).toBeInTheDocument();
  });

  it('should render SelectSeparator', async () => {
    const user = userEvent.setup();

    render(
      <Select>
        <SelectTrigger>
          <SelectValue placeholder="Select" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="item1">Item 1</SelectItem>
          <SelectSeparator />
          <SelectItem value="item2">Item 2</SelectItem>
        </SelectContent>
      </Select>
    );

    const trigger = screen.getByRole('combobox');
    await user.click(trigger);

    const separator = document.querySelector('[role="separator"]');
    expect(separator).toBeInTheDocument();
  });

  it('should support controlled value', () => {
    const { rerender } = render(
      <Select value="option1">
        <SelectTrigger>
          <SelectValue placeholder="Select" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="option1">Option 1</SelectItem>
          <SelectItem value="option2">Option 2</SelectItem>
        </SelectContent>
      </Select>
    );

    expect(screen.getByText('Option 1')).toBeInTheDocument();

    rerender(
      <Select value="option2">
        <SelectTrigger>
          <SelectValue placeholder="Select" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="option1">Option 1</SelectItem>
          <SelectItem value="option2">Option 2</SelectItem>
        </SelectContent>
      </Select>
    );

    expect(screen.getByText('Option 2')).toBeInTheDocument();
  });

  it('should support defaultValue', () => {
    render(
      <Select defaultValue="option2">
        <SelectTrigger>
          <SelectValue placeholder="Select" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="option1">Option 1</SelectItem>
          <SelectItem value="option2">Option 2</SelectItem>
        </SelectContent>
      </Select>
    );

    expect(screen.getByText('Option 2')).toBeInTheDocument();
  });

  it('should show check icon on selected item', async () => {
    const user = userEvent.setup();

    render(
      <Select defaultValue="option1">
        <SelectTrigger>
          <SelectValue placeholder="Select" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="option1">Option 1</SelectItem>
          <SelectItem value="option2">Option 2</SelectItem>
        </SelectContent>
      </Select>
    );

    const trigger = screen.getByRole('combobox');
    await user.click(trigger);

    const selectedOption = screen.getByText('Option 1').closest('[role="option"]');
    expect(selectedOption).toHaveAttribute('data-state', 'checked');
  });

  it('should support disabled items', async () => {
    const user = userEvent.setup();

    render(
      <Select>
        <SelectTrigger>
          <SelectValue placeholder="Select" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="option1">Option 1</SelectItem>
          <SelectItem value="option2" disabled>
            Option 2 (Disabled)
          </SelectItem>
        </SelectContent>
      </Select>
    );

    const trigger = screen.getByRole('combobox');
    await user.click(trigger);

    const disabledOption = screen.getByText('Option 2 (Disabled)').closest('[role="option"]');
    expect(disabledOption).toHaveAttribute('data-disabled', '');
  });

  it('should support keyboard navigation', async () => {
    const user = userEvent.setup();
    const handleChange = vi.fn();

    render(<BasicSelect onValueChange={handleChange} />);
    const trigger = screen.getByRole('combobox');

    trigger.focus();
    await user.keyboard('{Enter}');

    // Dropdown should be open
    expect(screen.getByText('Option 1')).toBeInTheDocument();

    await user.keyboard('{ArrowDown}');
    await user.keyboard('{Enter}');

    // First option should be selected
    expect(handleChange).toHaveBeenCalled();
  });

  it('should support required attribute', () => {
    render(
      <Select required>
        <SelectTrigger>
          <SelectValue placeholder="Select" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="option1">Option 1</SelectItem>
        </SelectContent>
      </Select>
    );

    const trigger = screen.getByRole('combobox');
    expect(trigger).toHaveAttribute('aria-required', 'true');
  });

  it('should support name attribute', () => {
    render(
      <Select name="test-select">
        <SelectTrigger>
          <SelectValue placeholder="Select" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="option1">Option 1</SelectItem>
        </SelectContent>
      </Select>
    );

    const trigger = screen.getByRole('combobox');
    expect(trigger).toHaveAttribute('name', 'test-select');
  });

  it('should close dropdown when option is selected', async () => {
    const user = userEvent.setup();

    render(<BasicSelect />);
    const trigger = screen.getByRole('combobox');

    await user.click(trigger);
    expect(screen.getByText('Option 1')).toBeInTheDocument();

    const option = screen.getByText('Option 1');
    await user.click(option);

    // Dropdown should close after selection
    expect(trigger).toHaveAttribute('data-state', 'closed');
  });

  it('should render scroll buttons when content is scrollable', async () => {
    const user = userEvent.setup();

    const LongSelect = () => (
      <Select>
        <SelectTrigger>
          <SelectValue placeholder="Select" />
        </SelectTrigger>
        <SelectContent>
          {Array.from({ length: 50 }, (_, i) => (
            <SelectItem key={i} value={`option${i}`}>
              Option {i}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );

    render(<LongSelect />);
    const trigger = screen.getByRole('combobox');

    await user.click(trigger);

    // Check for scroll buttons (ChevronUp and ChevronDown)
    const chevrons = document.querySelectorAll('svg');
    expect(chevrons.length).toBeGreaterThan(1); // Includes trigger chevron and scroll buttons
  });
});
