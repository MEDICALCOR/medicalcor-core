import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Input } from '@/components/ui/input';

describe('Input', () => {
  it('should render input element', () => {
    render(<Input placeholder="Enter text" />);
    const input = screen.getByPlaceholderText('Enter text');

    expect(input).toBeInTheDocument();
    expect(input.tagName).toBe('INPUT');
  });

  it('should render with default type text', () => {
    render(<Input placeholder="test" />);
    const input = screen.getByPlaceholderText('test');

    expect(input).toHaveAttribute('type', 'text');
  });

  it('should render with custom type', () => {
    render(<Input type="email" placeholder="test" />);
    const input = screen.getByPlaceholderText('test');

    expect(input).toHaveAttribute('type', 'email');
  });

  it('should accept text input', async () => {
    const user = userEvent.setup();
    render(<Input placeholder="test" />);
    const input = screen.getByPlaceholderText('test') as HTMLInputElement;

    await user.type(input, 'Hello World');

    expect(input.value).toBe('Hello World');
  });

  it('should call onChange handler', async () => {
    const user = userEvent.setup();
    const handleChange = vi.fn();

    render(<Input placeholder="test" onChange={handleChange} />);
    const input = screen.getByPlaceholderText('test');

    await user.type(input, 'Hello');

    expect(handleChange).toHaveBeenCalledTimes(5); // Once per character
  });

  it('should be disabled when disabled prop is true', () => {
    render(<Input disabled placeholder="test" />);
    const input = screen.getByPlaceholderText('test');

    expect(input).toBeDisabled();
  });

  it('should not accept input when disabled', async () => {
    const user = userEvent.setup();
    render(<Input disabled placeholder="test" />);
    const input = screen.getByPlaceholderText('test') as HTMLInputElement;

    await user.type(input, 'Hello');

    expect(input.value).toBe('');
  });

  it('should apply custom className', () => {
    render(<Input className="custom-class" placeholder="test" />);
    const input = screen.getByPlaceholderText('test');

    expect(input).toHaveClass('custom-class');
  });

  it('should forward ref correctly', () => {
    const ref = vi.fn();

    render(<Input ref={ref} placeholder="test" />);

    expect(ref).toHaveBeenCalled();
  });

  it('should support controlled input', async () => {
    const user = userEvent.setup();
    const handleChange = vi.fn();

    const { rerender } = render(<Input value="" onChange={handleChange} placeholder="test" />);
    const input = screen.getByPlaceholderText('test') as HTMLInputElement;

    expect(input.value).toBe('');

    await user.type(input, 'A');

    expect(handleChange).toHaveBeenCalled();

    rerender(<Input value="A" onChange={handleChange} placeholder="test" />);

    expect(input.value).toBe('A');
  });

  it('should support defaultValue for uncontrolled input', () => {
    render(<Input defaultValue="Initial value" placeholder="test" />);
    const input = screen.getByPlaceholderText('test') as HTMLInputElement;

    expect(input.value).toBe('Initial value');
  });

  it('should support required attribute', () => {
    render(<Input required placeholder="test" />);
    const input = screen.getByPlaceholderText('test');

    expect(input).toBeRequired();
  });

  it('should support maxLength attribute', () => {
    render(<Input maxLength={10} placeholder="test" />);
    const input = screen.getByPlaceholderText('test');

    expect(input).toHaveAttribute('maxLength', '10');
  });

  it('should support pattern attribute', () => {
    render(<Input pattern="[0-9]*" placeholder="test" />);
    const input = screen.getByPlaceholderText('test');

    expect(input).toHaveAttribute('pattern', '[0-9]*');
  });

  it('should support readOnly attribute', () => {
    render(<Input readOnly value="Read only text" placeholder="test" />);
    const input = screen.getByPlaceholderText('test');

    expect(input).toHaveAttribute('readOnly');
  });

  it('should support autoComplete attribute', () => {
    render(<Input autoComplete="email" placeholder="test" />);
    const input = screen.getByPlaceholderText('test');

    expect(input).toHaveAttribute('autoComplete', 'email');
  });

  it('should support autoFocus attribute', () => {
    render(<Input autoFocus placeholder="test" />);
    const input = screen.getByPlaceholderText('test');

    expect(input).toHaveFocus();
  });

  it('should support name attribute', () => {
    render(<Input name="username" placeholder="test" />);
    const input = screen.getByPlaceholderText('test');

    expect(input).toHaveAttribute('name', 'username');
  });

  it('should support id attribute', () => {
    render(<Input id="email-input" placeholder="test" />);
    const input = screen.getByPlaceholderText('test');

    expect(input).toHaveAttribute('id', 'email-input');
  });

  it('should support aria-label attribute', () => {
    render(<Input aria-label="Email address" placeholder="test" />);
    const input = screen.getByPlaceholderText('test');

    expect(input).toHaveAttribute('aria-label', 'Email address');
  });

  it('should support aria-describedby attribute', () => {
    render(<Input aria-describedby="email-hint" placeholder="test" />);
    const input = screen.getByPlaceholderText('test');

    expect(input).toHaveAttribute('aria-describedby', 'email-hint');
  });

  it('should support aria-invalid attribute', () => {
    render(<Input aria-invalid="true" placeholder="test" />);
    const input = screen.getByPlaceholderText('test');

    expect(input).toHaveAttribute('aria-invalid', 'true');
  });

  it('should handle number input type', async () => {
    const user = userEvent.setup();
    render(<Input type="number" placeholder="test" />);
    const input = screen.getByPlaceholderText('test') as HTMLInputElement;

    await user.type(input, '123');

    expect(input.value).toBe('123');
  });

  it('should handle password input type', async () => {
    const user = userEvent.setup();
    render(<Input type="password" placeholder="test" />);
    const input = screen.getByPlaceholderText('test') as HTMLInputElement;

    await user.type(input, 'secret');

    expect(input.value).toBe('secret');
    expect(input).toHaveAttribute('type', 'password');
  });

  it('should handle file input type', () => {
    render(<Input type="file" />);
    const input = document.querySelector('input[type="file"]');

    expect(input).toBeInTheDocument();
  });

  it('should handle blur event', async () => {
    const user = userEvent.setup();
    const handleBlur = vi.fn();

    render(<Input onBlur={handleBlur} placeholder="test" />);
    const input = screen.getByPlaceholderText('test');

    await user.click(input);
    await user.tab();

    expect(handleBlur).toHaveBeenCalled();
  });

  it('should handle focus event', async () => {
    const user = userEvent.setup();
    const handleFocus = vi.fn();

    render(<Input onFocus={handleFocus} placeholder="test" />);
    const input = screen.getByPlaceholderText('test');

    await user.click(input);

    expect(handleFocus).toHaveBeenCalled();
  });

  it('should handle keyDown event', async () => {
    const user = userEvent.setup();
    const handleKeyDown = vi.fn();

    render(<Input onKeyDown={handleKeyDown} placeholder="test" />);
    const input = screen.getByPlaceholderText('test');

    await user.type(input, 'a');

    expect(handleKeyDown).toHaveBeenCalled();
  });

  it('should handle min and max for number input', () => {
    render(<Input type="number" min={0} max={100} placeholder="test" />);
    const input = screen.getByPlaceholderText('test');

    expect(input).toHaveAttribute('min', '0');
    expect(input).toHaveAttribute('max', '100');
  });

  it('should handle step for number input', () => {
    render(<Input type="number" step={0.1} placeholder="test" />);
    const input = screen.getByPlaceholderText('test');

    expect(input).toHaveAttribute('step', '0.1');
  });
});
