/**
 * @module architecture/testing/bdd
 *
 * Behavior-Driven Development
 * ===========================
 *
 * Gherkin-style test definitions.
 */

// ============================================================================
// BDD TYPES
// ============================================================================

export interface Feature {
  readonly name: string;
  readonly description?: string;
  readonly scenarios: Scenario[];
  readonly background?: Background;
  readonly tags?: string[];
}

export interface Scenario {
  readonly name: string;
  readonly steps: Step[];
  readonly tags?: string[];
  readonly examples?: Example[];
}

export interface Background {
  readonly steps: Step[];
}

export interface Step {
  readonly keyword: StepKeyword;
  readonly text: string;
  readonly argument?: StepArgument;
}

export type StepKeyword = 'Given' | 'When' | 'Then' | 'And' | 'But';

export type StepArgument = DataTable | DocString;

export interface DataTable {
  readonly type: 'dataTable';
  readonly rows: string[][];
}

export interface DocString {
  readonly type: 'docString';
  readonly content: string;
  readonly contentType?: string;
}

export interface Example {
  readonly name?: string;
  readonly headers: string[];
  readonly rows: string[][];
}

// ============================================================================
// STEP DEFINITION
// ============================================================================

export type StepHandler<TContext = unknown> = (
  context: TContext,
  ...args: string[]
) => Promise<void> | void;

export interface StepDefinition<TContext = unknown> {
  readonly pattern: RegExp;
  readonly handler: StepHandler<TContext>;
}

// ============================================================================
// BDD RUNNER
// ============================================================================

export class BDDRunner<TContext = Record<string, unknown>> {
  private stepDefinitions: StepDefinition<TContext>[] = [];
  private beforeScenarioHooks: ((context: TContext) => Promise<void> | void)[] = [];
  private afterScenarioHooks: ((context: TContext) => Promise<void> | void)[] = [];

  given(pattern: RegExp | string, handler: StepHandler<TContext>): this {
    this.addStep(pattern, handler);
    return this;
  }

  when(pattern: RegExp | string, handler: StepHandler<TContext>): this {
    this.addStep(pattern, handler);
    return this;
  }

  then(pattern: RegExp | string, handler: StepHandler<TContext>): this {
    this.addStep(pattern, handler);
    return this;
  }

  beforeScenario(hook: (context: TContext) => Promise<void> | void): this {
    this.beforeScenarioHooks.push(hook);
    return this;
  }

  afterScenario(hook: (context: TContext) => Promise<void> | void): this {
    this.afterScenarioHooks.push(hook);
    return this;
  }

  async runFeature(feature: Feature, createContext: () => TContext): Promise<FeatureResult> {
    const scenarioResults: ScenarioResult[] = [];

    for (const scenario of feature.scenarios) {
      const result = await this.runScenario(scenario, feature.background, createContext);
      scenarioResults.push(result);
    }

    return {
      feature: feature.name,
      passed: scenarioResults.every((r) => r.passed),
      scenarios: scenarioResults,
    };
  }

