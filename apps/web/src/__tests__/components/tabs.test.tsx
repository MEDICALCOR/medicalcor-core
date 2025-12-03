import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';

describe('Tabs', () => {
  it('renders tabs with default value', () => {
    render(
      <Tabs defaultValue="tab1">
        <TabsList>
          <TabsTrigger value="tab1">Tab 1</TabsTrigger>
          <TabsTrigger value="tab2">Tab 2</TabsTrigger>
        </TabsList>
        <TabsContent value="tab1">Content 1</TabsContent>
        <TabsContent value="tab2">Content 2</TabsContent>
      </Tabs>
    );

    expect(screen.getByRole('tablist')).toBeInTheDocument();
    expect(screen.getAllByRole('tab')).toHaveLength(2);
    expect(screen.getByText('Content 1')).toBeInTheDocument();
    expect(screen.queryByText('Content 2')).not.toBeInTheDocument();
  });

  it('has proper ARIA attributes', () => {
    render(
      <Tabs defaultValue="tab1">
        <TabsList>
          <TabsTrigger value="tab1">Tab 1</TabsTrigger>
          <TabsTrigger value="tab2">Tab 2</TabsTrigger>
        </TabsList>
        <TabsContent value="tab1">Content 1</TabsContent>
        <TabsContent value="tab2">Content 2</TabsContent>
      </Tabs>
    );

    const tablist = screen.getByRole('tablist');
    expect(tablist).toHaveAttribute('aria-orientation', 'horizontal');

    const tabs = screen.getAllByRole('tab');
    expect(tabs[0]).toHaveAttribute('aria-selected', 'true');
    expect(tabs[0]).toHaveAttribute('aria-controls');
    expect(tabs[0]).toHaveAttribute('tabindex', '0');

    expect(tabs[1]).toHaveAttribute('aria-selected', 'false');
    expect(tabs[1]).toHaveAttribute('tabindex', '-1');

    const tabpanel = screen.getByRole('tabpanel');
    expect(tabpanel).toHaveAttribute('aria-labelledby');
    expect(tabpanel).toHaveAttribute('tabindex', '0');
  });

  it('switches tabs when clicked', async () => {
    const user = userEvent.setup();

    render(
      <Tabs defaultValue="tab1">
        <TabsList>
          <TabsTrigger value="tab1">Tab 1</TabsTrigger>
          <TabsTrigger value="tab2">Tab 2</TabsTrigger>
        </TabsList>
        <TabsContent value="tab1">Content 1</TabsContent>
        <TabsContent value="tab2">Content 2</TabsContent>
      </Tabs>
    );

    expect(screen.getByText('Content 1')).toBeInTheDocument();
    expect(screen.queryByText('Content 2')).not.toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'Tab 2' }));

    expect(screen.queryByText('Content 1')).not.toBeInTheDocument();
    expect(screen.getByText('Content 2')).toBeInTheDocument();
  });

  it('calls onValueChange when tab changes', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();

    render(
      <Tabs defaultValue="tab1" onValueChange={onValueChange}>
        <TabsList>
          <TabsTrigger value="tab1">Tab 1</TabsTrigger>
          <TabsTrigger value="tab2">Tab 2</TabsTrigger>
        </TabsList>
        <TabsContent value="tab1">Content 1</TabsContent>
        <TabsContent value="tab2">Content 2</TabsContent>
      </Tabs>
    );

    await user.click(screen.getByRole('tab', { name: 'Tab 2' }));

    expect(onValueChange).toHaveBeenCalledWith('tab2');
  });

  it('supports controlled mode', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();

    const { rerender } = render(
      <Tabs value="tab1" onValueChange={onValueChange}>
        <TabsList>
          <TabsTrigger value="tab1">Tab 1</TabsTrigger>
          <TabsTrigger value="tab2">Tab 2</TabsTrigger>
        </TabsList>
        <TabsContent value="tab1">Content 1</TabsContent>
        <TabsContent value="tab2">Content 2</TabsContent>
      </Tabs>
    );

    expect(screen.getByText('Content 1')).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'Tab 2' }));

    // Content shouldn't change in controlled mode without rerender
    expect(onValueChange).toHaveBeenCalledWith('tab2');
    expect(screen.getByText('Content 1')).toBeInTheDocument();

    // Rerender with new value
    rerender(
      <Tabs value="tab2" onValueChange={onValueChange}>
        <TabsList>
          <TabsTrigger value="tab1">Tab 1</TabsTrigger>
          <TabsTrigger value="tab2">Tab 2</TabsTrigger>
        </TabsList>
        <TabsContent value="tab1">Content 1</TabsContent>
        <TabsContent value="tab2">Content 2</TabsContent>
      </Tabs>
    );

    expect(screen.getByText('Content 2')).toBeInTheDocument();
  });

  it('supports keyboard navigation', async () => {
    const user = userEvent.setup();

    render(
      <Tabs defaultValue="tab1">
        <TabsList>
          <TabsTrigger value="tab1">Tab 1</TabsTrigger>
          <TabsTrigger value="tab2">Tab 2</TabsTrigger>
          <TabsTrigger value="tab3">Tab 3</TabsTrigger>
        </TabsList>
        <TabsContent value="tab1">Content 1</TabsContent>
        <TabsContent value="tab2">Content 2</TabsContent>
        <TabsContent value="tab3">Content 3</TabsContent>
      </Tabs>
    );

    // Focus first tab
    const firstTab = screen.getByRole('tab', { name: 'Tab 1' });
    firstTab.focus();
    expect(firstTab).toHaveFocus();

    // Tab panels should be focusable
    const tabpanel = screen.getByRole('tabpanel');
    expect(tabpanel).toHaveAttribute('tabindex', '0');
  });

  it('links tab IDs to panel IDs correctly', () => {
    render(
      <Tabs defaultValue="tab1">
        <TabsList>
          <TabsTrigger value="tab1">Tab 1</TabsTrigger>
        </TabsList>
        <TabsContent value="tab1">Content 1</TabsContent>
      </Tabs>
    );

    const tab = screen.getByRole('tab');
    const panel = screen.getByRole('tabpanel');

    const tabId = tab.getAttribute('id');
    const panelId = panel.getAttribute('id');
    const tabControls = tab.getAttribute('aria-controls');
    const panelLabelledBy = panel.getAttribute('aria-labelledby');

    expect(tabControls).toBe(panelId);
    expect(panelLabelledBy).toBe(tabId);
  });

  it('applies custom className to components', () => {
    render(
      <Tabs defaultValue="tab1" className="tabs-class">
        <TabsList className="tablist-class">
          <TabsTrigger value="tab1" className="trigger-class">
            Tab 1
          </TabsTrigger>
        </TabsList>
        <TabsContent value="tab1" className="content-class">
          Content 1
        </TabsContent>
      </Tabs>
    );

    expect(screen.getByRole('tablist')).toHaveClass('tablist-class');
    expect(screen.getByRole('tab')).toHaveClass('trigger-class');
    expect(screen.getByRole('tabpanel')).toHaveClass('content-class');
  });

  it('shows focus-visible styling on tabs', async () => {
    const user = userEvent.setup();

    render(
      <Tabs defaultValue="tab1">
        <TabsList>
          <TabsTrigger value="tab1">Tab 1</TabsTrigger>
          <TabsTrigger value="tab2">Tab 2</TabsTrigger>
        </TabsList>
        <TabsContent value="tab1">Content 1</TabsContent>
        <TabsContent value="tab2">Content 2</TabsContent>
      </Tabs>
    );

    // Tab to the first trigger
    await user.tab();

    const firstTab = screen.getByRole('tab', { name: 'Tab 1' });
    expect(firstTab).toHaveFocus();
    expect(firstTab.className).toContain('focus-visible');
  });

  it('renders with many tabs', () => {
    const tabs = Array.from({ length: 10 }, (_, i) => `tab${i + 1}`);

    render(
      <Tabs defaultValue="tab1">
        <TabsList>
          {tabs.map((tab) => (
            <TabsTrigger key={tab} value={tab}>
              {tab}
            </TabsTrigger>
          ))}
        </TabsList>
        {tabs.map((tab) => (
          <TabsContent key={tab} value={tab}>
            Content for {tab}
          </TabsContent>
        ))}
      </Tabs>
    );

    expect(screen.getAllByRole('tab')).toHaveLength(10);
    expect(screen.getByText('Content for tab1')).toBeInTheDocument();
  });

  it('displays correct content for each selected tab', async () => {
    const user = userEvent.setup();

    render(
      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>
        <TabsContent value="overview">
          <h2>Overview Content</h2>
          <p>Dashboard overview data</p>
        </TabsContent>
        <TabsContent value="analytics">
          <h2>Analytics Content</h2>
          <p>Charts and graphs</p>
        </TabsContent>
        <TabsContent value="settings">
          <h2>Settings Content</h2>
          <p>Configuration options</p>
        </TabsContent>
      </Tabs>
    );

    // Check initial state
    expect(screen.getByText('Overview Content')).toBeInTheDocument();
    expect(screen.getByText('Dashboard overview data')).toBeInTheDocument();

    // Switch to analytics
    await user.click(screen.getByRole('tab', { name: 'Analytics' }));
    expect(screen.getByText('Analytics Content')).toBeInTheDocument();
    expect(screen.getByText('Charts and graphs')).toBeInTheDocument();
    expect(screen.queryByText('Overview Content')).not.toBeInTheDocument();

    // Switch to settings
    await user.click(screen.getByRole('tab', { name: 'Settings' }));
    expect(screen.getByText('Settings Content')).toBeInTheDocument();
    expect(screen.getByText('Configuration options')).toBeInTheDocument();
    expect(screen.queryByText('Analytics Content')).not.toBeInTheDocument();
  });
});
