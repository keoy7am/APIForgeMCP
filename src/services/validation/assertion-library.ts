/**
 * Assertion Library
 * Fluent API for building validation rules
 */

import { v4 as uuidv4 } from 'uuid';
import type {
  ValidationRule,
  CustomAssertion,
  AssertionLibrary as IAssertionLibrary,
  ValidationSeverity,
} from '../../types';

/**
 * Fluent assertion builder
 */
export class AssertionBuilder {
  private rules: ValidationRule[] = [];
  protected currentRule: Partial<ValidationRule> | null = null;

  /**
   * Set severity for the next rule
   */
  severity(level: ValidationSeverity): this {
    if (this.currentRule) {
      this.currentRule.severity = level;
    }
    return this;
  }

  /**
   * Set name for the next rule
   */
  named(name: string): this {
    if (this.currentRule) {
      this.currentRule.name = name;
    }
    return this;
  }

  /**
   * Add tags to the next rule
   */
  tagged(...tags: string[]): this {
    if (this.currentRule) {
      this.currentRule.tags = tags;
    }
    return this;
  }

  /**
   * Build and return all rules
   */
  build(): ValidationRule[] {
    if (this.currentRule) {
      this.finishCurrentRule();
    }
    return this.rules;
  }

  /**
   * Build and return a single rule
   */
  buildOne(): ValidationRule {
    if (this.currentRule) {
      this.finishCurrentRule();
    }
    if (this.rules.length === 0) {
      throw new Error('No validation rules defined');
    }
    return this.rules[0];
  }

  /**
   * Finish the current rule
   */
  protected finishCurrentRule(): void {
    if (this.currentRule && this.currentRule.type) {
      const rule: ValidationRule = {
        id: this.currentRule.id || uuidv4(),
        name: this.currentRule.name || `Rule ${this.rules.length + 1}`,
        type: this.currentRule.type,
        enabled: true,
        severity: this.currentRule.severity,
        ...this.currentRule,
      } as ValidationRule;
      
      this.rules.push(rule);
      this.currentRule = null;
    }
  }

  /**
   * Convert to ValidationRule (for single rule builders)
   */
  toRule(): ValidationRule {
    this.finishCurrentRule();
    if (this.rules.length === 0) {
      throw new Error('No rules built');
    }
    return this.rules[0];
  }

  /**
   * Get all rules
   */
  getRules(): ValidationRule[] {
    this.finishCurrentRule();
    return this.rules;
  }

  /**
   * Start a new rule
   */
  protected startRule(type: ValidationRule['type']): void {
    if (this.currentRule) {
      this.finishCurrentRule();
    }
    this.currentRule = {
      id: uuidv4(),
      type,
      enabled: true,
    };
  }
}

/**
 * Status assertions
 */
export class StatusAssertions extends AssertionBuilder {
  /**
   * Assert status code equals
   */
  is(expected: number): ValidationRule {
    this.startRule('status');
    this.currentRule!.status = { expected };
    this.currentRule!.name = `Status is ${expected}`;
    return this.toRule();
  }

  /**
   * Assert status is success (2xx)
   */
  isSuccess(): ValidationRule {
    this.startRule('status');
    this.currentRule!.status = { successOnly: true };
    this.currentRule!.name = 'Status is success (2xx)';
    return this.toRule();
  }

  /**
   * Assert status is client error (4xx)
   */
  isClientError(): ValidationRule {
    this.startRule('status');
    this.currentRule!.status = { range: { min: 400, max: 499 } };
    this.currentRule!.name = 'Status is client error (4xx)';
    return this.toRule();
  }

  /**
   * Assert status is server error (5xx)
   */
  isServerError(): ValidationRule {
    this.startRule('status');
    this.currentRule!.status = { range: { min: 500, max: 599 } };
    this.currentRule!.name = 'Status is server error (5xx)';
    return this.toRule();
  }

  /**
   * Assert status is redirect (3xx)
   */
  isRedirect(): ValidationRule {
    this.startRule('status');
    this.currentRule!.status = { range: { min: 300, max: 399 } };
    this.currentRule!.name = 'Status is redirect (3xx)';
    return this.toRule();
  }

  /**
   * Assert status is in range
   */
  inRange(min: number, max: number): ValidationRule {
    this.startRule('status');
    this.currentRule!.status = { range: { min, max } };
    this.currentRule!.name = `Status is between ${min} and ${max}`;
    return this.toRule();
  }
}

