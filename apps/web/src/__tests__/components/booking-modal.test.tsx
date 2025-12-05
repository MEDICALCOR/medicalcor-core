import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BookingModal } from '@/components/calendar/booking-modal';

const mockSlot = {
  id: 'slot-1',
  time: '10:00',
  duration: 60,
  isAvailable: true,
  doctorId: 'doc-1',
};

const mockBookAppointmentAction = vi.fn();
const mockOnBookingComplete = vi.fn();
const mockOnOpenChange = vi.fn();

vi.mock('@/app/actions/calendar', () => ({
  bookAppointmentAction: (...args: any) => mockBookAppointmentAction(...args),
}));

describe('BookingModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should not render when closed', () => {
    render(
      <BookingModal
        slot={mockSlot}
        selectedDate={new Date('2024-01-15')}
        open={false}
        onOpenChange={mockOnOpenChange}
        onBookingComplete={mockOnBookingComplete}
      />
    );

    expect(screen.queryByText('Programare Nouă')).not.toBeInTheDocument();
  });

  it('should render when open', () => {
    render(
      <BookingModal
        slot={mockSlot}
        selectedDate={new Date('2024-01-15')}
        open={true}
        onOpenChange={mockOnOpenChange}
        onBookingComplete={mockOnBookingComplete}
      />
    );

    expect(screen.getByText('Programare Nouă')).toBeInTheDocument();
  });

  it('should display slot time and duration', () => {
    render(
      <BookingModal
        slot={mockSlot}
        selectedDate={new Date('2024-01-15')}
        open={true}
        onOpenChange={mockOnOpenChange}
        onBookingComplete={mockOnBookingComplete}
      />
    );

    expect(screen.getByText('10:00')).toBeInTheDocument();
    expect(screen.getByText('60 minute')).toBeInTheDocument();
  });

  it('should display formatted date', () => {
    render(
      <BookingModal
        slot={mockSlot}
        selectedDate={new Date('2024-01-15')}
        open={true}
        onOpenChange={mockOnOpenChange}
        onBookingComplete={mockOnBookingComplete}
      />
    );

    expect(screen.getByText(/ianuarie/i)).toBeInTheDocument();
  });

  it('should render patient name input', () => {
    render(
      <BookingModal
        slot={mockSlot}
        selectedDate={new Date('2024-01-15')}
        open={true}
        onOpenChange={mockOnOpenChange}
        onBookingComplete={mockOnBookingComplete}
      />
    );

    expect(screen.getByLabelText('Nume Pacient')).toBeInTheDocument();
  });

  it('should render patient phone input', () => {
    render(
      <BookingModal
        slot={mockSlot}
        selectedDate={new Date('2024-01-15')}
        open={true}
        onOpenChange={mockOnOpenChange}
        onBookingComplete={mockOnBookingComplete}
      />
    );

    expect(screen.getByLabelText('Telefon')).toBeInTheDocument();
  });

  it('should render procedure type select', () => {
    render(
      <BookingModal
        slot={mockSlot}
        selectedDate={new Date('2024-01-15')}
        open={true}
        onOpenChange={mockOnOpenChange}
        onBookingComplete={mockOnBookingComplete}
      />
    );

    expect(screen.getByLabelText('Tip Procedură')).toBeInTheDocument();
  });

  it('should render notes input', () => {
    render(
      <BookingModal
        slot={mockSlot}
        selectedDate={new Date('2024-01-15')}
        open={true}
        onOpenChange={mockOnOpenChange}
        onBookingComplete={mockOnBookingComplete}
      />
    );

    expect(screen.getByLabelText(/notițe/i)).toBeInTheDocument();
  });

  it('should show validation error when name is empty', async () => {
    const user = userEvent.setup();
    render(
      <BookingModal
        slot={mockSlot}
        selectedDate={new Date('2024-01-15')}
        open={true}
        onOpenChange={mockOnOpenChange}
        onBookingComplete={mockOnBookingComplete}
      />
    );

    await user.type(screen.getByLabelText('Telefon'), '+40123456789');
    await user.click(screen.getByRole('button', { name: /confirmă programare/i }));

    await waitFor(() => {
      expect(screen.getByText('Numele pacientului este obligatoriu')).toBeInTheDocument();
    });
  });

  it('should show validation error when phone is empty', async () => {
    const user = userEvent.setup();
    render(
      <BookingModal
        slot={mockSlot}
        selectedDate={new Date('2024-01-15')}
        open={true}
        onOpenChange={mockOnOpenChange}
        onBookingComplete={mockOnBookingComplete}
      />
    );

    await user.type(screen.getByLabelText('Nume Pacient'), 'Ion Popescu');
    await user.click(screen.getByRole('button', { name: /confirmă programare/i }));

    await waitFor(() => {
      expect(screen.getByText('Telefonul pacientului este obligatoriu')).toBeInTheDocument();
    });
  });

  it('should submit form with valid data', async () => {
    const user = userEvent.setup();
    mockBookAppointmentAction.mockResolvedValue({ success: true });

    render(
      <BookingModal
        slot={mockSlot}
        selectedDate={new Date('2024-01-15')}
        open={true}
        onOpenChange={mockOnOpenChange}
        onBookingComplete={mockOnBookingComplete}
      />
    );

    await user.type(screen.getByLabelText('Nume Pacient'), 'Ion Popescu');
    await user.type(screen.getByLabelText('Telefon'), '+40123456789');
    await user.click(screen.getByRole('button', { name: /confirmă programare/i }));

    await waitFor(() => {
      expect(mockBookAppointmentAction).toHaveBeenCalled();
    });
  });

  it('should call onBookingComplete on successful booking', async () => {
    const user = userEvent.setup();
    mockBookAppointmentAction.mockResolvedValue({ success: true });

    render(
      <BookingModal
        slot={mockSlot}
        selectedDate={new Date('2024-01-15')}
        open={true}
        onOpenChange={mockOnOpenChange}
        onBookingComplete={mockOnBookingComplete}
      />
    );

    await user.type(screen.getByLabelText('Nume Pacient'), 'Ion Popescu');
    await user.type(screen.getByLabelText('Telefon'), '+40123456789');
    await user.click(screen.getByRole('button', { name: /confirmă programare/i }));

    await waitFor(() => {
      expect(mockOnBookingComplete).toHaveBeenCalled();
    });
  });

  it('should show error message on booking failure', async () => {
    const user = userEvent.setup();
    mockBookAppointmentAction.mockResolvedValue({
      success: false,
      error: 'Slotul nu mai este disponibil',
    });

    render(
      <BookingModal
        slot={mockSlot}
        selectedDate={new Date('2024-01-15')}
        open={true}
        onOpenChange={mockOnOpenChange}
        onBookingComplete={mockOnBookingComplete}
      />
    );

    await user.type(screen.getByLabelText('Nume Pacient'), 'Ion Popescu');
    await user.type(screen.getByLabelText('Telefon'), '+40123456789');
    await user.click(screen.getByRole('button', { name: /confirmă programare/i }));

    await waitFor(() => {
      expect(screen.getByText('Slotul nu mai este disponibil')).toBeInTheDocument();
    });
  });

  it('should reset form when closed', async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <BookingModal
        slot={mockSlot}
        selectedDate={new Date('2024-01-15')}
        open={true}
        onOpenChange={mockOnOpenChange}
        onBookingComplete={mockOnBookingComplete}
      />
    );

    await user.type(screen.getByLabelText('Nume Pacient'), 'Ion Popescu');

    rerender(
      <BookingModal
        slot={mockSlot}
        selectedDate={new Date('2024-01-15')}
        open={false}
        onOpenChange={mockOnOpenChange}
        onBookingComplete={mockOnBookingComplete}
      />
    );

    rerender(
      <BookingModal
        slot={mockSlot}
        selectedDate={new Date('2024-01-15')}
        open={true}
        onOpenChange={mockOnOpenChange}
        onBookingComplete={mockOnBookingComplete}
      />
    );

    const nameInput = screen.getByLabelText('Nume Pacient') as HTMLInputElement;
    expect(nameInput.value).toBe('');
  });

  it('should disable inputs while submitting', async () => {
    const user = userEvent.setup();
    mockBookAppointmentAction.mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve({ success: true }), 1000))
    );

    render(
      <BookingModal
        slot={mockSlot}
        selectedDate={new Date('2024-01-15')}
        open={true}
        onOpenChange={mockOnOpenChange}
        onBookingComplete={mockOnBookingComplete}
      />
    );

    await user.type(screen.getByLabelText('Nume Pacient'), 'Ion Popescu');
    await user.type(screen.getByLabelText('Telefon'), '+40123456789');
    await user.click(screen.getByRole('button', { name: /confirmă programare/i }));

    expect(screen.getByLabelText('Nume Pacient')).toBeDisabled();
  });
});
