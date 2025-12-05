import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PatientHeader } from '@/components/patients/patient-header';

const mockPatient = {
  id: 'p1',
  firstName: 'Ion',
  lastName: 'Popescu',
  dateOfBirth: new Date('1990-05-15'),
  gender: 'male' as const,
  cnp: '1900515123456',
  status: 'patient' as const,
  contact: {
    phone: '+40123456789',
    email: 'ion.popescu@example.com',
    whatsapp: '+40123456789',
    preferredChannel: 'whatsapp' as const,
  },
  address: {
    street: 'Str. Aviatorilor 10',
    city: 'București',
    county: 'București',
    postalCode: '012345',
  },
  tags: ['VIP', 'Implant'],
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-20'),
};

const mockOnEdit = vi.fn();

// Mock clipboard
Object.assign(navigator, {
  clipboard: {
    writeText: vi.fn(),
  },
});

describe('PatientHeader', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render patient full name', () => {
    render(<PatientHeader patient={mockPatient} />);
    expect(screen.getByText('Ion Popescu')).toBeInTheDocument();
  });

  it('should render patient initials in avatar', () => {
    render(<PatientHeader patient={mockPatient} />);
    expect(screen.getByText('IP')).toBeInTheDocument();
  });

  it('should render status badge', () => {
    render(<PatientHeader patient={mockPatient} />);
    expect(screen.getByText('Pacient')).toBeInTheDocument();
  });

  it('should render date of birth', () => {
    render(<PatientHeader patient={mockPatient} />);
    expect(screen.getByText(/15 mai 1990/)).toBeInTheDocument();
  });

  it('should calculate and display age', () => {
    render(<PatientHeader patient={mockPatient} />);
    const currentYear = new Date().getFullYear();
    const age = currentYear - 1990;
    expect(screen.getByText(new RegExp(`${age} ani`))).toBeInTheDocument();
  });

  it('should render gender', () => {
    render(<PatientHeader patient={mockPatient} />);
    expect(screen.getByText('Masculin')).toBeInTheDocument();
  });

  it('should render female gender', () => {
    const femalePatient = { ...mockPatient, gender: 'female' as const };
    render(<PatientHeader patient={femalePatient} />);
    expect(screen.getByText('Feminin')).toBeInTheDocument();
  });

  it('should render masked CNP', () => {
    render(<PatientHeader patient={mockPatient} />);
    expect(screen.getByText(/CNP: 1900.../)).toBeInTheDocument();
  });

  it('should copy CNP to clipboard when clicked', async () => {
    const user = userEvent.setup();
    render(<PatientHeader patient={mockPatient} />);

    const cnpButton = screen.getByText(/CNP: 1900.../);
    await user.click(cnpButton);

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('1900515123456');
  });

  it('should render tags', () => {
    render(<PatientHeader patient={mockPatient} />);
    expect(screen.getByText('VIP')).toBeInTheDocument();
    expect(screen.getByText('Implant')).toBeInTheDocument();
  });

  it('should render phone number', () => {
    render(<PatientHeader patient={mockPatient} />);
    expect(screen.getByText('+40123456789')).toBeInTheDocument();
  });

  it('should copy phone to clipboard when clicked', async () => {
    const user = userEvent.setup();
    render(<PatientHeader patient={mockPatient} />);

    const phoneButton = screen.getAllByText('+40123456789')[0];
    await user.click(phoneButton);

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('+40123456789');
  });

  it('should render email', () => {
    render(<PatientHeader patient={mockPatient} />);
    expect(screen.getByText('ion.popescu@example.com')).toBeInTheDocument();
  });

  it('should make email clickable', () => {
    render(<PatientHeader patient={mockPatient} />);
    const emailLink = screen.getByText('ion.popescu@example.com');
    expect(emailLink).toHaveAttribute('href', 'mailto:ion.popescu@example.com');
  });

  it('should render WhatsApp number', () => {
    render(<PatientHeader patient={mockPatient} />);
    const whatsappNumbers = screen.getAllByText('+40123456789');
    expect(whatsappNumbers.length).toBeGreaterThan(1);
  });

  it('should show preferred channel badge', () => {
    render(<PatientHeader patient={mockPatient} />);
    expect(screen.getByText('Preferat')).toBeInTheDocument();
  });

  it('should render complete address', () => {
    render(<PatientHeader patient={mockPatient} />);
    expect(screen.getByText(/Str\. Aviatorilor 10/)).toBeInTheDocument();
    expect(screen.getByText(/București/)).toBeInTheDocument();
  });

  it('should call onEdit when edit button is clicked', async () => {
    const user = userEvent.setup();
    render(<PatientHeader patient={mockPatient} onEdit={mockOnEdit} />);

    await user.click(screen.getByRole('button', { name: /editează/i }));

    expect(mockOnEdit).toHaveBeenCalledTimes(1);
  });

  it('should render dropdown menu', async () => {
    const user = userEvent.setup();
    render(<PatientHeader patient={mockPatient} />);

    const menuButtons = screen.getAllByRole('button');
    const moreButton = menuButtons.find((btn) => btn.querySelector('svg') && !btn.textContent);

    if (moreButton) {
      await user.click(moreButton);

      await waitFor(() => {
        expect(screen.getByText('Deschide în fereastră nouă')).toBeInTheDocument();
        expect(screen.getByText('Arhivează pacient')).toBeInTheDocument();
      });
    }
  });

  it('should apply correct status colors', () => {
    const leadPatient = { ...mockPatient, status: 'lead' as const };
    const { rerender } = render(<PatientHeader patient={leadPatient} />);

    const leadBadge = screen.getByText('Lead');
    expect(leadBadge).toHaveClass('bg-yellow-100', 'text-yellow-700');

    rerender(<PatientHeader patient={mockPatient} />);
    const patientBadge = screen.getByText('Pacient');
    expect(patientBadge).toHaveClass('bg-green-100', 'text-green-700');
  });

  it('should not render date of birth when not provided', () => {
    const patientWithoutDOB = { ...mockPatient, dateOfBirth: undefined as any };
    render(<PatientHeader patient={patientWithoutDOB} />);

    expect(screen.queryByText(/ani/)).not.toBeInTheDocument();
  });

  it('should not render email section when not provided', () => {
    const patientWithoutEmail = {
      ...mockPatient,
      contact: { ...mockPatient.contact, email: undefined },
    };
    render(<PatientHeader patient={patientWithoutEmail} />);

    expect(screen.queryByText('Email')).not.toBeInTheDocument();
  });

  it('should not render WhatsApp section when not provided', () => {
    const patientWithoutWhatsApp = {
      ...mockPatient,
      contact: { ...mockPatient.contact, whatsapp: undefined, preferredChannel: 'sms' as const },
    };
    render(<PatientHeader patient={patientWithoutWhatsApp} />);

    expect(screen.queryByText('WhatsApp')).not.toBeInTheDocument();
  });

  it('should not render address section when not provided', () => {
    const patientWithoutAddress = { ...mockPatient, address: undefined as any };
    render(<PatientHeader patient={patientWithoutAddress} />);

    expect(screen.queryByText('Adresă')).not.toBeInTheDocument();
  });

  it('should not render tags when empty', () => {
    const patientWithoutTags = { ...mockPatient, tags: [] };
    render(<PatientHeader patient={patientWithoutTags} />);

    expect(screen.queryByText('VIP')).not.toBeInTheDocument();
  });
});
