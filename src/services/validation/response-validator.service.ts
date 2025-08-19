/**
 * Response Validator Service
 * Validates API responses against defined rules and schemas
 */

import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import { JSONPath } from 'jsonpath-plus';
import type {
  ResponseData,
  ValidationRule,
  ValidationResult,
  ValidationRuleResult,
  ValidationContext,
  ValidationOptions,
  ValidationError,
  JsonSchemaValidation,
  ValidationSeverity,
} from '../../types';
import { ErrorHandler } from '../../utils/errors';
import { Logger } from '../../utils/logger';

export class ResponseValidator {
  private ajv: Ajv;
  private errorHandler: ErrorHandler;
  private logger: Logger;

  constructor(
    errorHandler: ErrorHandler = new ErrorHandler(),
    logger: Logger = new Logger('ResponseValidator')
  ) {
    this.errorHandler = errorHandler;
    this.logger = logger;
    
    // Initialize AJV with formats
    this.ajv = new Ajv({
      allErrors: true,
      verbose: true,
      strict: false,
    });
    addFormats(this.ajv);
  }

  /**
   * Validate a response against rules
   */
  async validate(
    response: ResponseData,
    rules: ValidationRule[],
    options: ValidationOptions = {}
  ): Promise<ValidationResult> {
    const startTime = Date.now();
    const results: ValidationRuleResult[] = [];
    const enabledRules = this.filterEnabledRules(rules, options);
    
    this.logger.debug(`Validating response against ${enabledRules.length} rules`);
    
    for (const rule of enabledRules) {
      // Check if we should stop on first error
      if (options.continueOnError === false && results.some(r => !r.passed)) {
        break;
      }
      
      // Validate with timeout
      const ruleResult = await this.validateRule(response, rule, options);
      results.push(ruleResult);
      
      // Log based on severity
      if (!ruleResult.passed && !ruleResult.skipped) {
        this.logValidationFailure(rule, ruleResult);
      }
    }
    
    const duration = Date.now() - startTime;
    return this.createValidationResult(results, duration, response);
  }

  /**
   * Validate a single rule
   */
  private async validateRule(
    response: ResponseData,
    rule: ValidationRule,
    options: ValidationOptions
  ): Promise<ValidationRuleResult> {
    const startTime = Date.now();
    
    // Check skip condition
    if (rule.skipIf && rule.skipIf(response)) {
      return this.createSkippedResult(rule, 'Skip condition met');
    }
    
    const errors: ValidationError[] = [];
    let passed = true;
    
    try {
      // Validate based on rule type
      switch (rule.type) {
        case 'status':
          if (rule.status) {
            const statusErrors = this.validateStatus(response, rule.status);
            errors.push(...statusErrors);
            passed = errors.length === 0;
          }
          break;
          
        case 'header':
          if (rule.headers) {
            const headerErrors = this.validateHeaders(response, rule.headers);
            errors.push(...headerErrors);
            passed = errors.length === 0;
          }
          break;
          
        case 'body':
          if (rule.body) {
            const bodyErrors = await this.validateBody(response, rule.body);
            errors.push(...bodyErrors);
            passed = errors.length === 0;
          }
          break;
          
        case 'jsonSchema':
          if (rule.jsonSchema) {
            const schemaErrors = this.validateJsonSchema(response, rule.jsonSchema);
            errors.push(...schemaErrors);
            passed = errors.length === 0;
          }
          break;
          
        case 'custom':
          if (rule.customAssertions) {
            const customErrors = await this.validateCustomAssertions(
              response,
              rule.customAssertions,
              options.context
            );
            errors.push(...customErrors);
            passed = errors.length === 0;
          }
          break;
          
        case 'latency':
        case 'size':
          if (rule.performance && options.context) {
            const perfErrors = this.validatePerformance(
              response,
              rule.performance,
              options.context
            );
            errors.push(...perfErrors);
            passed = errors.length === 0;
          }
          break;
      }
    } catch (error) {
      this.logger.error(`Error validating rule ${rule.id}:`, error);
      errors.push({ type: 'assertion',
        code: 'VALIDATION_ERROR',
        message: `Validation failed: ${error instanceof Error ? error.message : String(error)}`,
      });
      passed = false;
    }
    
    const duration = Date.now() - startTime;
    
    return {
      ruleId: rule.id,
      ruleName: rule.name,
      ruleType: rule.type,
      passed,
      severity: rule.severity || 'error',
      errors: errors.length > 0 ? errors : undefined,
      duration,
    };
  }

