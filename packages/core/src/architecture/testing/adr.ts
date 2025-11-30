/**
 * @module architecture/testing/adr
 *
 * Architecture Decision Records
 * =============================
 *
 * Document and track architectural decisions.
 */

import { Ok, Err, type Result } from '../../types/result.js';

// ============================================================================
// ADR TYPES
// ============================================================================

export interface ArchitectureDecisionRecord {
  readonly id: string;
  readonly title: string;
  readonly status: ADRStatus;
  readonly context: string;
  readonly decision: string;
  readonly consequences: string[];
  readonly alternatives?: Alternative[] | undefined;
  readonly metadata: ADRMetadata;
}

export type ADRStatus = 'proposed' | 'accepted' | 'deprecated' | 'superseded';

export interface Alternative {
  readonly title: string;
  readonly description: string;
  readonly pros: string[];
  readonly cons: string[];
}

export interface ADRMetadata {
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly author: string;
  readonly reviewers?: string[] | undefined;
  readonly supersededBy?: string | undefined;
  readonly tags?: string[] | undefined;
}

// ============================================================================
// ADR ERROR
// ============================================================================

export class ADRError extends Error {
  constructor(
    message: string,
    readonly code: ADRErrorCode
  ) {
    super(message);
    this.name = 'ADRError';
  }
}

export type ADRErrorCode = 'NOT_FOUND' | 'INVALID_STATUS_TRANSITION' | 'ALREADY_EXISTS';

// ============================================================================
// ADR SERVICE
// ============================================================================

export interface ADRService {
  create(
    adr: Omit<ArchitectureDecisionRecord, 'id' | 'metadata'>,
    author: string
  ): Promise<Result<ArchitectureDecisionRecord, ADRError>>;
  get(id: string): Promise<Result<ArchitectureDecisionRecord, ADRError>>;
  update(
    id: string,
    updates: Partial<
      Pick<
        ArchitectureDecisionRecord,
        'title' | 'context' | 'decision' | 'consequences' | 'alternatives'
      >
    >
  ): Promise<Result<ArchitectureDecisionRecord, ADRError>>;
  updateStatus(
    id: string,
    status: ADRStatus,
    supersededBy?: string
  ): Promise<Result<ArchitectureDecisionRecord, ADRError>>;
  list(filter?: ADRFilter): Promise<ArchitectureDecisionRecord[]>;
  search(query: string): Promise<ArchitectureDecisionRecord[]>;
}

export interface ADRFilter {
  readonly status?: ADRStatus;
  readonly author?: string;
  readonly tags?: string[];
}

// ============================================================================
// IN-MEMORY ADR SERVICE
// ============================================================================

export class InMemoryADRService implements ADRService {
  private adrs = new Map<string, ArchitectureDecisionRecord>();
  private counter = 0;

  create(
    adr: Omit<ArchitectureDecisionRecord, 'id' | 'metadata'>,
    author: string
  ): Promise<Result<ArchitectureDecisionRecord, ADRError>> {
    this.counter++;
    const id = `ADR-${String(this.counter).padStart(4, '0')}`;
    const now = new Date();

    const record: ArchitectureDecisionRecord = {
      ...adr,
      id,
      metadata: {
        createdAt: now,
        updatedAt: now,
        author,
      },
    };

    this.adrs.set(id, record);
    return Promise.resolve(Ok(record));
  }

  get(id: string): Promise<Result<ArchitectureDecisionRecord, ADRError>> {
    const adr = this.adrs.get(id);
    if (!adr) {
      return Promise.resolve(Err(new ADRError('ADR not found', 'NOT_FOUND')));
    }
    return Promise.resolve(Ok(adr));
  }

