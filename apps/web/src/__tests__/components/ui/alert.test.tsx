import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { AlertCircle } from 'lucide-react';

describe('Alert', () => {
  it('should render alert', () => {
    render(<Alert>Alert content</Alert>);
    const alert = screen.getByRole('alert');

    expect(alert).toBeInTheDocument();
    expect(alert).toHaveTextContent('Alert content');
  });

  it('should render with default variant', () => {
    render(<Alert>Default alert</Alert>);
    const alert = screen.getByRole('alert');

    expect(alert).toHaveClass('bg-background');
    expect(alert).toHaveClass('text-foreground');
  });

  it('should render with destructive variant', () => {
    render(<Alert variant="destructive">Destructive alert</Alert>);
    const alert = screen.getByRole('alert');

    expect(alert).toHaveClass('border-destructive/50');
    expect(alert).toHaveClass('text-destructive');
  });

  it('should apply custom className', () => {
    render(<Alert className="custom-alert">Custom</Alert>);
    const alert = screen.getByRole('alert');

    expect(alert).toHaveClass('custom-alert');
  });

  it('should forward ref correctly', () => {
    const ref = vi.fn();

    render(<Alert ref={ref}>Test</Alert>);

    expect(ref).toHaveBeenCalled();
  });

  it('should render with icon', () => {
    const { container } = render(
      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Error</AlertTitle>
        <AlertDescription>Something went wrong</AlertDescription>
      </Alert>
    );

    const icon = container.querySelector('svg');
    expect(icon).toBeInTheDocument();
  });

  it('should render AlertTitle', () => {
    render(
      <Alert>
        <AlertTitle>Alert Title</AlertTitle>
      </Alert>
    );

    const title = screen.getByText('Alert Title');
    expect(title).toBeInTheDocument();
    expect(title.tagName).toBe('H5');
  });

  it('should render AlertDescription', () => {
    render(
      <Alert>
        <AlertDescription>This is a description</AlertDescription>
      </Alert>
    );

    const description = screen.getByText('This is a description');
    expect(description).toBeInTheDocument();
  });

  it('should render complete alert with title and description', () => {
    render(
      <Alert>
        <AlertTitle>Success</AlertTitle>
        <AlertDescription>Your changes have been saved</AlertDescription>
      </Alert>
    );

    expect(screen.getByText('Success')).toBeInTheDocument();
    expect(screen.getByText('Your changes have been saved')).toBeInTheDocument();
  });

  it('should apply title className', () => {
    render(<AlertTitle className="custom-title">Title</AlertTitle>);
    const title = screen.getByText('Title');

    expect(title).toHaveClass('custom-title');
  });

  it('should apply description className', () => {
    render(<AlertDescription className="custom-desc">Description</AlertDescription>);
    const description = screen.getByText('Description');

    expect(description).toHaveClass('custom-desc');
  });

  it('should have proper styling classes on alert', () => {
    render(<Alert>Test</Alert>);
    const alert = screen.getByRole('alert');

    expect(alert).toHaveClass('relative');
    expect(alert).toHaveClass('w-full');
    expect(alert).toHaveClass('rounded-lg');
    expect(alert).toHaveClass('border');
    expect(alert).toHaveClass('p-4');
  });

  it('should have proper styling classes on title', () => {
    render(<AlertTitle>Title</AlertTitle>);
    const title = screen.getByText('Title');

    expect(title).toHaveClass('mb-1');
    expect(title).toHaveClass('font-medium');
    expect(title).toHaveClass('leading-none');
    expect(title).toHaveClass('tracking-tight');
  });

  it('should have proper styling classes on description', () => {
    render(<AlertDescription>Description</AlertDescription>);
    const description = screen.getByText('Description');

    expect(description).toHaveClass('text-sm');
  });

  it('should support additional HTML attributes on Alert', () => {
    render(
      <Alert data-testid="custom-alert" id="alert-1">
        Test
      </Alert>
    );
    const alert = screen.getByTestId('custom-alert');

    expect(alert).toHaveAttribute('id', 'alert-1');
  });

  it('should support additional HTML attributes on AlertTitle', () => {
    render(
      <AlertTitle data-testid="custom-title" id="title-1">
        Title
      </AlertTitle>
    );
    const title = screen.getByTestId('custom-title');

    expect(title).toHaveAttribute('id', 'title-1');
  });

  it('should support additional HTML attributes on AlertDescription', () => {
    render(
      <AlertDescription data-testid="custom-desc" id="desc-1">
        Description
      </AlertDescription>
    );
    const description = screen.getByTestId('custom-desc');

    expect(description).toHaveAttribute('id', 'desc-1');
  });

  it('should render children in AlertDescription', () => {
    render(
      <AlertDescription>
        <p>Paragraph 1</p>
        <p>Paragraph 2</p>
      </AlertDescription>
    );

    expect(screen.getByText('Paragraph 1')).toBeInTheDocument();
    expect(screen.getByText('Paragraph 2')).toBeInTheDocument();
  });

  it('should render destructive alert with icon', () => {
    const { container } = render(
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Error</AlertTitle>
        <AlertDescription>An error occurred</AlertDescription>
      </Alert>
    );

    const alert = screen.getByRole('alert');
    const icon = container.querySelector('svg');

    expect(alert).toHaveClass('text-destructive');
    expect(icon).toBeInTheDocument();
  });

  it('should support onClick handler', () => {
    const handleClick = vi.fn();

    render(<Alert onClick={handleClick}>Clickable alert</Alert>);
    const alert = screen.getByRole('alert');

    alert.click();

    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('should forward ref on AlertTitle', () => {
    const ref = vi.fn();

    render(<AlertTitle ref={ref}>Title</AlertTitle>);

    expect(ref).toHaveBeenCalled();
  });

  it('should forward ref on AlertDescription', () => {
    const ref = vi.fn();

    render(<AlertDescription ref={ref}>Description</AlertDescription>);

    expect(ref).toHaveBeenCalled();
  });
});
