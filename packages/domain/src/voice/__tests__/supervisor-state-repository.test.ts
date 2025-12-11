/**
 * @fileoverview Tests for Supervisor State Repository
 *
 * Tests for PostgreSQL persistence of supervisor monitoring state.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  PostgresSupervisorStateRepository,
  createSupervisorStateRepository,
  type IDatabasePool,
  type EscalationHistoryEntry,
} from '../supervisor-state-repository.js';
import type {
  MonitoredCall,
  SupervisorSession,
  SupervisorNote,
  HandoffRequest,
} from '@medicalcor/types';

describe('PostgresSupervisorStateRepository', () => {
  let mockPool: IDatabasePool;
  let repository: PostgresSupervisorStateRepository;

  const createMockPool = (): IDatabasePool => ({
    query: vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
  });

  beforeEach(() => {
    mockPool = createMockPool();
    repository = new PostgresSupervisorStateRepository(mockPool);
  });

  describe('Call Operations', () => {
    const mockCall: MonitoredCall = {
      callSid: 'CA123',
      customerPhone: '+1234567890',
      phoneNumber: '+1234567890',
      leadId: 'lead-123',
      contactName: 'John Doe',
      state: 'in-progress',
      direction: 'inbound',
      duration: 120,
      assistantId: 'asst-123',
      agentId: 'agent-123',
      startedAt: new Date('2025-01-01T10:00:00Z'),
      answeredAt: new Date('2025-01-01T10:00:05Z'),
      holdStartedAt: undefined,
      sentiment: 'positive',
      aiScore: 85,
      flags: ['high-value-lead'],
      recentTranscript: [{ role: 'assistant', content: 'Hello' }],
      metadata: { source: 'web' },
    };

    describe('saveCall', () => {
      it('should save call with all fields', async () => {
        await repository.saveCall('clinic-123', mockCall);

        expect(mockPool.query).toHaveBeenCalledWith(
          expect.stringContaining('INSERT INTO supervisor_monitored_calls'),
          expect.arrayContaining(['CA123', 'clinic-123', '+1234567890', 'lead-123', 'John Doe'])
        );
      });

      it('should handle upsert on conflict', async () => {
        await repository.saveCall('clinic-123', mockCall);

        expect(mockPool.query).toHaveBeenCalledWith(
          expect.stringContaining('ON CONFLICT (call_sid) DO UPDATE'),
          expect.any(Array)
        );
      });

      it('should serialize recentTranscript as JSON', async () => {
        await repository.saveCall('clinic-123', mockCall);

        expect(mockPool.query).toHaveBeenCalledWith(
          expect.any(String),
          expect.arrayContaining([JSON.stringify([{ role: 'assistant', content: 'Hello' }])])
        );
      });

      it('should handle missing optional fields', async () => {
        const minimalCall: MonitoredCall = {
          callSid: 'CA124',
          customerPhone: '+1234567890',
          state: 'ringing',
          direction: 'inbound',
          duration: 0,
          startedAt: new Date(),
          flags: [],
          recentTranscript: [],
        };

        await repository.saveCall('clinic-123', minimalCall);

        expect(mockPool.query).toHaveBeenCalledWith(
          expect.any(String),
          expect.arrayContaining(['CA124', 'clinic-123'])
        );
      });
    });

    describe('getCall', () => {
      it('should return call by SID', async () => {
        mockPool.query = vi.fn().mockResolvedValue({
          rows: [
            {
              call_sid: 'CA123',
              phone_number: '+1234567890',
              lead_id: 'lead-123',
              contact_name: 'John Doe',
              state: 'in-progress',
              direction: 'inbound',
              duration: 120,
              assistant_id: 'asst-123',
              agent_id: 'agent-123',
              started_at: '2025-01-01T10:00:00Z',
              answered_at: '2025-01-01T10:00:05Z',
              hold_started_at: null,
              sentiment: 'positive',
              ai_score: 85,
              flags: ['high-value-lead'],
              recent_transcript: '[{"role":"assistant","content":"Hello"}]',
              metadata: { source: 'web' },
            },
          ],
          rowCount: 1,
        });

        const call = await repository.getCall('CA123');

        expect(call).not.toBeNull();
        expect(call?.callSid).toBe('CA123');
        expect(call?.customerPhone).toBe('+1234567890');
        expect(call?.recentTranscript).toEqual([{ role: 'assistant', content: 'Hello' }]);
      });

      it('should return null for non-existent call', async () => {
        mockPool.query = vi.fn().mockResolvedValue({ rows: [], rowCount: 0 });

        const call = await repository.getCall('non-existent');
        expect(call).toBeNull();
      });

      it('should parse transcript from non-string value', async () => {
        mockPool.query = vi.fn().mockResolvedValue({
          rows: [
            {
              call_sid: 'CA123',
              phone_number: '+1234567890',
              state: 'in-progress',
              direction: 'inbound',
              duration: 0,
              started_at: '2025-01-01T10:00:00Z',
              flags: [],
              recent_transcript: [{ role: 'user', content: 'Hi' }],
            },
          ],
          rowCount: 1,
        });

        const call = await repository.getCall('CA123');
        expect(call?.recentTranscript).toEqual([{ role: 'user', content: 'Hi' }]);
      });

      it('should handle null transcript', async () => {
        mockPool.query = vi.fn().mockResolvedValue({
          rows: [
            {
              call_sid: 'CA123',
              phone_number: '+1234567890',
              state: 'in-progress',
              direction: 'inbound',
              duration: 0,
              started_at: '2025-01-01T10:00:00Z',
              flags: [],
              recent_transcript: null,
            },
          ],
          rowCount: 1,
        });

        const call = await repository.getCall('CA123');
        expect(call?.recentTranscript).toEqual([]);
      });

      it('should filter invalid flags', async () => {
        mockPool.query = vi.fn().mockResolvedValue({
          rows: [
            {
              call_sid: 'CA123',
              phone_number: '+1234567890',
              state: 'in-progress',
              direction: 'inbound',
              duration: 0,
              started_at: '2025-01-01T10:00:00Z',
              flags: ['high-value-lead', 'invalid-flag', 'escalation-requested'],
              recent_transcript: null,
            },
          ],
          rowCount: 1,
        });

        const call = await repository.getCall('CA123');
        expect(call?.flags).toEqual(['high-value-lead', 'escalation-requested']);
      });
    });

    describe('updateCall', () => {
      it('should update call fields', async () => {
        await repository.updateCall('CA123', {
          state: 'completed',
          agentId: 'new-agent',
        });

        expect(mockPool.query).toHaveBeenCalledWith(
          expect.stringContaining('UPDATE supervisor_monitored_calls SET'),
          expect.any(Array)
        );
      });

      it('should not execute query for empty updates', async () => {
        await repository.updateCall('CA123', {});

        expect(mockPool.query).not.toHaveBeenCalled();
      });

      it('should serialize recentTranscript updates', async () => {
        await repository.updateCall('CA123', {
          recentTranscript: [{ role: 'user', content: 'New message' }],
        });

        expect(mockPool.query).toHaveBeenCalledWith(
          expect.any(String),
          expect.arrayContaining([JSON.stringify([{ role: 'user', content: 'New message' }])])
        );
      });

      it('should handle multiple field updates', async () => {
        await repository.updateCall('CA123', {
          state: 'completed',
          sentiment: 'negative',
          aiScore: 50,
          flags: ['complaint'],
        });

        expect(mockPool.query).toHaveBeenCalled();
      });

      it('should ignore unmapped fields', async () => {
        // Intentionally passing unknown field to test runtime validation
        await repository.updateCall('CA123', {
          unknownField: 'value',
        } as unknown as Parameters<typeof repository.updateCall>[1]);

        expect(mockPool.query).not.toHaveBeenCalled();
      });
    });

    describe('deleteCall', () => {
      it('should soft delete call by setting state to completed', async () => {
        await repository.deleteCall('CA123');

        expect(mockPool.query).toHaveBeenCalledWith(
          expect.stringContaining("SET state = 'completed'"),
          ['CA123']
        );
      });
    });

    describe('getActiveCalls', () => {
      it('should return active calls', async () => {
        mockPool.query = vi.fn().mockResolvedValue({
          rows: [
            {
              call_sid: 'CA123',
              phone_number: '+1234567890',
              state: 'in-progress',
              direction: 'inbound',
              duration: 60,
              started_at: '2025-01-01T10:00:00Z',
              flags: [],
              recent_transcript: '[]',
            },
          ],
          rowCount: 1,
        });

        const calls = await repository.getActiveCalls();

        expect(calls).toHaveLength(1);
        expect(calls[0]?.callSid).toBe('CA123');
      });

      it('should filter by clinic ID when provided', async () => {
        await repository.getActiveCalls('clinic-123');

        expect(mockPool.query).toHaveBeenCalledWith(expect.stringContaining('clinic_id = $1'), [
          'clinic-123',
        ]);
      });

      it('should exclude completed calls', async () => {
        await repository.getActiveCalls();

        expect(mockPool.query).toHaveBeenCalledWith(
          expect.stringContaining("state != 'completed'"),
          expect.any(Array)
        );
      });
    });

    describe('getCallsByFlag', () => {
      it('should return calls with specific flag', async () => {
        mockPool.query = vi.fn().mockResolvedValue({
          rows: [
            {
              call_sid: 'CA123',
              phone_number: '+1234567890',
              state: 'in-progress',
              direction: 'inbound',
              duration: 60,
              started_at: '2025-01-01T10:00:00Z',
              flags: ['escalation-requested'],
              recent_transcript: '[]',
            },
          ],
          rowCount: 1,
        });

        const calls = await repository.getCallsByFlag('escalation-requested');

        expect(calls).toHaveLength(1);
        expect(mockPool.query).toHaveBeenCalledWith(expect.stringContaining('$1 = ANY(flags)'), [
          'escalation-requested',
        ]);
      });

      it('should filter by clinic ID when provided', async () => {
        await repository.getCallsByFlag('high-value-lead', 'clinic-123');

        expect(mockPool.query).toHaveBeenCalledWith(expect.stringContaining('clinic_id = $2'), [
          'high-value-lead',
          'clinic-123',
        ]);
      });
    });
  });

  describe('Session Operations', () => {
    const mockSession: SupervisorSession = {
      sessionId: 'sess-123',
      supervisorId: 'sup-123',
      supervisorName: 'Jane Manager',
      role: 'supervisor',
      permissions: ['monitor', 'whisper', 'barge'],
      monitoringMode: 'silent',
      activeCallSid: 'CA123',
      callsMonitored: 5,
      interventions: 2,
      startedAt: new Date('2025-01-01T09:00:00Z'),
    };

    describe('saveSession', () => {
      it('should save session with all fields', async () => {
        await repository.saveSession('clinic-123', mockSession);

        expect(mockPool.query).toHaveBeenCalledWith(
          expect.stringContaining('INSERT INTO supervisor_sessions'),
          expect.arrayContaining([
            'sess-123',
            'clinic-123',
            'sup-123',
            'Jane Manager',
            'supervisor',
          ])
        );
      });

      it('should handle upsert on conflict', async () => {
        await repository.saveSession('clinic-123', mockSession);

        expect(mockPool.query).toHaveBeenCalledWith(
          expect.stringContaining('ON CONFLICT (session_id) DO UPDATE'),
          expect.any(Array)
        );
      });
    });

    describe('getSession', () => {
      it('should return session by ID', async () => {
        mockPool.query = vi.fn().mockResolvedValue({
          rows: [
            {
              session_id: 'sess-123',
              supervisor_id: 'sup-123',
              supervisor_name: 'Jane Manager',
              role: 'supervisor',
              permissions: ['monitor', 'whisper'],
              monitoring_mode: 'silent',
              active_call_sid: 'CA123',
              calls_monitored: 5,
              interventions: 2,
              started_at: '2025-01-01T09:00:00Z',
            },
          ],
          rowCount: 1,
        });

        const session = await repository.getSession('sess-123');

        expect(session).not.toBeNull();
        expect(session?.sessionId).toBe('sess-123');
        expect(session?.supervisorName).toBe('Jane Manager');
      });

      it('should return null for expired session', async () => {
        mockPool.query = vi.fn().mockResolvedValue({ rows: [], rowCount: 0 });

        const session = await repository.getSession('expired-session');
        expect(session).toBeNull();
      });

      it('should handle null permissions', async () => {
        mockPool.query = vi.fn().mockResolvedValue({
          rows: [
            {
              session_id: 'sess-123',
              supervisor_id: 'sup-123',
              supervisor_name: 'Jane',
              role: 'supervisor',
              permissions: null,
              monitoring_mode: 'silent',
              calls_monitored: 0,
              interventions: 0,
              started_at: '2025-01-01T09:00:00Z',
            },
          ],
          rowCount: 1,
        });

        const session = await repository.getSession('sess-123');
        expect(session?.permissions).toEqual([]);
      });
    });

    describe('updateSession', () => {
      it('should update session fields', async () => {
        await repository.updateSession('sess-123', {
          monitoringMode: 'whisper',
          activeCallSid: 'CA456',
        });

        expect(mockPool.query).toHaveBeenCalledWith(
          expect.stringContaining('UPDATE supervisor_sessions SET'),
          expect.any(Array)
        );
      });

      it('should not execute query for empty updates', async () => {
        await repository.updateSession('sess-123', {});

        expect(mockPool.query).not.toHaveBeenCalled();
      });

      it('should update last_activity_at', async () => {
        await repository.updateSession('sess-123', { callsMonitored: 10 });

        expect(mockPool.query).toHaveBeenCalledWith(
          expect.stringContaining('last_activity_at = NOW()'),
          expect.any(Array)
        );
      });
    });

    describe('deleteSession', () => {
      it('should delete session', async () => {
        await repository.deleteSession('sess-123');

        expect(mockPool.query).toHaveBeenCalledWith(
          expect.stringContaining('DELETE FROM supervisor_sessions'),
          ['sess-123']
        );
      });
    });

    describe('getActiveSessions', () => {
      it('should return active sessions', async () => {
        mockPool.query = vi.fn().mockResolvedValue({
          rows: [
            {
              session_id: 'sess-123',
              supervisor_id: 'sup-123',
              supervisor_name: 'Jane',
              role: 'supervisor',
              permissions: [],
              monitoring_mode: 'silent',
              calls_monitored: 5,
              interventions: 2,
              started_at: '2025-01-01T09:00:00Z',
            },
          ],
          rowCount: 1,
        });

        const sessions = await repository.getActiveSessions();

        expect(sessions).toHaveLength(1);
      });

      it('should filter by clinic ID when provided', async () => {
        await repository.getActiveSessions('clinic-123');

        expect(mockPool.query).toHaveBeenCalledWith(expect.stringContaining('clinic_id = $1'), [
          'clinic-123',
        ]);
      });

      it('should exclude expired sessions', async () => {
        await repository.getActiveSessions();

        expect(mockPool.query).toHaveBeenCalledWith(
          expect.stringContaining('expires_at > NOW()'),
          expect.any(Array)
        );
      });
    });
  });

  describe('Notes Operations', () => {
    describe('saveNote', () => {
      it('should save note', async () => {
        const note: SupervisorNote = {
          callSid: 'CA123',
          supervisorId: 'sup-123',
          supervisorName: 'Jane',
          note: 'Patient requested callback',
          content: 'Patient requested callback',
          isPrivate: false,
          timestamp: new Date('2025-01-01T10:30:00Z'),
        };

        await repository.saveNote(note);

        expect(mockPool.query).toHaveBeenCalledWith(
          expect.stringContaining('INSERT INTO supervisor_notes'),
          expect.arrayContaining(['CA123', 'sup-123', 'Jane', 'Patient requested callback'])
        );
      });

      it('should handle note without supervisorName', async () => {
        const note: SupervisorNote = {
          callSid: 'CA123',
          supervisorId: 'sup-123',
          note: 'Test note',
          isPrivate: true,
          timestamp: new Date(),
        };

        await repository.saveNote(note);

        expect(mockPool.query).toHaveBeenCalledWith(
          expect.any(String),
          expect.arrayContaining([null])
        );
      });

      it('should use note field when content is not available', async () => {
        const note: SupervisorNote = {
          callSid: 'CA123',
          supervisorId: 'sup-123',
          note: 'Note content',
          isPrivate: false,
          timestamp: new Date(),
        };

        await repository.saveNote(note);

        expect(mockPool.query).toHaveBeenCalledWith(
          expect.any(String),
          expect.arrayContaining(['Note content'])
        );
      });
    });

    describe('getNotes', () => {
      it('should return notes for call', async () => {
        mockPool.query = vi.fn().mockResolvedValue({
          rows: [
            {
              call_sid: 'CA123',
              supervisor_id: 'sup-123',
              supervisor_name: 'Jane',
              content: 'Test note',
              is_private: false,
              timestamp: '2025-01-01T10:30:00Z',
            },
          ],
          rowCount: 1,
        });

        const notes = await repository.getNotes('CA123');

        expect(notes).toHaveLength(1);
        expect(notes[0]?.content).toBe('Test note');
      });

      it('should filter by supervisor ID when provided', async () => {
        await repository.getNotes('CA123', 'sup-123');

        expect(mockPool.query).toHaveBeenCalledWith(
          expect.stringContaining('supervisor_id = $2 OR is_private = false'),
          ['CA123', 'sup-123']
        );
      });
    });
  });

  describe('History Operations', () => {
    describe('recordEscalation', () => {
      it('should record escalation', async () => {
        const entry: Omit<EscalationHistoryEntry, 'id'> = {
          callSid: 'CA123',
          clinicId: 'clinic-123',
          reason: 'Customer requested manager',
          escalationType: 'manual',
          timestamp: new Date('2025-01-01T11:00:00Z'),
        };

        await repository.recordEscalation(entry);

        expect(mockPool.query).toHaveBeenCalledWith(
          expect.stringContaining('INSERT INTO supervisor_escalation_history'),
          expect.arrayContaining(['CA123', 'clinic-123', 'Customer requested manager', 'manual'])
        );
      });
    });

    describe('recordHandoff', () => {
      it('should record handoff and return ID', async () => {
        const request: HandoffRequest = {
          callSid: 'CA123',
          reason: 'AI cannot handle complex inquiry',
          priority: 'high',
          skillRequired: 'all-on-x',
          context: { patientType: 'existing' },
        };

        const handoffId = await repository.recordHandoff(request, 'clinic-123');

        expect(handoffId).toMatch(/^hoff_\d+_[a-z0-9]+$/);
        expect(mockPool.query).toHaveBeenCalledWith(
          expect.stringContaining('INSERT INTO supervisor_handoff_history'),
          expect.any(Array)
        );
      });

      it('should use default priority when not provided', async () => {
        const request: HandoffRequest = {
          callSid: 'CA123',
          context: {},
        };

        await repository.recordHandoff(request, 'clinic-123');

        expect(mockPool.query).toHaveBeenCalledWith(
          expect.any(String),
          expect.arrayContaining(['normal'])
        );
      });
    });

    describe('completeHandoff', () => {
      it('should complete handoff with agent info', async () => {
        await repository.completeHandoff('CA123', 'agent-456', 'John Agent');

        expect(mockPool.query).toHaveBeenCalledWith(
          expect.stringContaining('UPDATE supervisor_handoff_history'),
          ['CA123', 'agent-456', 'John Agent']
        );
      });

      it('should handle missing agent name', async () => {
        await repository.completeHandoff('CA123', 'agent-456');

        expect(mockPool.query).toHaveBeenCalledWith(expect.any(String), [
          'CA123',
          'agent-456',
          null,
        ]);
      });
    });

    describe('getEscalationsToday', () => {
      it('should return today escalations', async () => {
        mockPool.query = vi.fn().mockResolvedValue({
          rows: [
            {
              id: 'esc-1',
              call_sid: 'CA123',
              clinic_id: 'clinic-123',
              reason: 'Customer complaint',
              escalation_type: 'sentiment',
              timestamp: '2025-01-01T10:00:00Z',
              resolved_at: null,
              resolved_by: null,
              resolution_action: null,
            },
          ],
          rowCount: 1,
        });

        const escalations = await repository.getEscalationsToday('clinic-123');

        expect(escalations).toHaveLength(1);
        expect(escalations[0]?.reason).toBe('Customer complaint');
      });
    });

    describe('getHandoffsToday', () => {
      it('should return count of completed handoffs today', async () => {
        mockPool.query = vi.fn().mockResolvedValue({
          rows: [{ count: '15' }],
          rowCount: 1,
        });

        const count = await repository.getHandoffsToday('clinic-123');

        expect(count).toBe(15);
      });

      it('should return 0 when no handoffs', async () => {
        mockPool.query = vi.fn().mockResolvedValue({
          rows: [{}],
          rowCount: 0,
        });

        const count = await repository.getHandoffsToday('clinic-123');

        expect(count).toBe(0);
      });
    });
  });

  describe('Dashboard Operations', () => {
    describe('getDashboardStats', () => {
      beforeEach(() => {
        // Mock getActiveCalls
        mockPool.query = vi
          .fn()
          .mockResolvedValueOnce({
            rows: [
              {
                call_sid: 'CA1',
                phone_number: '+1',
                state: 'in-progress',
                direction: 'inbound',
                duration: 60,
                assistant_id: 'asst-1',
                agent_id: null,
                started_at: '2025-01-01T10:00:00Z',
                flags: ['escalation-requested'],
                recent_transcript: '[]',
              },
              {
                call_sid: 'CA2',
                phone_number: '+2',
                state: 'ringing',
                direction: 'inbound',
                duration: 0,
                assistant_id: null,
                agent_id: null,
                started_at: '2025-01-01T10:05:00Z',
                flags: [],
                recent_transcript: '[]',
              },
              {
                call_sid: 'CA3',
                phone_number: '+3',
                state: 'wrapping-up',
                direction: 'inbound',
                duration: 300,
                assistant_id: null,
                agent_id: 'agent-1',
                started_at: '2025-01-01T09:00:00Z',
                flags: ['high-value-lead'],
                recent_transcript: '[]',
              },
            ],
            rowCount: 3,
          })
          // Mock getEscalationsToday
          .mockResolvedValueOnce({
            rows: [
              {
                id: 'esc-1',
                call_sid: 'CA1',
                clinic_id: 'clinic-123',
                reason: 'test',
                escalation_type: 'manual',
                timestamp: '2025-01-01T10:00:00Z',
              },
            ],
            rowCount: 1,
          })
          // Mock getHandoffsToday
          .mockResolvedValueOnce({
            rows: [{ count: '5' }],
            rowCount: 1,
          });
      });

      it('should return dashboard statistics', async () => {
        const stats = await repository.getDashboardStats('clinic-123');

        expect(stats.activeCalls).toBe(3);
        expect(stats.callsInQueue).toBe(1); // ringing calls
        expect(stats.aiHandledCalls).toBe(1); // calls with assistantId but no agentId
        expect(stats.escalationsToday).toBe(1);
        expect(stats.handoffsToday).toBe(5);
        expect(stats.agentsInWrapUp).toBe(1);
      });

      it('should calculate active alerts', async () => {
        const stats = await repository.getDashboardStats('clinic-123');

        // escalation-requested (1) + ai-handoff-needed (0) + calls with any flags (2)
        expect(stats.activeAlerts).toBeGreaterThan(0);
      });

      it('should include lastUpdated timestamp', async () => {
        const stats = await repository.getDashboardStats('clinic-123');

        expect(stats.lastUpdated).toBeInstanceOf(Date);
      });
    });
  });

  describe('Cleanup Operations', () => {
    describe('cleanupExpiredSessions', () => {
      it('should delete expired sessions and return count', async () => {
        mockPool.query = vi.fn().mockResolvedValue({
          rows: [{ session_id: 's1' }, { session_id: 's2' }],
          rowCount: 2,
        });

        const count = await repository.cleanupExpiredSessions();

        expect(count).toBe(2);
        expect(mockPool.query).toHaveBeenCalledWith(
          expect.stringContaining('DELETE FROM supervisor_sessions WHERE expires_at < NOW()')
        );
      });

      it('should return 0 when no expired sessions', async () => {
        mockPool.query = vi.fn().mockResolvedValue({
          rows: [],
          rowCount: null,
        });

        const count = await repository.cleanupExpiredSessions();

        expect(count).toBe(0);
      });
    });

    describe('cleanupCompletedCalls', () => {
      it('should delete old completed calls with default retention', async () => {
        mockPool.query = vi.fn().mockResolvedValue({
          rows: [{ call_sid: 'c1' }],
          rowCount: 1,
        });

        const count = await repository.cleanupCompletedCalls();

        expect(count).toBe(1);
        expect(mockPool.query).toHaveBeenCalledWith(
          expect.stringContaining("state = 'completed'"),
          [24] // default retention hours
        );
      });

      it('should use custom retention hours', async () => {
        await repository.cleanupCompletedCalls(48);

        expect(mockPool.query).toHaveBeenCalledWith(expect.any(String), [48]);
      });

      it('should return 0 when no calls deleted', async () => {
        mockPool.query = vi.fn().mockResolvedValue({
          rows: [],
          rowCount: null,
        });

        const count = await repository.cleanupCompletedCalls();

        expect(count).toBe(0);
      });
    });
  });
});

describe('createSupervisorStateRepository', () => {
  it('should create PostgresSupervisorStateRepository instance', () => {
    const mockPool: IDatabasePool = {
      query: vi.fn(),
    };

    const repository = createSupervisorStateRepository(mockPool);

    expect(repository).toBeInstanceOf(PostgresSupervisorStateRepository);
  });
});
