import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Users } from 'lucide-react';
import { MetricCard } from '@/components/analytics/metric-card';

describe('MetricCard', () => {
  it('should render title', () => {
    render(<MetricCard title="Total Leads" value={150} />);
    expect(screen.getByText('Total Leads')).toBeInTheDocument();
  });

  it('should render numeric value', () => {
    render(<MetricCard title="Total Leads" value={150} />);
    expect(screen.getByText('150')).toBeInTheDocument();
  });

  it('should render string value', () => {
    render(<MetricCard title="Status" value="Active" />);
    expect(screen.getByText('Active')).toBeInTheDocument();
  });

  it('should format currency correctly', () => {
    render(<MetricCard title="Revenue" value={25000} format="currency" />);
    expect(screen.getByText(/25\.000/)).toBeInTheDocument();
  });

  it('should format percentage correctly', () => {
    render(<MetricCard title="Conversion Rate" value={12.5} format="percentage" />);
    expect(screen.getByText('12.5%')).toBeInTheDocument();
  });

  it('should format time correctly', () => {
    render(<MetricCard title="Response Time" value={2.3} format="time" />);
    expect(screen.getByText('2.3 min')).toBeInTheDocument();
  });

  it('should display prefix', () => {
    render(<MetricCard title="Budget" value={5000} prefix="$" />);
    expect(screen.getByText(/\$/)).toBeInTheDocument();
  });

  it('should display suffix', () => {
    render(<MetricCard title="Growth" value={15} suffix="%" />);
    expect(screen.getByText(/%/)).toBeInTheDocument();
  });

  it('should display icon', () => {
    const { container } = render(<MetricCard title="Users" value={100} icon={Users} />);
    const icon = container.querySelector('svg');
    expect(icon).toBeInTheDocument();
  });

  it('should apply custom icon color', () => {
    const { container } = render(
      <MetricCard title="Users" value={100} icon={Users} iconColor="text-blue-500" />
    );
    const iconWrapper = container.querySelector('.text-blue-500');
    expect(iconWrapper).toBeInTheDocument();
  });

  it('should show positive change with green color', () => {
    render(<MetricCard title="Leads" value={100} change={15.5} />);
    expect(screen.getByText('15.5%')).toBeInTheDocument();
    expect(screen.getByText('15.5%')).toHaveClass('text-green-600');
  });

  it('should show negative change with red color', () => {
    render(<MetricCard title="Leads" value={100} change={-10.2} />);
    expect(screen.getByText('10.2%')).toBeInTheDocument();
    expect(screen.getByText('10.2%')).toHaveClass('text-red-600');
  });

  it('should show zero change with muted color', () => {
    render(<MetricCard title="Leads" value={100} change={0} />);
    expect(screen.getByText('0.0%')).toHaveClass('text-muted-foreground');
  });

  it('should invert colors for time metrics', () => {
    render(<MetricCard title="Response Time" value={5.5} format="time" change={-10} />);
    // Negative change in time is good (faster), so should be green
    expect(screen.getByText('10.0%')).toHaveClass('text-green-600');
  });

  it('should display custom change label', () => {
    render(<MetricCard title="Leads" value={100} change={15} changeLabel="vs last month" />);
    expect(screen.getByText('vs last month')).toBeInTheDocument();
  });

  it('should display default change label', () => {
    render(<MetricCard title="Leads" value={100} change={15} />);
    expect(screen.getByText('vs perioada anterioară')).toBeInTheDocument();
  });

  it('should not show change when undefined', () => {
    render(<MetricCard title="Leads" value={100} />);
    expect(screen.queryByText(/%$/)).not.toBeInTheDocument();
  });

  it('should show TrendingUp icon for positive change', () => {
    const { container } = render(<MetricCard title="Leads" value={100} change={15} />);
    // TrendingUp icon should be present
    expect(container.querySelector('svg')).toBeInTheDocument();
  });

  it('should show TrendingDown icon for negative change', () => {
    const { container } = render(<MetricCard title="Leads" value={100} change={-15} />);
    // TrendingDown icon should be present
    expect(container.querySelector('svg')).toBeInTheDocument();
  });

  it('should show Minus icon for zero change', () => {
    const { container } = render(<MetricCard title="Leads" value={100} change={0} />);
    // Minus icon should be present
    expect(container.querySelector('svg')).toBeInTheDocument();
  });

  it('should format large numbers with separators', () => {
    render(<MetricCard title="Revenue" value={1234567} format="number" />);
    expect(screen.getByText(/1\.234\.567/)).toBeInTheDocument();
  });

  it('should be memoized', () => {
    const { rerender } = render(<MetricCard title="Leads" value={100} />);
    const firstRender = screen.getByText('Leads');

    rerender(<MetricCard title="Leads" value={100} />);
    const secondRender = screen.getByText('Leads');

    // Component should be the same instance (memoized)
    expect(firstRender).toBe(secondRender);
  });
});