  /**
   * Validate status code
   */
  private validateStatus(
    response: ResponseData,
    validation: NonNullable<ValidationRule['status']>
  ): ValidationError[] {
    const errors: ValidationError[] = [];
    const actualStatus = response.status;
    
    if (validation.expected !== undefined) {
      const expectedStatuses = Array.isArray(validation.expected)
        ? validation.expected
        : [validation.expected];
      
      if (!expectedStatuses.includes(actualStatus)) {
        errors.push({ type: 'assertion',
          code: 'STATUS_MISMATCH',
          message: `Expected status ${expectedStatuses.join(' or ')}, got ${actualStatus}`,
          expected: expectedStatuses,
          actual: actualStatus,
        });
      }
    }
    
    if (validation.range) {
      if (actualStatus < validation.range.min || actualStatus > validation.range.max) {
        errors.push({ type: 'assertion',
          code: 'STATUS_OUT_OF_RANGE',
          message: `Status ${actualStatus} is outside range ${validation.range.min}-${validation.range.max}`,
          expected: validation.range,
          actual: actualStatus,
        });
      }
    }
    
    if (validation.successOnly && (actualStatus < 200 || actualStatus >= 300)) {
      errors.push({ type: 'assertion',
        code: 'STATUS_NOT_SUCCESS',
        message: `Expected success status (2xx), got ${actualStatus}`,
        actual: actualStatus,
      });
    }
    
    return errors;
  }

  /**
   * Validate headers
   */
  private validateHeaders(
    response: ResponseData,
    validations: NonNullable<ValidationRule['headers']>
  ): ValidationError[] {
    const errors: ValidationError[] = [];
    
    for (const validation of validations) {
      const actualValue = response.headers?.[validation.name.toLowerCase()];
      
      if (validation.exists !== undefined) {
        const exists = actualValue !== undefined;
        if (exists !== validation.exists) {
          errors.push({ type: 'assertion',
            code: 'HEADER_EXISTENCE',
            message: `Header '${validation.name}' ${validation.exists ? 'should exist' : 'should not exist'}`,
            path: `headers.${validation.name}`,
            expected: validation.exists,
            actual: exists,
          });
        }
      }
      
      if (validation.value !== undefined && actualValue !== undefined) {
        const expected = validation.value;
        const matches = expected instanceof RegExp
          ? expected.test(actualValue)
          : actualValue === expected;
        
        if (!matches) {
          errors.push({ type: 'assertion',
            code: 'HEADER_VALUE_MISMATCH',
            message: `Header '${validation.name}' value mismatch`,
            path: `headers.${validation.name}`,
            expected: expected.toString(),
            actual: actualValue,
          });
        }
      }
      
      if (validation.validator && actualValue !== undefined) {
        if (!validation.validator(actualValue)) {
          errors.push({ type: 'assertion',
            code: 'HEADER_VALIDATION_FAILED',
            message: `Header '${validation.name}' failed custom validation`,
            path: `headers.${validation.name}`,
            actual: actualValue,
          });
        }
      }
    }
    
    return errors;
  }

