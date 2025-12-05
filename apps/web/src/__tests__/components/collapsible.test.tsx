import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible';

describe('Collapsible', () => {
  it('should render trigger and content', () => {
    render(
      <Collapsible>
        <CollapsibleTrigger>Toggle Content</CollapsibleTrigger>
        <CollapsibleContent>Hidden Content</CollapsibleContent>
      </Collapsible>
    );

    expect(screen.getByText('Toggle Content')).toBeInTheDocument();
  });

  it('should start collapsed by default', () => {
    render(
      <Collapsible>
        <CollapsibleTrigger>Toggle</CollapsibleTrigger>
        <CollapsibleContent>Content</CollapsibleContent>
      </Collapsible>
    );

    const trigger = screen.getByText('Toggle');
    expect(trigger).toHaveAttribute('data-state', 'closed');
  });

  it('should expand content when trigger is clicked', async () => {
    const user = userEvent.setup();

    render(
      <Collapsible>
        <CollapsibleTrigger>Toggle</CollapsibleTrigger>
        <CollapsibleContent>Content to show</CollapsibleContent>
      </Collapsible>
    );

    await user.click(screen.getByText('Toggle'));

    await waitFor(() => {
      const trigger = screen.getByText('Toggle');
      expect(trigger).toHaveAttribute('data-state', 'open');
    });
  });

  it('should collapse content when trigger is clicked again', async () => {
    const user = userEvent.setup();

    render(
      <Collapsible>
        <CollapsibleTrigger>Toggle</CollapsibleTrigger>
        <CollapsibleContent>Content</CollapsibleContent>
      </Collapsible>
    );

    const trigger = screen.getByText('Toggle');

    // Open
    await user.click(trigger);
    await waitFor(() => {
      expect(trigger).toHaveAttribute('data-state', 'open');
    });

    // Close
    await user.click(trigger);
    await waitFor(() => {
      expect(trigger).toHaveAttribute('data-state', 'closed');
    });
  });

  it('should support controlled open state', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();

    const { rerender } = render(
      <Collapsible open={false} onOpenChange={onOpenChange}>
        <CollapsibleTrigger>Toggle</CollapsibleTrigger>
        <CollapsibleContent>Content</CollapsibleContent>
      </Collapsible>
    );

    const trigger = screen.getByText('Toggle');
    expect(trigger).toHaveAttribute('data-state', 'closed');

    await user.click(trigger);
    expect(onOpenChange).toHaveBeenCalledWith(true);

    rerender(
      <Collapsible open={true} onOpenChange={onOpenChange}>
        <CollapsibleTrigger>Toggle</CollapsibleTrigger>
        <CollapsibleContent>Content</CollapsibleContent>
      </Collapsible>
    );

    await waitFor(() => {
      expect(trigger).toHaveAttribute('data-state', 'open');
    });
  });

  it('should support defaultOpen prop', () => {
    render(
      <Collapsible defaultOpen>
        <CollapsibleTrigger>Toggle</CollapsibleTrigger>
        <CollapsibleContent>Content</CollapsibleContent>
      </Collapsible>
    );

    const trigger = screen.getByText('Toggle');
    expect(trigger).toHaveAttribute('data-state', 'open');
  });

  it('should have proper ARIA attributes when closed', () => {
    render(
      <Collapsible>
        <CollapsibleTrigger>Toggle</CollapsibleTrigger>
        <CollapsibleContent>Content</CollapsibleContent>
      </Collapsible>
    );

    const trigger = screen.getByText('Toggle');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(trigger).toHaveAttribute('aria-controls');
  });

  it('should have proper ARIA attributes when open', async () => {
    const user = userEvent.setup();

    render(
      <Collapsible>
        <CollapsibleTrigger>Toggle</CollapsibleTrigger>
        <CollapsibleContent>Content</CollapsibleContent>
      </Collapsible>
    );

    const trigger = screen.getByText('Toggle');
    await user.click(trigger);

    await waitFor(() => {
      expect(trigger).toHaveAttribute('aria-expanded', 'true');
    });
  });

  it('should support disabled state', async () => {
    const user = userEvent.setup();

    render(
      <Collapsible disabled>
        <CollapsibleTrigger>Toggle</CollapsibleTrigger>
        <CollapsibleContent>Content</CollapsibleContent>
      </Collapsible>
    );

    const trigger = screen.getByText('Toggle');
    await user.click(trigger);

    // Should remain closed
    expect(trigger).toHaveAttribute('data-state', 'closed');
  });

  it('should allow custom className on trigger', () => {
    render(
      <Collapsible>
        <CollapsibleTrigger className="custom-trigger">Toggle</CollapsibleTrigger>
        <CollapsibleContent>Content</CollapsibleContent>
      </Collapsible>
    );

    const trigger = screen.getByText('Toggle');
    expect(trigger).toHaveClass('custom-trigger');
  });

  it('should allow custom className on content', () => {
    render(
      <Collapsible defaultOpen>
        <CollapsibleTrigger>Toggle</CollapsibleTrigger>
        <CollapsibleContent className="custom-content">Content</CollapsibleContent>
      </Collapsible>
    );

    const content = screen.getByText('Content');
    expect(content).toHaveClass('custom-content');
  });

  it('should handle multiple collapsible components independently', async () => {
    const user = userEvent.setup();

    render(
      <>
        <Collapsible>
          <CollapsibleTrigger>Toggle 1</CollapsibleTrigger>
          <CollapsibleContent>Content 1</CollapsibleContent>
        </Collapsible>
        <Collapsible>
          <CollapsibleTrigger>Toggle 2</CollapsibleTrigger>
          <CollapsibleContent>Content 2</CollapsibleContent>
        </Collapsible>
      </>
    );

    const trigger1 = screen.getByText('Toggle 1');
    const trigger2 = screen.getByText('Toggle 2');

    await user.click(trigger1);

    await waitFor(() => {
      expect(trigger1).toHaveAttribute('data-state', 'open');
      expect(trigger2).toHaveAttribute('data-state', 'closed');
    });
  });

  it('should render complex content in CollapsibleContent', async () => {
    const user = userEvent.setup();

    render(
      <Collapsible>
        <CollapsibleTrigger>Show Details</CollapsibleTrigger>
        <CollapsibleContent>
          <div>
            <h3>Title</h3>
            <p>Description text</p>
            <button>Action</button>
          </div>
        </CollapsibleContent>
      </Collapsible>
    );

    await user.click(screen.getByText('Show Details'));

    await waitFor(() => {
      expect(screen.getByText('Title')).toBeInTheDocument();
      expect(screen.getByText('Description text')).toBeInTheDocument();
      expect(screen.getByText('Action')).toBeInTheDocument();
    });
  });

  it('should support keyboard interaction', async () => {
    const user = userEvent.setup();

    render(
      <Collapsible>
        <CollapsibleTrigger>Toggle</CollapsibleTrigger>
        <CollapsibleContent>Content</CollapsibleContent>
      </Collapsible>
    );

    const trigger = screen.getByText('Toggle');
    trigger.focus();

    await user.keyboard('{Enter}');

    await waitFor(() => {
      expect(trigger).toHaveAttribute('data-state', 'open');
    });
  });

  it('should support asChild prop on trigger', () => {
    render(
      <Collapsible>
        <CollapsibleTrigger asChild>
          <button type="button">Custom Button</button>
        </CollapsibleTrigger>
        <CollapsibleContent>Content</CollapsibleContent>
      </Collapsible>
    );

    const trigger = screen.getByText('Custom Button');
    expect(trigger.tagName).toBe('BUTTON');
    expect(trigger).toHaveAttribute('type', 'button');
  });
});
