/**
 * @module architecture/infrastructure/cloud-provider
 *
 * Cloud Provider Abstraction
 * ==========================
 *
 * Vendor-agnostic cloud service abstractions.
 */

// ============================================================================
// CLOUD PROVIDER TYPES
// ============================================================================

export type CloudProvider = 'aws' | 'gcp' | 'azure' | 'local' | 'kubernetes';

export interface CloudRegion {
  readonly provider: CloudProvider;
  readonly name: string;
  readonly displayName: string;
}

export interface ResourceTags {
  readonly environment: string;
  readonly service: string;
  readonly team: string;
  readonly [key: string]: string;
}

// ============================================================================
// COMPUTE ABSTRACTION
// ============================================================================

export interface FunctionConfig {
  readonly name: string;
  readonly runtime: FunctionRuntime;
  readonly handler: string;
  readonly memoryMB: number;
  readonly timeoutSeconds: number;
  readonly environment: Record<string, string>;
  readonly tags: ResourceTags;
}

export type FunctionRuntime = 'nodejs18' | 'nodejs20' | 'python39' | 'python311';

export interface FunctionResult<T> {
  readonly statusCode: number;
  readonly payload: T;
  readonly executionTimeMs: number;
}

export interface ComputeService {
  deployFunction(config: FunctionConfig, code: Buffer): Promise<string>;
  invokeFunction<TInput, TOutput>(name: string, payload: TInput): Promise<FunctionResult<TOutput>>;
  deleteFunction(name: string): Promise<void>;
}

// ============================================================================
// CONTAINER ABSTRACTION
// ============================================================================

export interface ContainerConfig {
  readonly name: string;
  readonly image: string;
  readonly tag: string;
  readonly cpu: number;
  readonly memoryMB: number;
  readonly replicas: number;
  readonly environment: Record<string, string>;
  readonly ports: PortMapping[];
}

export interface PortMapping {
  readonly containerPort: number;
  readonly hostPort?: number;
  readonly protocol: 'tcp' | 'udp';
}

export interface ContainerService {
  deploy(config: ContainerConfig): Promise<DeploymentResult>;
  scale(name: string, replicas: number): Promise<void>;
  getStatus(name: string): Promise<DeploymentStatus>;
  delete(name: string): Promise<void>;
}

export interface DeploymentResult {
  readonly deploymentId: string;
  readonly status: DeploymentStatus;
  readonly endpoints: string[];
}

export interface DeploymentStatus {
  readonly name: string;
  readonly ready: boolean;
  readonly replicas: { desired: number; ready: number };
}

// ============================================================================
// INFRASTRUCTURE AS CODE
// ============================================================================

export interface InfrastructureResource {
  readonly type: string;
  readonly name: string;
  readonly properties: Record<string, unknown>;
  readonly dependencies?: string[];
  readonly tags: ResourceTags;
}

export interface InfrastructureStack {
  readonly name: string;
  readonly environment: string;
  readonly resources: InfrastructureResource[];
  readonly outputs: Record<string, string>;
}

export interface InfrastructureProvisioner {
  plan(stack: InfrastructureStack): Promise<InfrastructurePlan>;
  apply(plan: InfrastructurePlan): Promise<InfrastructureState>;
  destroy(stackName: string): Promise<void>;
}

export interface InfrastructurePlan {
  readonly stackName: string;
  readonly changes: ResourceChange[];
  readonly canApply: boolean;
}

export interface ResourceChange {
  readonly logicalId: string;
  readonly type: string;
  readonly action: 'create' | 'update' | 'delete' | 'replace';
}

export interface InfrastructureState {
  readonly stackName: string;
  readonly resources: ResourceState[];
  readonly lastUpdated: Date;
}

export interface ResourceState {
  readonly logicalId: string;
  readonly physicalId: string;
  readonly type: string;
  readonly status: 'created' | 'updated' | 'deleted' | 'failed';
}
