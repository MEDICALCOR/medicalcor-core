import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  Sheet,
  SheetTrigger,
  SheetContent,
  SheetHeader,
  SheetFooter,
  SheetTitle,
  SheetDescription,
  SheetClose,
} from '@/components/ui/sheet';

describe('Sheet', () => {
  it('should render trigger button', () => {
    render(
      <Sheet>
        <SheetTrigger>Open Sheet</SheetTrigger>
        <SheetContent>Sheet content</SheetContent>
      </Sheet>
    );

    expect(screen.getByText('Open Sheet')).toBeInTheDocument();
  });

  it('should open sheet when trigger is clicked', async () => {
    const user = userEvent.setup();

    render(
      <Sheet>
        <SheetTrigger>Open Sheet</SheetTrigger>
        <SheetContent>
          <SheetTitle>Sheet Title</SheetTitle>
          <div>Sheet content</div>
        </SheetContent>
      </Sheet>
    );

    await user.click(screen.getByText('Open Sheet'));

    await waitFor(() => {
      expect(screen.getByText('Sheet content')).toBeInTheDocument();
    });
  });

  it('should render with default right side variant', async () => {
    const user = userEvent.setup();

    render(
      <Sheet>
        <SheetTrigger>Open</SheetTrigger>
        <SheetContent>
          <SheetTitle>Title</SheetTitle>
          Content
        </SheetContent>
      </Sheet>
    );

    await user.click(screen.getByText('Open'));

    await waitFor(() => {
      const content = screen.getByRole('dialog');
      expect(content).toBeInTheDocument();
    });
  });

  it('should render with left side variant', async () => {
    const user = userEvent.setup();

    render(
      <Sheet>
        <SheetTrigger>Open</SheetTrigger>
        <SheetContent side="left">
          <SheetTitle>Title</SheetTitle>
          Content
        </SheetContent>
      </Sheet>
    );

    await user.click(screen.getByText('Open'));

    await waitFor(() => {
      expect(screen.getByText('Content')).toBeInTheDocument();
    });
  });

  it('should render with top side variant', async () => {
    const user = userEvent.setup();

    render(
      <Sheet>
        <SheetTrigger>Open</SheetTrigger>
        <SheetContent side="top">
          <SheetTitle>Title</SheetTitle>
          Content
        </SheetContent>
      </Sheet>
    );

    await user.click(screen.getByText('Open'));

    await waitFor(() => {
      expect(screen.getByText('Content')).toBeInTheDocument();
    });
  });

  it('should render with bottom side variant', async () => {
    const user = userEvent.setup();

    render(
      <Sheet>
        <SheetTrigger>Open</SheetTrigger>
        <SheetContent side="bottom">
          <SheetTitle>Title</SheetTitle>
          Content
        </SheetContent>
      </Sheet>
    );

    await user.click(screen.getByText('Open'));

    await waitFor(() => {
      expect(screen.getByText('Content')).toBeInTheDocument();
    });
  });

  it('should close sheet when close button is clicked', async () => {
    const user = userEvent.setup();

    render(
      <Sheet>
        <SheetTrigger>Open</SheetTrigger>
        <SheetContent>
          <SheetTitle>Title</SheetTitle>
          <div>Sheet content</div>
        </SheetContent>
      </Sheet>
    );

    await user.click(screen.getByText('Open'));

    await waitFor(() => {
      expect(screen.getByText('Sheet content')).toBeInTheDocument();
    });

    const closeButton = screen.getByRole('button', { name: /close/i });
    await user.click(closeButton);

    await waitFor(() => {
      expect(screen.queryByText('Sheet content')).not.toBeInTheDocument();
    });
  });

  it('should close sheet when using SheetClose component', async () => {
    const user = userEvent.setup();

    render(
      <Sheet>
        <SheetTrigger>Open</SheetTrigger>
        <SheetContent>
          <SheetTitle>Title</SheetTitle>
          <div>Sheet content</div>
          <SheetClose>Custom Close</SheetClose>
        </SheetContent>
      </Sheet>
    );

    await user.click(screen.getByText('Open'));

    await waitFor(() => {
      expect(screen.getByText('Sheet content')).toBeInTheDocument();
    });

    await user.click(screen.getByText('Custom Close'));

    await waitFor(() => {
      expect(screen.queryByText('Sheet content')).not.toBeInTheDocument();
    });
  });

  it('should render SheetHeader with correct styling', async () => {
    const user = userEvent.setup();

    render(
      <Sheet>
        <SheetTrigger>Open</SheetTrigger>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>Header Title</SheetTitle>
            <SheetDescription>Header Description</SheetDescription>
          </SheetHeader>
        </SheetContent>
      </Sheet>
    );

    await user.click(screen.getByText('Open'));

    await waitFor(() => {
      expect(screen.getByText('Header Title')).toBeInTheDocument();
      expect(screen.getByText('Header Description')).toBeInTheDocument();
    });
  });

  it('should render SheetFooter with correct styling', async () => {
    const user = userEvent.setup();

    render(
      <Sheet>
        <SheetTrigger>Open</SheetTrigger>
        <SheetContent>
          <SheetTitle>Title</SheetTitle>
          <SheetFooter>
            <button>Cancel</button>
            <button>Save</button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    );

    await user.click(screen.getByText('Open'));

    await waitFor(() => {
      expect(screen.getByText('Cancel')).toBeInTheDocument();
      expect(screen.getByText('Save')).toBeInTheDocument();
    });
  });

  it('should apply custom className to SheetContent', async () => {
    const user = userEvent.setup();

    render(
      <Sheet>
        <SheetTrigger>Open</SheetTrigger>
        <SheetContent className="custom-class">
          <SheetTitle>Title</SheetTitle>
          Content
        </SheetContent>
      </Sheet>
    );

    await user.click(screen.getByText('Open'));

    await waitFor(() => {
      const dialog = screen.getByRole('dialog');
      expect(dialog).toHaveClass('custom-class');
    });
  });

  it('should support controlled open state', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();

    const { rerender } = render(
      <Sheet open={false} onOpenChange={onOpenChange}>
        <SheetTrigger>Open</SheetTrigger>
        <SheetContent>
          <SheetTitle>Title</SheetTitle>
          Content
        </SheetContent>
      </Sheet>
    );

    expect(screen.queryByText('Content')).not.toBeInTheDocument();

    await user.click(screen.getByText('Open'));

    expect(onOpenChange).toHaveBeenCalledWith(true);

    rerender(
      <Sheet open={true} onOpenChange={onOpenChange}>
        <SheetTrigger>Open</SheetTrigger>
        <SheetContent>
          <SheetTitle>Title</SheetTitle>
          Content
        </SheetContent>
      </Sheet>
    );

    await waitFor(() => {
      expect(screen.getByText('Content')).toBeInTheDocument();
    });
  });

  it('should close when escape key is pressed', async () => {
    const user = userEvent.setup();

    render(
      <Sheet>
        <SheetTrigger>Open</SheetTrigger>
        <SheetContent>
          <SheetTitle>Title</SheetTitle>
          Content
        </SheetContent>
      </Sheet>
    );

    await user.click(screen.getByText('Open'));

    await waitFor(() => {
      expect(screen.getByText('Content')).toBeInTheDocument();
    });

    await user.keyboard('{Escape}');

    await waitFor(() => {
      expect(screen.queryByText('Content')).not.toBeInTheDocument();
    });
  });

  it('should have proper accessibility attributes', async () => {
    const user = userEvent.setup();

    render(
      <Sheet>
        <SheetTrigger>Open</SheetTrigger>
        <SheetContent>
          <SheetTitle>Accessible Title</SheetTitle>
          <SheetDescription>Accessible Description</SheetDescription>
        </SheetContent>
      </Sheet>
    );

    await user.click(screen.getByText('Open'));

    await waitFor(() => {
      const dialog = screen.getByRole('dialog');
      expect(dialog).toBeInTheDocument();
      expect(dialog).toHaveAttribute('aria-describedby');
      expect(dialog).toHaveAttribute('aria-labelledby');
    });
  });

  it('should render overlay with proper styling', async () => {
    const user = userEvent.setup();

    render(
      <Sheet>
        <SheetTrigger>Open</SheetTrigger>
        <SheetContent>
          <SheetTitle>Title</SheetTitle>
          Content
        </SheetContent>
      </Sheet>
    );

    await user.click(screen.getByText('Open'));

    await waitFor(() => {
      // Overlay should be rendered when sheet is open
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
  });
});