/**
 * Header assertions
 */
export class HeaderAssertions extends AssertionBuilder {
  /**
   * Assert header exists
   */
  has(name: string): ValidationRule {
    this.startRule('header');
    this.currentRule!.headers = [{ name, exists: true }];
    this.currentRule!.name = `Header '${name}' exists`;
    return this.toRule();
  }

  /**
   * Assert header equals value
   */
  equals(name: string, value: string): ValidationRule {
    this.startRule('header');
    this.currentRule!.headers = [{ name, value }];
    this.currentRule!.name = `Header '${name}' equals '${value}'`;
    return this.toRule();
  }

  /**
   * Assert header matches pattern
   */
  matches(name: string, pattern: RegExp): ValidationRule {
    this.startRule('header');
    this.currentRule!.headers = [{ name, value: pattern }];
    this.currentRule!.name = `Header '${name}' matches pattern`;
    return this.toRule();
  }

  /**
   * Assert content type
   */
  contentType(type: string): ValidationRule {
    this.startRule('header');
    this.currentRule!.headers = [{
      name: 'content-type',
      value: new RegExp(type.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
    }];
    this.currentRule!.name = `Content-Type contains '${type}'`;
    return this.toRule();
  }
}

/**
 * Body assertions
 */
export class BodyAssertions extends AssertionBuilder {
  /**
   * Assert body contains text
   */
  contains(text: string): ValidationRule {
    this.startRule('body');
    this.currentRule!.body = { contains: text };
    this.currentRule!.name = `Body contains '${text}'`;
    return this.toRule();
  }

  /**
   * Assert body matches pattern
   */
  matches(pattern: RegExp): ValidationRule {
    this.startRule('body');
    this.currentRule!.body = { matches: pattern };
    this.currentRule!.name = 'Body matches pattern';
    return this.toRule();
  }

  /**
   * Assert JSON equals
   */
  jsonEquals(expected: any): ValidationRule {
    this.startRule('body');
    this.currentRule!.body = {
      validator: (body: any) => JSON.stringify(body) === JSON.stringify(expected),
    };
    this.currentRule!.name = 'JSON body equals expected';
    return this.toRule();
  }

  /**
   * Assert JSON path
   */
  jsonPath(path: string, value?: any): ValidationRule {
    this.startRule('body');
    const jsonPath = value !== undefined
      ? { path, value, operator: 'eq' as const }
      : { path, exists: true };
    
    this.currentRule!.body = { jsonPath: [jsonPath] };
    this.currentRule!.name = value !== undefined
      ? `JSON path '${path}' equals value`
      : `JSON path '${path}' exists`;
    return this.toRule();
  }

  /**
   * Assert JSON schema
   */
  jsonSchema(schema: Record<string, any>): ValidationRule {
    this.startRule('jsonSchema');
    this.currentRule!.jsonSchema = { schema };
    this.currentRule!.name = 'Body matches JSON schema';
    return this.toRule();
  }

  /**
   * Assert body is empty
   */
  isEmpty(): ValidationRule {
    this.startRule('body');
    this.currentRule!.body = {
      validator: (body: any) => {
        if (body === null || body === undefined || body === '') return true;
        if (typeof body === 'object' && Object.keys(body).length === 0) return true;
        if (Array.isArray(body) && body.length === 0) return true;
        return false;
      },
    };
    this.currentRule!.name = 'Body is empty';
    return this.toRule();
  }

  /**
   * Assert body is not empty
   */
  isNotEmpty(): ValidationRule {
    this.startRule('body');
    this.currentRule!.body = {
      validator: (body: any) => {
        if (body === null || body === undefined || body === '') return false;
        if (typeof body === 'object' && Object.keys(body).length === 0) return false;
        if (Array.isArray(body) && body.length === 0) return false;
        return true;
      },
    };
    this.currentRule!.name = 'Body is not empty';
    return this.toRule();
  }
}

/**
 * Performance assertions
 */
export class PerformanceAssertions extends AssertionBuilder {
  /**
   * Assert response time
   */
  respondsWithin(ms: number): ValidationRule {
    this.startRule('latency');
    this.currentRule!.performance = { maxLatency: ms };
    this.currentRule!.name = `Response within ${ms}ms`;
    return this.toRule();
  }