  update(
    id: string,
    updates: Partial<
      Pick<
        ArchitectureDecisionRecord,
        'title' | 'context' | 'decision' | 'consequences' | 'alternatives'
      >
    >
  ): Promise<Result<ArchitectureDecisionRecord, ADRError>> {
    const existing = this.adrs.get(id);
    if (!existing) {
      return Promise.resolve(Err(new ADRError('ADR not found', 'NOT_FOUND')));
    }

    const updated: ArchitectureDecisionRecord = {
      ...existing,
      ...updates,
      metadata: {
        ...existing.metadata,
        updatedAt: new Date(),
      },
    };

    this.adrs.set(id, updated);
    return Promise.resolve(Ok(updated));
  }

  updateStatus(
    id: string,
    status: ADRStatus,
    supersededBy?: string
  ): Promise<Result<ArchitectureDecisionRecord, ADRError>> {
    const existing = this.adrs.get(id);
    if (!existing) {
      return Promise.resolve(Err(new ADRError('ADR not found', 'NOT_FOUND')));
    }

    if (!this.isValidTransition(existing.status, status)) {
      return Promise.resolve(
        Err(
          new ADRError(
            `Cannot transition from ${existing.status} to ${status}`,
            'INVALID_STATUS_TRANSITION'
          )
        )
      );
    }

    const updated: ArchitectureDecisionRecord = {
      ...existing,
      status,
      metadata: {
        ...existing.metadata,
        updatedAt: new Date(),
        supersededBy: status === 'superseded' ? supersededBy : existing.metadata.supersededBy,
      },
    };

    this.adrs.set(id, updated);
    return Promise.resolve(Ok(updated));
  }

  list(filter?: ADRFilter): Promise<ArchitectureDecisionRecord[]> {
    let adrs = Array.from(this.adrs.values());

    if (filter?.status) {
      adrs = adrs.filter((a) => a.status === filter.status);
    }
    if (filter?.author) {
      adrs = adrs.filter((a) => a.metadata.author === filter.author);
    }
    if (filter?.tags && filter.tags.length > 0) {
      const tags = filter.tags;
      adrs = adrs.filter((a) => tags.some((t) => a.metadata.tags?.includes(t)));
    }

    return Promise.resolve(adrs.sort((a, b) => a.id.localeCompare(b.id)));
  }

  search(query: string): Promise<ArchitectureDecisionRecord[]> {
    const lower = query.toLowerCase();
    return Promise.resolve(
      Array.from(this.adrs.values()).filter(
        (a) =>
          a.title.toLowerCase().includes(lower) ||
          a.context.toLowerCase().includes(lower) ||
          a.decision.toLowerCase().includes(lower)
      )
    );
  }

  private isValidTransition(from: ADRStatus, to: ADRStatus): boolean {
    const transitions: Record<ADRStatus, ADRStatus[]> = {
      proposed: ['accepted', 'deprecated'],
      accepted: ['deprecated', 'superseded'],
      deprecated: [],
      superseded: [],
    };
    return transitions[from].includes(to);
  }
}

// ============================================================================
// ADR BUILDER
// ============================================================================

export class ADRBuilder {
  private title = '';
  private status: ADRStatus = 'proposed';
  private context = '';
  private decision = '';
  private consequences: string[] = [];
  private alternatives: Alternative[] = [];

  withTitle(title: string): this {
    this.title = title;
    return this;
  }

  withStatus(status: ADRStatus): this {
    this.status = status;
    return this;
  }

  withContext(context: string): this {
    this.context = context;
    return this;
  }

  withDecision(decision: string): this {
    this.decision = decision;
    return this;
  }

  addConsequence(consequence: string): this {
    this.consequences.push(consequence);
    return this;
  }

  addAlternative(alternative: Alternative): this {
    this.alternatives.push(alternative);
    return this;
  }

  build(): Omit<ArchitectureDecisionRecord, 'id' | 'metadata'> {
    return {
      title: this.title,
      status: this.status,
      context: this.context,
      decision: this.decision,
      consequences: this.consequences,
      alternatives: this.alternatives.length > 0 ? this.alternatives : undefined,
    };
  }
}
