/**
 * Response Validation Types
 */

import type { ResponseData, ValidationError } from './index';

/**
 * Validation rule types
 */
export type ValidationRuleType = 
  | 'status'
  | 'header'
  | 'body'
  | 'jsonSchema'
  | 'custom'
  | 'latency'
  | 'size';

/**
 * Validation severity levels
 */
export type ValidationSeverity = 'error' | 'warning' | 'info';

/**
 * JSON Schema validation
 */
export interface JsonSchemaValidation {
  /**
   * JSON Schema object
   */
  schema: Record<string, any>;
  
  /**
   * Strict mode (no additional properties)
   */
  strict?: boolean;
  
  /**
   * Path to validate (for nested objects)
   */
  path?: string;
}

/**
 * Header validation
 */
export interface HeaderValidation {
  /**
   * Header name
   */
  name: string;
  
  /**
   * Expected value or pattern
   */
  value?: string | RegExp;
  
  /**
   * Should header exist?
   */
  exists?: boolean;
  
  /**
   * Custom validator function
   */
  validator?: (value: string | undefined) => boolean;
}

/**
 * Status code validation
 */
export interface StatusValidation {
  /**
   * Expected status code(s)
   */
  expected?: number | number[];
  
  /**
   * Status range (e.g., 200-299)
   */
  range?: {
    min: number;
    max: number;
  };
  
  /**
   * Success codes only (2xx)
   */
  successOnly?: boolean;
}

/**
 * Body validation
 */
export interface BodyValidation {
  /**
   * Expected content type
   */
  contentType?: string;
  
  /**
   * Contains text
   */
  contains?: string | string[];
  
  /**
   * Matches pattern
   */
  matches?: RegExp;
  
  /**
   * JSON path assertions
   */
  jsonPath?: Array<{
    path: string;
    value?: any;
    exists?: boolean;
    type?: string;
    operator?: 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte' | 'in' | 'nin' | 'contains';
  }>;
  
  /**
   * Custom validator
   */
  validator?: (body: any) => boolean;
}

/**
 * Performance validation
 */
export interface PerformanceValidation {
  /**
   * Maximum latency in ms
   */
  maxLatency?: number;
  
  /**
   * Maximum response size in bytes
   */
  maxSize?: number;
  
  /**
   * Time to first byte in ms
   */
  maxTTFB?: number;
}

/**
 * Custom assertion
 */
export interface CustomAssertion {
  /**
   * Assertion name
   */
  name: string;
  
  /**
   * Description
   */
  description?: string;
  
  /**
   * Assertion function
   */
  assert: (response: ResponseData, context?: ValidationContext) => boolean | Promise<boolean>;
  
  /**
   * Error message generator
   */
  errorMessage?: (response: ResponseData) => string;
}

/**
 * Validation rule
 */
export interface ValidationRule {
  /**
   * Rule ID
   */
  id: string;
  
  /**
   * Rule name
   */
  name: string;
  
  /**
   * Rule type
   */
  type: ValidationRuleType;
  
  /**
   * Is rule enabled?
   */
  enabled?: boolean;
  
  /**
   * Severity level
   */
  severity?: ValidationSeverity;
  
  /**
   * Status validation
   */
  status?: StatusValidation;
  
  /**
   * Header validations
   */
  headers?: HeaderValidation[];
  
  /**
   * Body validation
   */
  body?: BodyValidation;
  
  /**
   * JSON Schema validation
   */
  jsonSchema?: JsonSchemaValidation;
  
  /**
   * Performance validation
   */
  performance?: PerformanceValidation;
  
  /**
   * Custom assertions
   */
  customAssertions?: CustomAssertion[];
  
  /**
   * Skip rule if condition met
   */
  skipIf?: (response: ResponseData) => boolean;
  
  /**
   * Tags
   */
  tags?: string[];
}

/**
 * Validation context
 */
export interface ValidationContext {
  /**
   * Request duration in ms
   */
  duration?: number;
  
  /**
   * Response size in bytes
   */
  size?: number;
  
  /**
   * Environment variables
   */
  environment?: Record<string, any>;
  
  /**
   * Previous responses (for chained validations)
   */
  previousResponses?: ResponseData[];
  
  /**
   * Custom context data
   */
  customData?: Record<string, any>;
}

/**
 * Validation result
 */
export interface ValidationResult {
  /**
   * Overall validation passed?
   */
  valid: boolean;
  
  /**
   * Individual rule results
   */
  results: ValidationRuleResult[];
  
  /**
   * Summary
   */
  summary: {
    total: number;
    passed: number;
    failed: number;
    skipped: number;
    errors: number;
    warnings: number;
  };
  
  /**
   * Execution time in ms
   */
  duration: number;
  