  /**
   * Validate response body
   */
  private async validateBody(
    response: ResponseData,
    validation: NonNullable<ValidationRule['body']>
  ): Promise<ValidationError[]> {
    const errors: ValidationError[] = [];
    const body = response.body;
    
    // Content type validation
    if (validation.contentType) {
      const actualType = response.headers?.['content-type'];
      if (!actualType?.includes(validation.contentType)) {
        errors.push({ type: 'assertion',
          code: 'CONTENT_TYPE_MISMATCH',
          message: `Expected content-type ${validation.contentType}`,
          expected: validation.contentType,
          actual: actualType,
        });
      }
    }
    
    // Text content validation
    if (validation.contains) {
      const bodyStr = typeof body === 'string' ? body : JSON.stringify(body);
      const searchTerms = Array.isArray(validation.contains)
        ? validation.contains
        : [validation.contains];
      
      for (const term of searchTerms) {
        if (!bodyStr.includes(term)) {
          errors.push({ type: 'assertion',
            code: 'BODY_MISSING_CONTENT',
            message: `Body does not contain '${term}'`,
            expected: term,
          });
        }
      }
    }
    
    // Pattern matching
    if (validation.matches) {
      const bodyStr = typeof body === 'string' ? body : JSON.stringify(body);
      if (!validation.matches.test(bodyStr)) {
        errors.push({ type: 'assertion',
          code: 'BODY_PATTERN_MISMATCH',
          message: `Body does not match pattern ${validation.matches}`,
          expected: validation.matches.toString(),
        });
      }
    }
    
    // JSON path validation
    if (validation.jsonPath && typeof body === 'object') {
      for (const assertion of validation.jsonPath) {
        const results = JSONPath({
          path: assertion.path,
          json: body,
        });
        
        if (assertion.exists !== undefined) {
          const exists = results.length > 0;
          if (exists !== assertion.exists) {
            errors.push({ type: 'assertion',
              code: 'JSON_PATH_EXISTENCE',
              message: `Path '${assertion.path}' ${assertion.exists ? 'should exist' : 'should not exist'}`,
              path: assertion.path,
              expected: assertion.exists,
              actual: exists,
            });
          }
        }
        
        if (assertion.value !== undefined && results.length > 0) {
          const actualValue = results[0];
          if (!this.compareValues(actualValue, assertion.value, assertion.operator)) {
            errors.push({ type: 'assertion',
              code: 'JSON_PATH_VALUE_MISMATCH',
              message: `Path '${assertion.path}' value mismatch`,
              path: assertion.path,
              expected: assertion.value,
              actual: actualValue,
            });
          }
        }
        
        if (assertion.type && results.length > 0) {
          const actualType = typeof results[0];
          if (actualType !== assertion.type) {
            errors.push({ type: 'assertion',
              code: 'JSON_PATH_TYPE_MISMATCH',
              message: `Path '${assertion.path}' type mismatch`,
              path: assertion.path,
              expected: assertion.type,
              actual: actualType,
            });
          }
        }
      }
    }
    
    // Custom validator
    if (validation.validator) {
      if (!validation.validator(body)) {
        errors.push({ type: 'assertion',
          code: 'BODY_VALIDATION_FAILED',
          message: 'Body failed custom validation',
        });
      }
    }
    
    return errors;
  }