  private async runScenario(
    scenario: Scenario,
    background: Background | undefined,
    createContext: () => TContext
  ): Promise<ScenarioResult> {
    const context = createContext();
    const stepResults: StepResult[] = [];

    try {
      for (const hook of this.beforeScenarioHooks) {
        await hook(context);
      }

      if (background) {
        for (const step of background.steps) {
          const result = await this.runStep(step, context);
          stepResults.push(result);
          if (!result.passed) {
            return { scenario: scenario.name, passed: false, steps: stepResults };
          }
        }
      }

      for (const step of scenario.steps) {
        const result = await this.runStep(step, context);
        stepResults.push(result);
        if (!result.passed) {
          return { scenario: scenario.name, passed: false, steps: stepResults };
        }
      }

      for (const hook of this.afterScenarioHooks) {
        await hook(context);
      }

      return { scenario: scenario.name, passed: true, steps: stepResults };
    } catch (error) {
      return {
        scenario: scenario.name,
        passed: false,
        steps: stepResults,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  private async runStep(step: Step, context: TContext): Promise<StepResult> {
    const definition = this.findStepDefinition(step.text);

    if (!definition) {
      return {
        step: `${step.keyword} ${step.text}`,
        passed: false,
        error: 'No matching step definition found',
      };
    }

    try {
      const match = step.text.match(definition.pattern);
      const args = match?.slice(1) ?? [];
      await definition.handler(context, ...args);
      return { step: `${step.keyword} ${step.text}`, passed: true };
    } catch (error) {
      return {
        step: `${step.keyword} ${step.text}`,
        passed: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  private findStepDefinition(text: string): StepDefinition<TContext> | undefined {
    return this.stepDefinitions.find((def) => def.pattern.test(text));
  }

  private addStep(pattern: RegExp | string, handler: StepHandler<TContext>): void {
    const regex = typeof pattern === 'string' ? new RegExp(`^${pattern}$`) : pattern;
    this.stepDefinitions.push({ pattern: regex, handler });
  }
}

// ============================================================================
// RESULT TYPES
// ============================================================================

export interface FeatureResult {
  readonly feature: string;
  readonly passed: boolean;
  readonly scenarios: ScenarioResult[];
}

export interface ScenarioResult {
  readonly scenario: string;
  readonly passed: boolean;
  readonly steps: StepResult[];
  readonly error?: string;
}

export interface StepResult {
  readonly step: string;
  readonly passed: boolean;
  readonly error?: string;
}

// ============================================================================
// FLUENT FEATURE BUILDER
// ============================================================================

export class FeatureBuilder {
  private name = '';
  private description?: string;
  private scenarios: Scenario[] = [];
  private background?: Background;
  private tags: string[] = [];

  feature(name: string): this {
    this.name = name;
    return this;
  }

  withDescription(description: string): this {
    this.description = description;
    return this;
  }

  withBackground(steps: Step[]): this {
    this.background = { steps };
    return this;
  }

  addScenario(scenario: Scenario): this {
    this.scenarios.push(scenario);
    return this;
  }

  withTags(...tags: string[]): this {
    this.tags.push(...tags);
    return this;
  }

  build(): Feature {
    return {
      name: this.name,
      description: this.description,
      scenarios: this.scenarios,
      background: this.background,
      tags: this.tags.length > 0 ? this.tags : undefined,
    };
  }
}

export class ScenarioBuilder {
  private name = '';
  private steps: Step[] = [];
  private tags: string[] = [];
  private examples: Example[] = [];

  scenario(name: string): this {
    this.name = name;
    return this;
  }

  given(text: string, argument?: StepArgument): this {
    this.steps.push({ keyword: 'Given', text, argument });
    return this;
  }

  when(text: string, argument?: StepArgument): this {
    this.steps.push({ keyword: 'When', text, argument });
    return this;
  }

  then(text: string, argument?: StepArgument): this {
    this.steps.push({ keyword: 'Then', text, argument });
    return this;
  }

  and(text: string, argument?: StepArgument): this {
    this.steps.push({ keyword: 'And', text, argument });
    return this;
  }

  but(text: string, argument?: StepArgument): this {
    this.steps.push({ keyword: 'But', text, argument });
    return this;
  }

  withTags(...tags: string[]): this {
    this.tags.push(...tags);
    return this;
  }

  withExamples(headers: string[], rows: string[][], name?: string): this {
    this.examples.push({ name, headers, rows });
    return this;
  }

  build(): Scenario {
    return {
      name: this.name,
      steps: this.steps,
      tags: this.tags.length > 0 ? this.tags : undefined,
      examples: this.examples.length > 0 ? this.examples : undefined,
    };
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

export function createBDDRunner<TContext = Record<string, unknown>>(): BDDRunner<TContext> {
  return new BDDRunner<TContext>();
}

export function dataTable(rows: string[][]): DataTable {
  return { type: 'dataTable', rows };
}

export function docString(content: string, contentType?: string): DocString {
  return { type: 'docString', content, contentType };
}