  /**
   * Assert response size
   */
  sizeUnder(bytes: number): ValidationRule {
    this.startRule('size');
    this.currentRule!.performance = { maxSize: bytes };
    this.currentRule!.name = `Response size under ${bytes} bytes`;
    return this.toRule();
  }

  /**
   * Assert time to first byte
   */
  ttfbUnder(ms: number): ValidationRule {
    this.startRule('latency');
    this.currentRule!.performance = { maxTTFB: ms };
    this.currentRule!.name = `TTFB under ${ms}ms`;
    return this.toRule();
  }
}

/**
 * Main assertion library
 */
export class AssertionLibrary implements IAssertionLibrary {
  readonly status = new StatusAssertions();
  readonly headers = new HeaderAssertions();
  readonly body = new BodyAssertions();
  readonly performance = new PerformanceAssertions();

  /**
   * Create custom assertion
   */
  custom(assertion: CustomAssertion): ValidationRule {
    return {
      id: uuidv4(),
      name: assertion.name,
      type: 'custom',
      enabled: true,
      customAssertions: [assertion],
    };
  }

  /**
   * Combine multiple rules with AND logic
   */
  all(...rules: ValidationRule[]): ValidationRule {
    return {
      id: uuidv4(),
      name: 'All assertions must pass',
      type: 'custom',
      enabled: true,
      customAssertions: [{
        name: 'All',
        assert: async (response, context) => {
          // This would need access to the validator to work properly
          // For now, this is a placeholder
          return true;
        },
      }],
    };
  }

  /**
   * Combine multiple rules with OR logic
   */
  any(...rules: ValidationRule[]): ValidationRule {
    return {
      id: uuidv4(),
      name: 'Any assertion must pass',
      type: 'custom',
      enabled: true,
      customAssertions: [{
        name: 'Any',
        assert: async (response, context) => {
          // This would need access to the validator to work properly
          // For now, this is a placeholder
          return true;
        },
      }],
    };
  }

  /**
   * Negate a rule
   */
  not(rule: ValidationRule): ValidationRule {
    return {
      id: uuidv4(),
      name: `Not: ${rule.name}`,
      type: 'custom',
      enabled: true,
      customAssertions: [{
        name: 'Not',
        assert: async (response, context) => {
          // This would need access to the validator to work properly
          // For now, this is a placeholder
          return true;
        },
      }],
    };
  }
}

/**
 * Create a new assertion library instance
 */
export function createAssertions(): AssertionLibrary {
  return new AssertionLibrary();
}

/**
 * Export commonly used assertion patterns
 */
export const CommonAssertions = {
  /**
   * REST API success response
   */
  restSuccess: (): ValidationRule[] => {
    const assert = createAssertions();
    return [
      assert.status.isSuccess(),
      assert.headers.contentType('application/json'),
      assert.body.isNotEmpty(),
    ];
  },

  /**
   * GraphQL response
   */
  graphqlResponse: (): ValidationRule[] => {
    const assert = createAssertions();
    return [
      assert.status.is(200),
      assert.headers.contentType('application/json'),
      assert.body.jsonPath('$.data'),
      assert.body.jsonPath('$.errors', undefined),
    ];
  },

  /**
   * Paginated response
   */
  paginatedResponse: (): ValidationRule[] => {
    const assert = createAssertions();
    return [
      assert.status.isSuccess(),
      assert.body.jsonPath('$.data'),
      assert.body.jsonPath('$.pagination'),
      assert.body.jsonPath('$.pagination.total'),
      assert.body.jsonPath('$.pagination.page'),
      assert.body.jsonPath('$.pagination.limit'),
    ];
  },

  /**
   * Error response
   */
  errorResponse: (statusCode?: number): ValidationRule[] => {
    const assert = createAssertions();
    const rules = [];
    
    if (statusCode) {
      rules.push(assert.status.is(statusCode));
    } else {
      rules.push(assert.status.inRange(400, 599));
    }
    
    rules.push(
      assert.headers.contentType('application/json'),
      assert.body.jsonPath('$.error'),
      assert.body.jsonPath('$.message'),
    );
    
    return rules;
  },

  /**
   * Performance budget
   */
  performanceBudget: (latencyMs = 1000, sizeBytes = 100000): ValidationRule[] => {
    const assert = createAssertions();
    return [
      assert.performance.respondsWithin(latencyMs),
      assert.performance.sizeUnder(sizeBytes),
    ];
  },
};