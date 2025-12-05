import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SubmitButton, useIsFormPending } from '@/components/ui/submit-button';

// Mock useFormStatus from react-dom
vi.mock('react-dom', () => ({
  useFormStatus: vi.fn(() => ({ pending: false })),
}));

describe('SubmitButton', () => {
  it('should render button with children', () => {
    render(
      <form>
        <SubmitButton>Submit</SubmitButton>
      </form>
    );

    expect(screen.getByRole('button', { name: 'Submit' })).toBeInTheDocument();
  });

  it('should have type="submit"', () => {
    render(
      <form>
        <SubmitButton>Submit</SubmitButton>
      </form>
    );

    const button = screen.getByRole('button');
    expect(button).toHaveAttribute('type', 'submit');
  });

  it('should not be disabled when form is not pending', () => {
    const { useFormStatus } = require('react-dom');
    useFormStatus.mockReturnValue({ pending: false });

    render(
      <form>
        <SubmitButton>Submit</SubmitButton>
      </form>
    );

    const button = screen.getByRole('button');
    expect(button).not.toBeDisabled();
  });

  it('should be disabled when form is pending', () => {
    const { useFormStatus } = require('react-dom');
    useFormStatus.mockReturnValue({ pending: true });

    render(
      <form>
        <SubmitButton>Submit</SubmitButton>
      </form>
    );

    const button = screen.getByRole('button');
    expect(button).toBeDisabled();
  });

  it('should show pending text when form is pending', () => {
    const { useFormStatus } = require('react-dom');
    useFormStatus.mockReturnValue({ pending: true });

    render(
      <form>
        <SubmitButton pendingText="Submitting...">Submit</SubmitButton>
      </form>
    );

    expect(screen.getByText('Submitting...')).toBeInTheDocument();
  });

  it('should show pending icon when form is pending', () => {
    const { useFormStatus } = require('react-dom');
    useFormStatus.mockReturnValue({ pending: true });

    render(
      <form>
        <SubmitButton pendingText="Loading...">Submit</SubmitButton>
      </form>
    );

    // Check for the Loader2 icon (it should have animate-spin class)
    const button = screen.getByRole('button');
    expect(button.querySelector('.animate-spin')).toBeInTheDocument();
  });

  it('should use children as pending text if pendingText is not provided', () => {
    const { useFormStatus } = require('react-dom');
    useFormStatus.mockReturnValue({ pending: true });

    render(
      <form>
        <SubmitButton>Submit</SubmitButton>
      </form>
    );

    expect(screen.getByText('Submit')).toBeInTheDocument();
  });

  it('should support custom pending icon', () => {
    const { useFormStatus } = require('react-dom');
    useFormStatus.mockReturnValue({ pending: true });

    const CustomIcon = () => <span data-testid="custom-icon">*</span>;

    render(
      <form>
        <SubmitButton pendingIcon={<CustomIcon />} pendingText="Loading">
          Submit
        </SubmitButton>
      </form>
    );

    expect(screen.getByTestId('custom-icon')).toBeInTheDocument();
  });

  it('should be disabled when disabled prop is true', () => {
    const { useFormStatus } = require('react-dom');
    useFormStatus.mockReturnValue({ pending: false });

    render(
      <form>
        <SubmitButton disabled>Submit</SubmitButton>
      </form>
    );

    const button = screen.getByRole('button');
    expect(button).toBeDisabled();
  });

  it('should be disabled when either pending or disabled', () => {
    const { useFormStatus } = require('react-dom');
    useFormStatus.mockReturnValue({ pending: true });

    render(
      <form>
        <SubmitButton disabled>Submit</SubmitButton>
      </form>
    );

    const button = screen.getByRole('button');
    expect(button).toBeDisabled();
  });

  it('should apply custom className', () => {
    const { useFormStatus } = require('react-dom');
    useFormStatus.mockReturnValue({ pending: false });

    render(
      <form>
        <SubmitButton className="custom-class">Submit</SubmitButton>
      </form>
    );

    const button = screen.getByRole('button');
    expect(button).toHaveClass('custom-class');
  });

  it('should support button variants', () => {
    const { useFormStatus } = require('react-dom');
    useFormStatus.mockReturnValue({ pending: false });

    render(
      <form>
        <SubmitButton variant="destructive">Delete</SubmitButton>
      </form>
    );

    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument();
  });

  it('should support button sizes', () => {
    const { useFormStatus } = require('react-dom');
    useFormStatus.mockReturnValue({ pending: false });

    render(
      <form>
        <SubmitButton size="sm">Submit</SubmitButton>
      </form>
    );

    expect(screen.getByRole('button', { name: 'Submit' })).toBeInTheDocument();
  });

  it('should have proper aria-disabled attribute when pending', () => {
    const { useFormStatus } = require('react-dom');
    useFormStatus.mockReturnValue({ pending: true });

    render(
      <form>
        <SubmitButton>Submit</SubmitButton>
      </form>
    );

    const button = screen.getByRole('button');
    expect(button).toHaveAttribute('aria-disabled', 'true');
  });

  it('should have proper aria-disabled attribute when disabled', () => {
    const { useFormStatus } = require('react-dom');
    useFormStatus.mockReturnValue({ pending: false });

    render(
      <form>
        <SubmitButton disabled>Submit</SubmitButton>
      </form>
    );

    const button = screen.getByRole('button');
    expect(button).toHaveAttribute('aria-disabled', 'true');
  });

  it('should forward additional props to Button', () => {
    const { useFormStatus } = require('react-dom');
    useFormStatus.mockReturnValue({ pending: false });

    render(
      <form>
        <SubmitButton data-testid="submit-btn" aria-label="Submit form">
          Submit
        </SubmitButton>
      </form>
    );

    const button = screen.getByTestId('submit-btn');
    expect(button).toHaveAttribute('aria-label', 'Submit form');
  });
});

describe('useIsFormPending', () => {
  it('should return false when form is not pending', () => {
    const { useFormStatus } = require('react-dom');
    useFormStatus.mockReturnValue({ pending: false });

    function TestComponent() {
      const isPending = useIsFormPending();
      return <div>{isPending ? 'Pending' : 'Not Pending'}</div>;
    }

    render(<TestComponent />);

    expect(screen.getByText('Not Pending')).toBeInTheDocument();
  });

  it('should return true when form is pending', () => {
    const { useFormStatus } = require('react-dom');
    useFormStatus.mockReturnValue({ pending: true });

    function TestComponent() {
      const isPending = useIsFormPending();
      return <div>{isPending ? 'Pending' : 'Not Pending'}</div>;
    }

    render(<TestComponent />);

    expect(screen.getByText('Pending')).toBeInTheDocument();
  });
});