  /**
   * Validate JSON schema
   */
  private validateJsonSchema(
    response: ResponseData,
    validation: JsonSchemaValidation
  ): ValidationError[] {
    const errors: ValidationError[] = [];
    
    // Get the data to validate
    let data = response.body;
    if (validation.path) {
      const results = JSONPath({
        path: validation.path,
        json: response.body,
      });
      if (results.length === 0) {
        errors.push({ type: 'assertion',
          code: 'JSON_SCHEMA_PATH_NOT_FOUND',
          message: `Path '${validation.path}' not found for schema validation`,
          path: validation.path,
        });
        return errors;
      }
      data = results[0];
    }
    
    // Compile and validate schema
    try {
      const validate = this.ajv.compile(validation.schema);
      const valid = validate(data);
      
      if (!valid && validate.errors) {
        for (const error of validate.errors) {
          errors.push({ type: 'assertion',
            code: 'JSON_SCHEMA_VALIDATION_FAILED',
            message: error.message || 'Schema validation failed',
            path: error.instancePath,
            expected: error.params,
            actual: error.data,
            context: {
              keyword: error.keyword,
              schemaPath: error.schemaPath,
            },
          });
        }
      }
    } catch (error) {
      errors.push({ type: 'assertion',
        code: 'JSON_SCHEMA_ERROR',
        message: `Schema validation error: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
    
    return errors;
  }

  /**
   * Validate custom assertions
   */
  private async validateCustomAssertions(
    response: ResponseData,
    assertions: NonNullable<ValidationRule['customAssertions']>,
    context?: ValidationContext
  ): Promise<ValidationError[]> {
    const errors: ValidationError[] = [];
    
    for (const assertion of assertions) {
      try {
        const result = await assertion.assert(response, context);
        if (!result) {
          const message = assertion.errorMessage
            ? assertion.errorMessage(response)
            : `Custom assertion '${assertion.name}' failed`;
          
          errors.push({ type: 'assertion',
            code: 'CUSTOM_ASSERTION_FAILED',
            message,
            context: { assertionName: assertion.name },
          });
        }
      } catch (error) {
        errors.push({ type: 'assertion',
          code: 'CUSTOM_ASSERTION_ERROR',
          message: `Error in custom assertion '${assertion.name}': ${
            error instanceof Error ? error.message : String(error)
          }`,
        });
      }
    }
    
    return errors;
  }

  /**
   * Validate performance metrics
   */
  private validatePerformance(
    response: ResponseData,
    validation: NonNullable<ValidationRule['performance']>,
    context: ValidationContext
  ): ValidationError[] {
    const errors: ValidationError[] = [];
    
    if (validation.maxLatency && context.duration) {
      if (context.duration > validation.maxLatency) {
        errors.push({ type: 'assertion',
          code: 'LATENCY_EXCEEDED',
          message: `Response latency ${context.duration}ms exceeds maximum ${validation.maxLatency}ms`,
          expected: validation.maxLatency,
          actual: context.duration,
        });
      }
    }
    
    if (validation.maxSize && context.size) {
      if (context.size > validation.maxSize) {
        errors.push({ type: 'assertion',
          code: 'SIZE_EXCEEDED',
          message: `Response size ${context.size} bytes exceeds maximum ${validation.maxSize} bytes`,
          expected: validation.maxSize,
          actual: context.size,
        });
      }
    }
    
    // Note: TTFB would require additional timing information not currently available
    
    return errors;
  }

  /**
   * Compare values with operator
   */
  private compareValues(actual: any, expected: any, operator?: string): boolean {
    switch (operator) {
      case 'eq':
      default:
        return actual === expected;
      case 'ne':
        return actual !== expected;
      case 'gt':
        return actual > expected;
      case 'gte':
        return actual >= expected;
      case 'lt':
        return actual < expected;
      case 'lte':
        return actual <= expected;
      case 'in':
        return Array.isArray(expected) && expected.includes(actual);
      case 'nin':
        return Array.isArray(expected) && !expected.includes(actual);
      case 'contains':
        return String(actual).includes(String(expected));
    }
  }

  /**
   * Filter enabled rules
   */
  private filterEnabledRules(
    rules: ValidationRule[],
    options: ValidationOptions
  ): ValidationRule[] {
    let filteredRules = rules.filter(rule => rule.enabled !== false);
    
    // Skip specific rules
    if (options.skipRules && options.skipRules.length > 0) {
      filteredRules = filteredRules.filter(
        rule => !options.skipRules!.includes(rule.id)
      );
    }
    
    // Add additional rules
    if (options.additionalRules) {
      filteredRules.push(...options.additionalRules);
    }
    
    return filteredRules;
  }

  /**
   * Create validation result
   */
  private createValidationResult(
    results: ValidationRuleResult[],
    duration: number,
    response: ResponseData
  ): ValidationResult {
    const summary = {
      total: results.length,
      passed: results.filter(r => r.passed && !r.skipped).length,
      failed: results.filter(r => !r.passed && !r.skipped).length,
      skipped: results.filter(r => r.skipped).length,
      errors: results.filter(r => !r.passed && r.severity === 'error').length,
      warnings: results.filter(r => !r.passed && r.severity === 'warning').length,
    };
    
    return {
      valid: summary.errors === 0,
      errors: results.flatMap(r => r.errors || []),
      response: response,
      results,
      summary,
      duration,
      timestamp: new Date(),
    };
  }

  /**
   * Create skipped result
   */
  private createSkippedResult(
    rule: ValidationRule,
    reason: string
  ): ValidationRuleResult {
    return {
      ruleId: rule.id,
      ruleName: rule.name,
      ruleType: rule.type,
      passed: true,
      skipped: true,
      skipReason: reason,
      severity: rule.severity || 'error',
    };
  }

  /**
   * Log validation failure
   */
  private logValidationFailure(
    rule: ValidationRule,
    result: ValidationRuleResult
  ): void {
    const message = `Validation failed for rule '${rule.name}' (${rule.type})`;
    
    switch (result.severity) {
      case 'error':
        this.logger.error(message, result.errors);
        break;
      case 'warning':
        this.logger.warn(message, result.errors);
        break;
      case 'info':
        this.logger.info(message, result.errors);
        break;
    }
  }
}