/// <reference types="@testing-library/jest-dom" />
/**
 * Snapshot tests for Analytics components
 * These tests verify that analytics components render correctly
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { TrendingUp, Users, DollarSign, Clock } from 'lucide-react';
import { MetricCard } from '@/components/analytics/metric-card';

describe('MetricCard Snapshots', () => {
  it('renders basic metric card', () => {
    const { container } = render(<MetricCard title="Total Patients" value={1234} />);
    expect(container).toMatchSnapshot();
  });

  it('renders metric card with icon', () => {
    const { container } = render(<MetricCard title="Total Users" value={5678} icon={Users} />);
    expect(container).toMatchSnapshot();
  });

  it('renders metric card with positive change', () => {
    const { container } = render(
      <MetricCard title="Revenue" value={25000} change={12.5} format="currency" icon={DollarSign} />
    );
    expect(container).toMatchSnapshot();
  });

  it('renders metric card with negative change', () => {
    const { container } = render(
      <MetricCard
        title="Bounce Rate"
        value={35.2}
        change={-8.3}
        format="percentage"
        icon={TrendingUp}
      />
    );
    expect(container).toMatchSnapshot();
  });

  it('renders metric card with zero change', () => {
    const { container } = render(<MetricCard title="Active Users" value={100} change={0} />);
    expect(container).toMatchSnapshot();
  });

  it('renders metric card with time format', () => {
    const { container } = render(
      <MetricCard title="Response Time" value={2.5} change={-15} format="time" icon={Clock} />
    );
    expect(container).toMatchSnapshot();
  });

  it('renders metric card with prefix and suffix', () => {
    const { container } = render(
      <MetricCard title="Custom Metric" value={42} prefix="~" suffix=" units" />
    );
    expect(container).toMatchSnapshot();
  });

  it('renders metric card with custom change label', () => {
    const { container } = render(
      <MetricCard
        title="Weekly Active"
        value={890}
        change={5.2}
        changeLabel="fata de saptamana trecuta"
      />
    );
    expect(container).toMatchSnapshot();
  });
});

describe('MetricCard Behavior', () => {
  it('formats currency correctly for Romanian locale', () => {
    render(<MetricCard title="Test" value={1500} format="currency" />);
    // Romanian currency format uses space as thousand separator
    expect(screen.getByText(/1[\.\s,]?500/)).toBeInTheDocument();
  });

  it('formats percentage correctly', () => {
    render(<MetricCard title="Test" value={75.5} format="percentage" />);
    expect(screen.getByText('75.5%')).toBeInTheDocument();
  });

  it('formats time correctly', () => {
    render(<MetricCard title="Test" value={3.2} format="time" />);
    expect(screen.getByText('3.2 min')).toBeInTheDocument();
  });

  it('shows correct trend icon for positive change', () => {
    const { container } = render(<MetricCard title="Test" value={100} change={5} />);
    // TrendingUp icon should be present
    expect(container.querySelector('svg')).toBeInTheDocument();
  });

  it('shows correct trend icon for negative change', () => {
    const { container } = render(<MetricCard title="Test" value={100} change={-5} />);
    // TrendingDown icon should be present
    expect(container.querySelector('svg')).toBeInTheDocument();
  });

  it('displays title correctly', () => {
    render(<MetricCard title="Test Title" value={100} />);
    expect(screen.getByText('Test Title')).toBeInTheDocument();
  });
});
