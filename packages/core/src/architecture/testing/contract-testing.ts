/**
 * @module architecture/testing/contract-testing
 *
 * Consumer-Driven Contract Testing
 * ================================
 *
 * Ensures compatibility between services.
 */

import { Ok, Err, type Result } from '../../types/result.js';

// ============================================================================
// CONTRACT TYPES
// ============================================================================

export interface Contract {
  readonly id: string;
  readonly consumer: string;
  readonly provider: string;
  readonly version: string;
  readonly interactions: ContractInteraction[];
  readonly metadata: ContractMetadata;
}

export interface ContractInteraction {
  readonly description: string;
  readonly request: InteractionRequest;
  readonly response: InteractionResponse;
}

export interface InteractionRequest {
  readonly method: string;
  readonly path: string;
  readonly headers?: Record<string, string>;
  readonly body?: unknown;
  readonly matchingRules?: MatchingRule[];
}

export interface InteractionResponse {
  readonly status: number;
  readonly headers?: Record<string, string>;
  readonly body?: unknown;
  readonly matchingRules?: MatchingRule[];
}

export interface MatchingRule {
  readonly path: string;
  readonly matcher: MatcherType;
  readonly value?: unknown;
}

export type MatcherType = 'type' | 'regex' | 'equality' | 'include' | 'integer' | 'decimal';

export interface ContractMetadata {
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly tags?: string[];
}

// ============================================================================
// VERIFICATION TYPES
// ============================================================================

export interface VerificationResult {
  readonly contractId: string;
  readonly success: boolean;
  readonly interactions: InteractionResult[];
  readonly duration: number;
}

export interface InteractionResult {
  readonly description: string;
  readonly success: boolean;
  readonly errors?: string[];
}

// ============================================================================
// CONTRACT ERROR
// ============================================================================

export class ContractError extends Error {
  constructor(
    message: string,
    readonly code: ContractErrorCode
  ) {
    super(message);
    this.name = 'ContractError';
  }
}

export type ContractErrorCode = 'NOT_FOUND' | 'VERIFICATION_FAILED' | 'INVALID_CONTRACT';

// ============================================================================
// CONTRACT SERVICE
// ============================================================================

export interface ContractService {
  publish(contract: Contract): Promise<Result<void, ContractError>>;
  getContract(consumer: string, provider: string): Promise<Result<Contract, ContractError>>;
  verify(
    provider: string,
    handler: ProviderHandler
  ): Promise<Result<VerificationResult[], ContractError>>;
  listContracts(provider?: string): Promise<Contract[]>;
}

export type ProviderHandler = (request: InteractionRequest) => Promise<InteractionResponse>;

// ============================================================================
// IN-MEMORY CONTRACT SERVICE
// ============================================================================

export class InMemoryContractService implements ContractService {
  private contracts = new Map<string, Contract>();

  publish(contract: Contract): Promise<Result<void, ContractError>> {
    const key = `${contract.consumer}:${contract.provider}`;
    this.contracts.set(key, contract);
    return Promise.resolve(Ok(undefined));
  }

  getContract(consumer: string, provider: string): Promise<Result<Contract, ContractError>> {
    const key = `${consumer}:${provider}`;
    const contract = this.contracts.get(key);
    if (!contract) {
      return Promise.resolve(Err(new ContractError('Contract not found', 'NOT_FOUND')));
    }
    return Promise.resolve(Ok(contract));
  }

  async verify(
    provider: string,
    handler: ProviderHandler
  ): Promise<Result<VerificationResult[], ContractError>> {
    const contracts = Array.from(this.contracts.values()).filter((c) => c.provider === provider);
    const results: VerificationResult[] = [];

    for (const contract of contracts) {
      const start = Date.now();
      const interactionResults: InteractionResult[] = [];

      for (const interaction of contract.interactions) {
        try {
          const response = await handler(interaction.request);
          const success = this.matchResponse(response, interaction.response);
          interactionResults.push({
            description: interaction.description,
            success,
            errors: success ? undefined : ['Response did not match expected'],
          });
        } catch (error) {
          interactionResults.push({
            description: interaction.description,
            success: false,
            errors: [error instanceof Error ? error.message : 'Unknown error'],
          });
        }
      }

      results.push({
        contractId: contract.id,
        success: interactionResults.every((r) => r.success),
        interactions: interactionResults,
        duration: Date.now() - start,
      });
    }

    return Ok(results);
  }

  listContracts(provider?: string): Promise<Contract[]> {
    const contracts = Array.from(this.contracts.values());
    return Promise.resolve(provider ? contracts.filter((c) => c.provider === provider) : contracts);
  }

  private matchResponse(actual: InteractionResponse, expected: InteractionResponse): boolean {
    if (actual.status !== expected.status) return false;
    if (
      expected.body !== undefined &&
      JSON.stringify(actual.body) !== JSON.stringify(expected.body)
    ) {
      return false;
    }
    return true;
  }
}

// ============================================================================
// CONTRACT BUILDER
// ============================================================================

export class ContractBuilder {
  private consumer = '';
  private provider = '';
  private version = '1.0.0';
  private interactions: ContractInteraction[] = [];

  forConsumer(name: string): this {
    this.consumer = name;
    return this;
  }

  withProvider(name: string): this {
    this.provider = name;
    return this;
  }

  withVersion(version: string): this {
    this.version = version;
    return this;
  }

  addInteraction(interaction: ContractInteraction): this {
    this.interactions.push(interaction);
    return this;
  }

  build(): Contract {
    const now = new Date();
    return {
      id: crypto.randomUUID(),
      consumer: this.consumer,
      provider: this.provider,
      version: this.version,
      interactions: this.interactions,
      metadata: { createdAt: now, updatedAt: now },
    };
  }
}
