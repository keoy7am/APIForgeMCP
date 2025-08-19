/**
 * Tests for Response Validator Service
 */

import { jest } from '@jest/globals';
import { ResponseValidator } from '../../../src/services/validation/response-validator.service';
import { createAssertions, CommonAssertions } from '../../../src/services/validation/assertion-library';
import { TestDataFactory } from '../../utils/test-utils';
import type {
  ResponseData,
  ValidationRule,
  ValidationResult,
  ValidationContext,
  ValidationOptions,
} from '../../../src/types';

describe('Response Validator Service', () => {
  let validator: ResponseValidator;

  beforeEach(() => {
    validator = new ResponseValidator();
  });

  describe('Status Validation', () => {
    it('should validate status equals', async () => {
      const response: ResponseData = {
        status: 200,
        statusText: 'OK',
        headers: {},
        body: {},
        timestamp: new Date(),
      };

      const rule: ValidationRule = {
        id: 'status-check',
        name: 'Status is 200',
        type: 'status',
        status: { expected: 200 },
      };

      const result = await validator.validate(response, [rule]);
      
      expect(result.valid).toBe(true);
      expect(result.results[0].passed).toBe(true);
    });

    it('should fail on status mismatch', async () => {
      const response: ResponseData = {
        status: 404,
        statusText: 'Not Found',
        headers: {},
        body: {},
        timestamp: new Date(),
      };

      const rule: ValidationRule = {
        id: 'status-check',
        name: 'Status is 200',
        type: 'status',
        status: { expected: 200 },
      };

      const result = await validator.validate(response, [rule]);
      
      expect(result.valid).toBe(false);
      expect(result.results[0].passed).toBe(false);
      expect(result.results[0].errors).toHaveLength(1);
      expect(result.results[0].errors![0].code).toBe('STATUS_MISMATCH');
    });

    it('should validate status in range', async () => {
      const response: ResponseData = {
        status: 201,
        statusText: 'Created',
        headers: {},
        body: {},
        timestamp: new Date(),
      };

      const rule: ValidationRule = {
        id: 'status-range',
        name: 'Status is 2xx',
        type: 'status',
        status: { range: { min: 200, max: 299 } },
      };

      const result = await validator.validate(response, [rule]);
      
      expect(result.valid).toBe(true);
      expect(result.results[0].passed).toBe(true);
    });

    it('should validate success only', async () => {
      const response: ResponseData = {
        status: 200,
        statusText: 'OK',
        headers: {},
        body: {},
        timestamp: new Date(),
      };

      const rule: ValidationRule = {
        id: 'success-only',
        name: 'Success only',
        type: 'status',
        status: { successOnly: true },
      };

      const result = await validator.validate(response, [rule]);
      
      expect(result.valid).toBe(true);
      expect(result.results[0].passed).toBe(true);
    });
  });

  describe('Header Validation', () => {
    it('should validate header exists', async () => {
      const response: ResponseData = {
        status: 200,
        statusText: 'OK',
        headers: {
          'content-type': 'application/json',
        },
        body: {},
        timestamp: new Date(),
      };

      const rule: ValidationRule = {
        id: 'header-exists',
        name: 'Content-Type exists',
        type: 'header',
        headers: [{
          name: 'content-type',
          exists: true,
        }],
      };

      const result = await validator.validate(response, [rule]);
      
      expect(result.valid).toBe(true);
      expect(result.results[0].passed).toBe(true);
    });

    it('should validate header value', async () => {
      const response: ResponseData = {
        status: 200,
        statusText: 'OK',
        headers: {
          'content-type': 'application/json',
        },
        body: {},
        timestamp: new Date(),
      };

      const rule: ValidationRule = {
        id: 'header-value',
        name: 'Content-Type is JSON',
        type: 'header',
        headers: [{
          name: 'content-type',
          value: 'application/json',
        }],
      };

      const result = await validator.validate(response, [rule]);
      
      expect(result.valid).toBe(true);
      expect(result.results[0].passed).toBe(true);
    });

    it('should validate header pattern', async () => {
      const response: ResponseData = {
        status: 200,
        statusText: 'OK',
        headers: {
          'content-type': 'application/json; charset=utf-8',
        },
        body: {},
        timestamp: new Date(),
      };

      const rule: ValidationRule = {
        id: 'header-pattern',
        name: 'Content-Type contains JSON',
        type: 'header',
        headers: [{
          name: 'content-type',
          value: /application\/json/,
        }],
      };

      const result = await validator.validate(response, [rule]);
      
      expect(result.valid).toBe(true);
      expect(result.results[0].passed).toBe(true);
    });
  });

  describe('Body Validation', () => {
    it('should validate body contains text', async () => {
      const response: ResponseData = {
        status: 200,
        statusText: 'OK',
        headers: {},
        body: 'Hello World',
        timestamp: new Date(),
      };

      const rule: ValidationRule = {
        id: 'body-contains',
        name: 'Body contains Hello',
        type: 'body',
        body: {
          contains: 'Hello',
        },
      };

      const result = await validator.validate(response, [rule]);
      
      expect(result.valid).toBe(true);
      expect(result.results[0].passed).toBe(true);
    });

    it('should validate JSON path exists', async () => {
      const response: ResponseData = {
        status: 200,
        statusText: 'OK',
        headers: {},
        body: {
          data: {
            id: 1,
            name: 'Test',
          },
        },
        timestamp: new Date(),
      };

      const rule: ValidationRule = {
        id: 'json-path',
        name: 'Data ID exists',
        type: 'body',
        body: {
          jsonPath: [{
            path: '$.data.id',
            exists: true,
          }],
        },
      };

      const result = await validator.validate(response, [rule]);
      
      expect(result.valid).toBe(true);
      expect(result.results[0].passed).toBe(true);
    });

    it('should validate JSON path value', async () => {
      const response: ResponseData = {
        status: 200,
        statusText: 'OK',
        headers: {},
        body: {
          data: {
            id: 1,
            name: 'Test',
          },
        },
        timestamp: new Date(),
      };

      const rule: ValidationRule = {
        id: 'json-path-value',
        name: 'Data name equals Test',
        type: 'body',
        body: {
          jsonPath: [{
            path: '$.data.name',
            value: 'Test',
          }],
        },
      };

      const result = await validator.validate(response, [rule]);
      
      expect(result.valid).toBe(true);
      expect(result.results[0].passed).toBe(true);
    });

    it('should validate JSON path type', async () => {
      const response: ResponseData = {
        status: 200,
        statusText: 'OK',
        headers: {},
        body: {
          data: {
            id: 1,
            name: 'Test',
          },
        },
        timestamp: new Date(),
      };

      const rule: ValidationRule = {
        id: 'json-path-type',
        name: 'Data ID is number',
        type: 'body',
        body: {
          jsonPath: [{
            path: '$.data.id',
            type: 'number',
          }],
        },
      };

      const result = await validator.validate(response, [rule]);
      
      expect(result.valid).toBe(true);
      expect(result.results[0].passed).toBe(true);
    });
  });

  describe('JSON Schema Validation', () => {
    it('should validate against JSON schema', async () => {
      const response: ResponseData = {
        status: 200,
        statusText: 'OK',
        headers: {},
        body: {
          id: 1,
          name: 'Test User',
          email: 'test@example.com',
        },
        timestamp: new Date(),
      };

      const rule: ValidationRule = {
        id: 'json-schema',
        name: 'User schema',
        type: 'jsonSchema',
        jsonSchema: {
          schema: {
            type: 'object',
            properties: {
              id: { type: 'number' },
              name: { type: 'string' },
              email: { type: 'string', format: 'email' },
            },
            required: ['id', 'name', 'email'],
          },
        },
      };

      const result = await validator.validate(response, [rule]);
      
      expect(result.valid).toBe(true);
      expect(result.results[0].passed).toBe(true);
    });

    it('should fail on schema mismatch', async () => {
      const response: ResponseData = {
        status: 200,
        statusText: 'OK',
        headers: {},
        body: {
          id: 'not-a-number',
          name: 'Test User',
        },
        timestamp: new Date(),
      };

      const rule: ValidationRule = {
        id: 'json-schema',
        name: 'User schema',
        type: 'jsonSchema',
        jsonSchema: {
          schema: {
            type: 'object',
            properties: {
              id: { type: 'number' },
              name: { type: 'string' },
              email: { type: 'string', format: 'email' },
            },
            required: ['id', 'name', 'email'],
          },
        },
      };

      const result = await validator.validate(response, [rule]);
      
      expect(result.valid).toBe(false);
      expect(result.results[0].passed).toBe(false);
      expect(result.results[0].errors).toBeDefined();
      expect(result.results[0].errors!.length).toBeGreaterThan(0);
    });
  });

  describe('Performance Validation', () => {
    it('should validate latency', async () => {
      const response: ResponseData = {
        status: 200,
        statusText: 'OK',
        headers: {},
        body: {},
        timestamp: new Date(),
      };

      const rule: ValidationRule = {
        id: 'latency-check',
        name: 'Response within 1000ms',
        type: 'latency',
        performance: {
          maxLatency: 1000,
        },
      };

      const context: ValidationContext = {
        duration: 500,
      };

      const options: ValidationOptions = {
        context,
      };

      const result = await validator.validate(response, [rule], options);
      
      expect(result.valid).toBe(true);
      expect(result.results[0].passed).toBe(true);
    });

    it('should fail on latency exceeded', async () => {
      const response: ResponseData = {
        status: 200,
        statusText: 'OK',
        headers: {},
        body: {},
        timestamp: new Date(),
      };

      const rule: ValidationRule = {
        id: 'latency-check',
        name: 'Response within 1000ms',
        type: 'latency',
        performance: {
          maxLatency: 1000,
        },
      };

      const context: ValidationContext = {
        duration: 1500,
      };

      const options: ValidationOptions = {
        context,
      };

      const result = await validator.validate(response, [rule], options);
      
      expect(result.valid).toBe(false);
      expect(result.results[0].passed).toBe(false);
      expect(result.results[0].errors![0].code).toBe('LATENCY_EXCEEDED');
    });

    it('should validate response size', async () => {
      const response: ResponseData = {
        status: 200,
        statusText: 'OK',
        headers: {},
        body: {},
        timestamp: new Date(),
      };

      const rule: ValidationRule = {
        id: 'size-check',
        name: 'Response under 1MB',
        type: 'size',
        performance: {
          maxSize: 1048576,
        },
      };

      const context: ValidationContext = {
        size: 500000,
      };

      const options: ValidationOptions = {
        context,
      };

      const result = await validator.validate(response, [rule], options);
      
      expect(result.valid).toBe(true);
      expect(result.results[0].passed).toBe(true);
    });
  });

  describe('Custom Assertions', () => {
    it('should validate custom assertion', async () => {
      const response: ResponseData = {
        status: 200,
        statusText: 'OK',
        headers: {},
        body: { value: 42 },
        timestamp: new Date(),
      };

      const rule: ValidationRule = {
        id: 'custom-assertion',
        name: 'Value is 42',
        type: 'custom',
        customAssertions: [{
          name: 'Value check',
          assert: async (res) => res.body?.value === 42,
          errorMessage: () => 'Value is not 42',
        }],
      };

      const result = await validator.validate(response, [rule]);
      
      expect(result.valid).toBe(true);
      expect(result.results[0].passed).toBe(true);
    });

    it('should fail custom assertion', async () => {
      const response: ResponseData = {
        status: 200,
        statusText: 'OK',
        headers: {},
        body: { value: 10 },
        timestamp: new Date(),
      };

      const rule: ValidationRule = {
        id: 'custom-assertion',
        name: 'Value is 42',
        type: 'custom',
        customAssertions: [{
          name: 'Value check',
          assert: async (res) => res.body?.value === 42,
          errorMessage: () => 'Value is not 42',
        }],
      };

      const result = await validator.validate(response, [rule]);
      
      expect(result.valid).toBe(false);
      expect(result.results[0].passed).toBe(false);
      expect(result.results[0].errors![0].message).toBe('Value is not 42');
    });
  });

  describe('Multiple Rules', () => {
    it('should validate multiple rules', async () => {
      const response: ResponseData = {
        status: 200,
        statusText: 'OK',
        headers: {
          'content-type': 'application/json',
        },
        body: {
          data: {
            id: 1,
            name: 'Test',
          },
        },
        timestamp: new Date(),
      };

      const rules = CommonAssertions.restSuccess();

      const result = await validator.validate(response, rules);
      
      expect(result.valid).toBe(true);
      expect(result.summary.passed).toBe(rules.length);
    });

    it('should stop on first error when configured', async () => {
      const response: ResponseData = {
        status: 404,
        statusText: 'Not Found',
        headers: {},
        body: {},
        timestamp: new Date(),
      };

      const rules: ValidationRule[] = [
        {
          id: 'rule1',
          name: 'Status check',
          type: 'status',
          status: { expected: 200 },
        },
        {
          id: 'rule2',
          name: 'Header check',
          type: 'header',
          headers: [{
            name: 'content-type',
            exists: true,
          }],
        },
      ];

      const options: ValidationOptions = {
        continueOnError: false,
      };

      const result = await validator.validate(response, rules, options);
      
      expect(result.valid).toBe(false);
      expect(result.results).toHaveLength(1); // Only first rule executed
    });
  });

  describe('Rule Skipping', () => {
    it('should skip rules based on condition', async () => {
      const response: ResponseData = {
        status: 404,
        statusText: 'Not Found',
        headers: {},
        body: {},
        timestamp: new Date(),
      };

      const rule: ValidationRule = {
        id: 'conditional-rule',
        name: 'Body check',
        type: 'body',
        body: {
          isNotEmpty: true,
        },
        skipIf: (res) => res.status === 404,
      };

      const result = await validator.validate(response, [rule]);
      
      expect(result.results[0].skipped).toBe(true);
      expect(result.results[0].skipReason).toBe('Skip condition met');
      expect(result.summary.skipped).toBe(1);
    });

    it('should skip specific rules by ID', async () => {
      const response: ResponseData = {
        status: 200,
        statusText: 'OK',
        headers: {},
        body: {},
        timestamp: new Date(),
      };

      const rules: ValidationRule[] = [
        {
          id: 'rule1',
          name: 'Rule 1',
          type: 'status',
          status: { expected: 200 },
        },
        {
          id: 'rule2',
          name: 'Rule 2',
          type: 'status',
          status: { expected: 201 },
        },
      ];

      const options: ValidationOptions = {
        skipRules: ['rule2'],
      };

      const result = await validator.validate(response, rules, options);
      
      expect(result.results).toHaveLength(1);
      expect(result.results[0].ruleId).toBe('rule1');
    });
  });

  describe('Severity Levels', () => {
    it('should handle different severity levels', async () => {
      const response: ResponseData = {
        status: 200,
        statusText: 'OK',
        headers: {},
        body: {},
        timestamp: new Date(),
      };

      const rules: ValidationRule[] = [
        {
          id: 'error-rule',
          name: 'Error severity',
          type: 'status',
          status: { expected: 201 },
          severity: 'error',
        },
        {
          id: 'warning-rule',
          name: 'Warning severity',
          type: 'header',
          headers: [{
            name: 'cache-control',
            exists: true,
          }],
          severity: 'warning',
        },
      ];

      const result = await validator.validate(response, rules);
      
      expect(result.valid).toBe(false); // Error level failures make result invalid
      expect(result.summary.errors).toBe(1);
      expect(result.summary.warnings).toBe(1);
    });

    it('should be valid with only warnings', async () => {
      const response: ResponseData = {
        status: 200,
        statusText: 'OK',
        headers: {},
        body: {},
        timestamp: new Date(),
      };

      const rule: ValidationRule = {
        id: 'warning-rule',
        name: 'Warning only',
        type: 'header',
        headers: [{
          name: 'cache-control',
          exists: true,
        }],
        severity: 'warning',
      };

      const result = await validator.validate(response, [rule]);
      
      expect(result.valid).toBe(true); // Warnings don't make result invalid
      expect(result.summary.warnings).toBe(1);
    });
  });
});