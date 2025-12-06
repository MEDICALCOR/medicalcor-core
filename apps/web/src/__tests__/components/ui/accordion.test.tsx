import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from '@/components/ui/accordion';

describe('Accordion', () => {
  const BasicAccordion = ({ onValueChange }: { onValueChange?: (value: string) => void }) => (
    <Accordion type="single" collapsible onValueChange={onValueChange}>
      <AccordionItem value="item-1">
        <AccordionTrigger>Section 1</AccordionTrigger>
        <AccordionContent>Content 1</AccordionContent>
      </AccordionItem>
      <AccordionItem value="item-2">
        <AccordionTrigger>Section 2</AccordionTrigger>
        <AccordionContent>Content 2</AccordionContent>
      </AccordionItem>
      <AccordionItem value="item-3">
        <AccordionTrigger>Section 3</AccordionTrigger>
        <AccordionContent>Content 3</AccordionContent>
      </AccordionItem>
    </Accordion>
  );

  it('should render accordion items', () => {
    render(<BasicAccordion />);

    expect(screen.getByText('Section 1')).toBeInTheDocument();
    expect(screen.getByText('Section 2')).toBeInTheDocument();
    expect(screen.getByText('Section 3')).toBeInTheDocument();
  });

  it('should show chevron icon', () => {
    const { container } = render(<BasicAccordion />);
    const icons = container.querySelectorAll('svg');

    // Should have one chevron per trigger
    expect(icons.length).toBeGreaterThanOrEqual(3);
  });

  it('should expand item on click', async () => {
    const user = userEvent.setup();
    render(<BasicAccordion />);

    const trigger = screen.getByText('Section 1');

    // Content should be hidden initially
    expect(screen.queryByText('Content 1')).not.toBeVisible();

    await user.click(trigger);

    // Content should be visible after click
    expect(screen.getByText('Content 1')).toBeVisible();
  });

  it('should collapse item on second click', async () => {
    const user = userEvent.setup();
    render(<BasicAccordion />);

    const trigger = screen.getByText('Section 1');

    await user.click(trigger);
    expect(screen.getByText('Content 1')).toBeVisible();

    await user.click(trigger);
    expect(screen.queryByText('Content 1')).not.toBeVisible();
  });

  it('should call onValueChange when item is expanded', async () => {
    const user = userEvent.setup();
    const handleChange = vi.fn();

    render(<BasicAccordion onValueChange={handleChange} />);

    const trigger = screen.getByText('Section 1');
    await user.click(trigger);

    expect(handleChange).toHaveBeenCalledWith('item-1');
  });

  it('should only allow one item open at a time in single mode', async () => {
    const user = userEvent.setup();
    render(<BasicAccordion />);

    const trigger1 = screen.getByText('Section 1');
    const trigger2 = screen.getByText('Section 2');

    await user.click(trigger1);
    expect(screen.getByText('Content 1')).toBeVisible();

    await user.click(trigger2);
    expect(screen.getByText('Content 2')).toBeVisible();
    expect(screen.queryByText('Content 1')).not.toBeVisible();
  });

  it('should allow multiple items open in multiple mode', async () => {
    const user = userEvent.setup();

    render(
      <Accordion type="multiple">
        <AccordionItem value="item-1">
          <AccordionTrigger>Section 1</AccordionTrigger>
          <AccordionContent>Content 1</AccordionContent>
        </AccordionItem>
        <AccordionItem value="item-2">
          <AccordionTrigger>Section 2</AccordionTrigger>
          <AccordionContent>Content 2</AccordionContent>
        </AccordionItem>
      </Accordion>
    );

    const trigger1 = screen.getByText('Section 1');
    const trigger2 = screen.getByText('Section 2');

    await user.click(trigger1);
    await user.click(trigger2);

    expect(screen.getByText('Content 1')).toBeVisible();
    expect(screen.getByText('Content 2')).toBeVisible();
  });

  it('should apply custom className to AccordionItem', () => {
    const { container } = render(
      <Accordion type="single">
        <AccordionItem value="item-1" className="custom-item">
          <AccordionTrigger>Section</AccordionTrigger>
          <AccordionContent>Content</AccordionContent>
        </AccordionItem>
      </Accordion>
    );

    const item = container.querySelector('.custom-item');
    expect(item).toBeInTheDocument();
  });

  it('should apply custom className to AccordionTrigger', () => {
    render(
      <Accordion type="single">
        <AccordionItem value="item-1">
          <AccordionTrigger className="custom-trigger">Section</AccordionTrigger>
          <AccordionContent>Content</AccordionContent>
        </AccordionItem>
      </Accordion>
    );

    const trigger = screen.getByText('Section');
    expect(trigger).toHaveClass('custom-trigger');
  });

  it('should apply custom className to AccordionContent', () => {
    const { container } = render(
      <Accordion type="single" defaultValue="item-1">
        <AccordionItem value="item-1">
          <AccordionTrigger>Section</AccordionTrigger>
          <AccordionContent className="custom-content">Content</AccordionContent>
        </AccordionItem>
      </Accordion>
    );

    const content = container.querySelector('.custom-content');
    expect(content).toBeInTheDocument();
  });

  it('should rotate chevron when expanded', async () => {
    const user = userEvent.setup();
    const { container } = render(<BasicAccordion />);

    const trigger = screen.getByText('Section 1');
    await user.click(trigger);

    const chevron = trigger.querySelector('svg');
    expect(chevron).toHaveClass('rotate-180');
  });

  it('should support defaultValue', () => {
    render(
      <Accordion type="single" defaultValue="item-2">
        <AccordionItem value="item-1">
          <AccordionTrigger>Section 1</AccordionTrigger>
          <AccordionContent>Content 1</AccordionContent>
        </AccordionItem>
        <AccordionItem value="item-2">
          <AccordionTrigger>Section 2</AccordionTrigger>
          <AccordionContent>Content 2</AccordionContent>
        </AccordionItem>
      </Accordion>
    );

    expect(screen.getByText('Content 2')).toBeVisible();
  });

  it('should support controlled value', () => {
    const { rerender } = render(
      <Accordion type="single" value="item-1">
        <AccordionItem value="item-1">
          <AccordionTrigger>Section 1</AccordionTrigger>
          <AccordionContent>Content 1</AccordionContent>
        </AccordionItem>
        <AccordionItem value="item-2">
          <AccordionTrigger>Section 2</AccordionTrigger>
          <AccordionContent>Content 2</AccordionContent>
        </AccordionItem>
      </Accordion>
    );

    expect(screen.getByText('Content 1')).toBeVisible();

    rerender(
      <Accordion type="single" value="item-2">
        <AccordionItem value="item-1">
          <AccordionTrigger>Section 1</AccordionTrigger>
          <AccordionContent>Content 1</AccordionContent>
        </AccordionItem>
        <AccordionItem value="item-2">
          <AccordionTrigger>Section 2</AccordionTrigger>
          <AccordionContent>Content 2</AccordionContent>
        </AccordionItem>
      </Accordion>
    );

    expect(screen.getByText('Content 2')).toBeVisible();
  });

  it('should support disabled items', async () => {
    const user = userEvent.setup();

    render(
      <Accordion type="single">
        <AccordionItem value="item-1" disabled>
          <AccordionTrigger>Disabled Section</AccordionTrigger>
          <AccordionContent>Disabled Content</AccordionContent>
        </AccordionItem>
      </Accordion>
    );

    const trigger = screen.getByText('Disabled Section');
    await user.click(trigger);

    // Content should not be visible after clicking disabled trigger
    expect(screen.queryByText('Disabled Content')).not.toBeVisible();
  });

  it('should support keyboard navigation', async () => {
    const user = userEvent.setup();
    render(<BasicAccordion />);

    const trigger = screen.getByText('Section 1');
    trigger.focus();

    await user.keyboard('{Enter}');

    expect(screen.getByText('Content 1')).toBeVisible();
  });

  it('should have proper ARIA attributes', () => {
    render(<BasicAccordion />);

    const trigger = screen.getByText('Section 1');

    expect(trigger).toHaveAttribute('type', 'button');
    expect(trigger).toHaveAttribute('aria-expanded');
  });

  it('should forward ref on AccordionItem', () => {
    const ref = vi.fn();

    render(
      <Accordion type="single">
        <AccordionItem value="item-1" ref={ref}>
          <AccordionTrigger>Section</AccordionTrigger>
          <AccordionContent>Content</AccordionContent>
        </AccordionItem>
      </Accordion>
    );

    expect(ref).toHaveBeenCalled();
  });

  it('should forward ref on AccordionTrigger', () => {
    const ref = vi.fn();

    render(
      <Accordion type="single">
        <AccordionItem value="item-1">
          <AccordionTrigger ref={ref}>Section</AccordionTrigger>
          <AccordionContent>Content</AccordionContent>
        </AccordionItem>
      </Accordion>
    );

    expect(ref).toHaveBeenCalled();
  });

  it('should forward ref on AccordionContent', () => {
    const ref = vi.fn();

    render(
      <Accordion type="single">
        <AccordionItem value="item-1">
          <AccordionTrigger>Section</AccordionTrigger>
          <AccordionContent ref={ref}>Content</AccordionContent>
        </AccordionItem>
      </Accordion>
    );

    expect(ref).toHaveBeenCalled();
  });

  it('should render multiple accordion items', () => {
    render(<BasicAccordion />);

    const triggers = screen.getAllByRole('button');
    expect(triggers).toHaveLength(3);
  });

  it('should have border on accordion items', () => {
    const { container } = render(<BasicAccordion />);

    const items = container.querySelectorAll('[data-radix-collection-item]');
    items.forEach((item) => {
      expect(item).toHaveClass('border-b');
    });
  });
});
