import { describe, it, expect } from 'vitest';
import {
  navigationCommands,
  actionCommands,
  allCommandGroups,
  mockPatients,
} from '@/lib/quick-search/commands';

describe('Quick Search Commands', () => {
  describe('navigationCommands', () => {
    it('should have navigation group structure', () => {
      expect(navigationCommands).toBeDefined();
      expect(navigationCommands.id).toBe('navigation');
      expect(navigationCommands.label).toBe('Navigare');
      expect(Array.isArray(navigationCommands.commands)).toBe(true);
    });

    it('should have 7 navigation commands', () => {
      expect(navigationCommands.commands).toHaveLength(7);
    });

    it('should have dashboard command', () => {
      const dashboard = navigationCommands.commands.find((cmd) => cmd.id === 'nav-dashboard');

      expect(dashboard).toBeDefined();
      expect(dashboard?.type).toBe('navigation');
      expect(dashboard?.label).toBe('Dashboard');
      expect(dashboard?.href).toBe('/');
      expect(dashboard?.icon).toBe('LayoutDashboard');
    });

    it('should have triage command', () => {
      const triage = navigationCommands.commands.find((cmd) => cmd.id === 'nav-triage');

      expect(triage).toBeDefined();
      expect(triage?.href).toBe('/triage');
      expect(triage?.keywords).toContain('urgente');
    });

    it('should have patients command', () => {
      const patients = navigationCommands.commands.find((cmd) => cmd.id === 'nav-patients');

      expect(patients).toBeDefined();
      expect(patients?.href).toBe('/patients');
      expect(patients?.keywords).toContain('pacienti');
    });

    it('should have calendar command', () => {
      const calendar = navigationCommands.commands.find((cmd) => cmd.id === 'nav-calendar');

      expect(calendar).toBeDefined();
      expect(calendar?.href).toBe('/calendar');
      expect(calendar?.keywords).toContain('programari');
    });

    it('should have messages command', () => {
      const messages = navigationCommands.commands.find((cmd) => cmd.id === 'nav-messages');

      expect(messages).toBeDefined();
      expect(messages?.href).toBe('/messages');
      expect(messages?.keywords).toContain('whatsapp');
    });

    it('should have analytics command', () => {
      const analytics = navigationCommands.commands.find((cmd) => cmd.id === 'nav-analytics');

      expect(analytics).toBeDefined();
      expect(analytics?.href).toBe('/analytics');
      expect(analytics?.keywords).toContain('rapoarte');
    });

    it('should have settings command', () => {
      const settings = navigationCommands.commands.find((cmd) => cmd.id === 'nav-settings');

      expect(settings).toBeDefined();
      expect(settings?.href).toBe('/settings');
      expect(settings?.keywords).toContain('configurari');
    });

    it('all commands should have required fields', () => {
      navigationCommands.commands.forEach((cmd) => {
        expect(cmd.id).toBeDefined();
        expect(cmd.type).toBe('navigation');
        expect(cmd.label).toBeDefined();
        expect(cmd.href).toBeDefined();
        expect(cmd.icon).toBeDefined();
        expect(cmd.description).toBeDefined();
      });
    });

    it('all commands should have keywords array', () => {
      navigationCommands.commands.forEach((cmd) => {
        expect(Array.isArray(cmd.keywords)).toBe(true);
        expect(cmd.keywords?.length).toBeGreaterThan(0);
      });
    });
  });

  describe('actionCommands', () => {
    it('should have action group structure', () => {
      expect(actionCommands).toBeDefined();
      expect(actionCommands.id).toBe('actions');
      expect(actionCommands.label).toBe('Acțiuni');
      expect(Array.isArray(actionCommands.commands)).toBe(true);
    });

    it('should have 4 action commands', () => {
      expect(actionCommands.commands).toHaveLength(4);
    });

    it('should have new patient action', () => {
      const newPatient = actionCommands.commands.find((cmd) => cmd.id === 'action-new-patient');

      expect(newPatient).toBeDefined();
      expect(newPatient?.type).toBe('action');
      expect(newPatient?.label).toBe('Pacient Nou');
      expect(newPatient?.icon).toBe('UserPlus');
      expect(newPatient?.keywords).toContain('adauga');
    });

    it('should have new appointment action', () => {
      const newAppointment = actionCommands.commands.find(
        (cmd) => cmd.id === 'action-new-appointment'
      );

      expect(newAppointment).toBeDefined();
      expect(newAppointment?.icon).toBe('CalendarPlus');
      expect(newAppointment?.keywords).toContain('programare');
    });

    it('should have new message action', () => {
      const newMessage = actionCommands.commands.find((cmd) => cmd.id === 'action-new-message');

      expect(newMessage).toBeDefined();
      expect(newMessage?.icon).toBe('Send');
      expect(newMessage?.keywords).toContain('trimite');
    });

    it('should have export action', () => {
      const exportAction = actionCommands.commands.find((cmd) => cmd.id === 'action-export');

      expect(exportAction).toBeDefined();
      expect(exportAction?.icon).toBe('Download');
      expect(exportAction?.keywords).toContain('csv');
      expect(exportAction?.keywords).toContain('excel');
    });

    it('all commands should have required fields', () => {
      actionCommands.commands.forEach((cmd) => {
        expect(cmd.id).toBeDefined();
        expect(cmd.type).toBe('action');
        expect(cmd.label).toBeDefined();
        expect(cmd.icon).toBeDefined();
        expect(cmd.description).toBeDefined();
      });
    });

    it('action commands should not have href', () => {
      actionCommands.commands.forEach((cmd) => {
        expect(cmd.href).toBeUndefined();
      });
    });
  });

  describe('mockPatients', () => {
    it('should have patient data', () => {
      expect(mockPatients).toBeDefined();
      expect(Array.isArray(mockPatients)).toBe(true);
      expect(mockPatients.length).toBeGreaterThan(0);
    });

    it('should have 5 patients', () => {
      expect(mockPatients).toHaveLength(5);
    });

    it('all patients should have required fields', () => {
      mockPatients.forEach((patient) => {
        expect(patient.id).toBeDefined();
        expect(patient.name).toBeDefined();
        expect(patient.phone).toBeDefined();
      });
    });

    it('should have valid phone numbers', () => {
      mockPatients.forEach((patient) => {
        expect(patient.phone).toMatch(/^\+40 7\d{2} \d{3} \d{3}$/);
      });
    });

    it('should have unique IDs', () => {
      const ids = mockPatients.map((p) => p.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(ids.length);
    });

    it('should have unique phone numbers', () => {
      const phones = mockPatients.map((p) => p.phone);
      const uniquePhones = new Set(phones);
      expect(uniquePhones.size).toBe(phones.length);
    });
  });

  describe('allCommandGroups', () => {
    it('should combine all command groups', () => {
      expect(allCommandGroups).toBeDefined();
      expect(Array.isArray(allCommandGroups)).toBe(true);
      expect(allCommandGroups).toHaveLength(2);
    });

    it('should include navigation commands', () => {
      expect(allCommandGroups).toContain(navigationCommands);
    });

    it('should include action commands', () => {
      expect(allCommandGroups).toContain(actionCommands);
    });

    it('should have all commands accessible', () => {
      const totalCommands = allCommandGroups.reduce((sum, group) => sum + group.commands.length, 0);

      expect(totalCommands).toBe(
        navigationCommands.commands.length + actionCommands.commands.length
      );
    });
  });

  describe('Command search functionality', () => {
    it('should be searchable by label', () => {
      const searchTerm = 'Dashboard';
      const results = navigationCommands.commands.filter((cmd) =>
        cmd.label.toLowerCase().includes(searchTerm.toLowerCase())
      );

      expect(results.length).toBeGreaterThan(0);
    });

    it('should be searchable by keywords', () => {
      const searchTerm = 'urgente';
      const results = navigationCommands.commands.filter((cmd) =>
        cmd.keywords?.some((kw) => kw.toLowerCase().includes(searchTerm.toLowerCase()))
      );

      expect(results.length).toBeGreaterThan(0);
    });

    it('should be searchable by description', () => {
      const searchTerm = 'tablou';
      const results = navigationCommands.commands.filter((cmd) =>
        cmd.description?.toLowerCase().includes(searchTerm.toLowerCase())
      );

      expect(results.length).toBeGreaterThan(0);
    });

    it('should match multiple keywords', () => {
      const searchTerms = ['whatsapp', 'chat', 'conversatii'];
      const messagesCmd = navigationCommands.commands.find((cmd) => cmd.id === 'nav-messages');

      searchTerms.forEach((term) => {
        expect(messagesCmd?.keywords).toContain(term);
      });
    });
  });

  describe('Command types', () => {
    it('navigation commands should all have href', () => {
      navigationCommands.commands.forEach((cmd) => {
        expect(cmd.href).toBeDefined();
        expect(typeof cmd.href).toBe('string');
        expect(cmd.href?.startsWith('/')).toBe(true);
      });
    });

    it('action commands should not have href', () => {
      actionCommands.commands.forEach((cmd) => {
        expect(cmd.href).toBeUndefined();
      });
    });

    it('all commands should have valid icons', () => {
      allCommandGroups.forEach((group) => {
        group.commands.forEach((cmd) => {
          expect(cmd.icon).toBeDefined();
          expect(typeof cmd.icon).toBe('string');
          expect(cmd.icon?.length).toBeGreaterThan(0);
        });
      });
    });
  });
});