  /**
   * Timestamp
   */
  timestamp: Date;
}

/**
 * Individual rule result
 */
export interface ValidationRuleResult {
  /**
   * Rule ID
   */
  ruleId: string;
  
  /**
   * Rule name
   */
  ruleName: string;
  
  /**
   * Rule type
   */
  ruleType: ValidationRuleType;
  
  /**
   * Did validation pass?
   */
  passed: boolean;
  
  /**
   * Was rule skipped?
   */
  skipped?: boolean;
  
  /**
   * Skip reason
   */
  skipReason?: string;
  
  /**
   * Severity
   */
  severity: ValidationSeverity;
  
  /**
   * Error details
   */
  errors?: ValidationError[];
  
  /**
   * Execution time in ms
   */
  duration?: number;
  
  /**
   * Actual vs expected values
   */
  details?: {
    expected?: any;
    actual?: any;
    path?: string;
    message?: string;
  };
}

// ValidationError is imported from index.ts to avoid circular dependencies

/**
 * Validation profile
 */
export interface ValidationProfile {
  /**
   * Profile ID
   */
  id: string;
  
  /**
   * Profile name
   */
  name: string;
  
  /**
   * Description
   */
  description?: string;
  
  /**
   * Validation rules
   */
  rules: ValidationRule[];
  
  /**
   * Default severity for rules without explicit severity
   */
  defaultSeverity?: ValidationSeverity;
  
  /**
   * Stop on first error?
   */
  stopOnFirstError?: boolean;
  
  /**
   * Timeout for validation in ms
   */
  timeout?: number;
  
  /**
   * Tags
   */
  tags?: string[];
  
  /**
   * Created date
   */
  createdAt: Date;
  
  /**
   * Updated date
   */
  updatedAt: Date;
}

/**
 * Validation template
 */
export interface ValidationTemplate {
  /**
   * Template ID
   */
  id: string;
  
  /**
   * Template name
   */
  name: string;
  
  /**
   * Template category
   */
  category: 'rest' | 'graphql' | 'soap' | 'websocket' | 'custom';
  
  /**
   * Pre-defined rules
   */
  rules: ValidationRule[];
  
  /**
   * Variables for customization
   */
  variables?: Array<{
    name: string;
    description?: string;
    type: 'string' | 'number' | 'boolean' | 'array' | 'object';
    default?: any;
    required?: boolean;
  }>;
  
  /**
   * Example usage
   */
  example?: {
    response: ResponseData;
    expectedResult: ValidationResult;
  };
}

/**
 * Assertion library
 */
export interface AssertionLibrary {
  /**
   * Status assertions
   */
  status: {
    is(expected: number): ValidationRule;
    isSuccess(): ValidationRule;
    isClientError(): ValidationRule;
    isServerError(): ValidationRule;
    isRedirect(): ValidationRule;
    inRange(min: number, max: number): ValidationRule;
  };
  
  /**
   * Header assertions
   */
  headers: {
    has(name: string): ValidationRule;
    equals(name: string, value: string): ValidationRule;
    matches(name: string, pattern: RegExp): ValidationRule;
    contentType(type: string): ValidationRule;
  };
  
  /**
   * Body assertions
   */
  body: {
    contains(text: string): ValidationRule;
    matches(pattern: RegExp): ValidationRule;
    jsonEquals(expected: any): ValidationRule;
    jsonPath(path: string, value?: any): ValidationRule;
    jsonSchema(schema: Record<string, any>): ValidationRule;
    isEmpty(): ValidationRule;
    isNotEmpty(): ValidationRule;
  };
  
  /**
   * Performance assertions
   */
  performance: {
    respondsWithin(ms: number): ValidationRule;
    sizeUnder(bytes: number): ValidationRule;
    ttfbUnder(ms: number): ValidationRule;
  };
  
  /**
   * Custom assertion builder
   */
  custom(assertion: CustomAssertion): ValidationRule;
  
  /**
   * Combine multiple assertions
   */
  all(...rules: ValidationRule[]): ValidationRule;
  any(...rules: ValidationRule[]): ValidationRule;
  not(rule: ValidationRule): ValidationRule;
}

/**
 * Validation options
 */
export interface ValidationOptions {
  /**
   * Validation profile to use
   */
  profileId?: string;
  
  /**
   * Additional rules to apply
   */
  additionalRules?: ValidationRule[];
  
  /**
   * Rules to skip
   */
  skipRules?: string[];
  
  /**
   * Validation context
   */
  context?: ValidationContext;
  
  /**
   * Timeout in ms
   */
  timeout?: number;
  
  /**
   * Continue on error
   */
  continueOnError?: boolean;
  
  /**
   * Verbose output
   */
  verbose?: boolean;
}