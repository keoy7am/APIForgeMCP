/**
 * Tests for Assertion Library
 */

import { jest } from '@jest/globals';
import {
  AssertionLibrary,
  createAssertions,
  CommonAssertions,
  StatusAssertions,
  HeaderAssertions,
  BodyAssertions,
  PerformanceAssertions,
} from '../../../src/services/validation/assertion-library';
import type { ValidationRule } from '../../../src/types';

describe('Assertion Library', () => {
  describe('Status Assertions', () => {
    let status: StatusAssertions;

    beforeEach(() => {
      status = new StatusAssertions();
    });

    it('should create status equals assertion', () => {
      const rule = status.is(200).buildOne();
      
      expect(rule.type).toBe('status');
      expect(rule.status?.expected).toBe(200);
      expect(rule.name).toBe('Status is 200');
    });

    it('should create success status assertion', () => {
      const rule = status.isSuccess().buildOne();
      
      expect(rule.type).toBe('status');
      expect(rule.status?.successOnly).toBe(true);
      expect(rule.name).toBe('Status is success (2xx)');
    });

    it('should create client error assertion', () => {
      const rule = status.isClientError().buildOne();
      
      expect(rule.type).toBe('status');
      expect(rule.status?.range?.min).toBe(400);
      expect(rule.status?.range?.max).toBe(499);
      expect(rule.name).toBe('Status is client error (4xx)');
    });

    it('should create server error assertion', () => {
      const rule = status.isServerError().buildOne();
      
      expect(rule.type).toBe('status');
      expect(rule.status?.range?.min).toBe(500);
      expect(rule.status?.range?.max).toBe(599);
      expect(rule.name).toBe('Status is server error (5xx)');
    });

    it('should create redirect assertion', () => {
      const rule = status.isRedirect().buildOne();
      
      expect(rule.type).toBe('status');
      expect(rule.status?.range?.min).toBe(300);
      expect(rule.status?.range?.max).toBe(399);
      expect(rule.name).toBe('Status is redirect (3xx)');
    });

    it('should create status range assertion', () => {
      const rule = status.inRange(200, 299).buildOne();
      
      expect(rule.type).toBe('status');
      expect(rule.status?.range?.min).toBe(200);
      expect(rule.status?.range?.max).toBe(299);
      expect(rule.name).toBe('Status is between 200 and 299');
    });

    it('should support chaining with severity', () => {
      const rule = status.is(200).severity('warning').buildOne();
      
      expect(rule.severity).toBe('warning');
    });

    it('should support chaining with name', () => {
      const rule = status.is(200).named('Custom Name').buildOne();
      
      expect(rule.name).toBe('Custom Name');
    });

    it('should support chaining with tags', () => {
      const rule = status.is(200).tagged('api', 'critical').buildOne();
      
      expect(rule.tags).toEqual(['api', 'critical']);
    });
  });

  describe('Header Assertions', () => {
    let headers: HeaderAssertions;

    beforeEach(() => {
      headers = new HeaderAssertions();
    });

    it('should create header exists assertion', () => {
      const rule = headers.has('content-type').buildOne();
      
      expect(rule.type).toBe('header');
      expect(rule.headers?.[0].name).toBe('content-type');
      expect(rule.headers?.[0].exists).toBe(true);
      expect(rule.name).toBe("Header 'content-type' exists");
    });

    it('should create header equals assertion', () => {
      const rule = headers.equals('content-type', 'application/json').buildOne();
      
      expect(rule.type).toBe('header');
      expect(rule.headers?.[0].name).toBe('content-type');
      expect(rule.headers?.[0].value).toBe('application/json');
      expect(rule.name).toBe("Header 'content-type' equals 'application/json'");
    });

    it('should create header matches assertion', () => {
      const pattern = /application\/json/;
      const rule = headers.matches('content-type', pattern).buildOne();
      
      expect(rule.type).toBe('header');
      expect(rule.headers?.[0].name).toBe('content-type');
      expect(rule.headers?.[0].value).toBe(pattern);
      expect(rule.name).toBe("Header 'content-type' matches pattern");
    });

    it('should create content type assertion', () => {
      const rule = headers.contentType('application/json').buildOne();
      
      expect(rule.type).toBe('header');
      expect(rule.headers?.[0].name).toBe('content-type');
      expect(rule.headers?.[0].value).toBeInstanceOf(RegExp);
      expect(rule.name).toBe("Content-Type contains 'application/json'");
    });
  });

  describe('Body Assertions', () => {
    let body: BodyAssertions;

    beforeEach(() => {
      body = new BodyAssertions();
    });

    it('should create body contains assertion', () => {
      const rule = body.contains('Hello').buildOne();
      
      expect(rule.type).toBe('body');
      expect(rule.body?.contains).toBe('Hello');
      expect(rule.name).toBe("Body contains 'Hello'");
    });

    it('should create body matches assertion', () => {
      const pattern = /test/i;
      const rule = body.matches(pattern).buildOne();
      
      expect(rule.type).toBe('body');
      expect(rule.body?.matches).toBe(pattern);
      expect(rule.name).toBe('Body matches pattern');
    });

    it('should create JSON equals assertion', () => {
      const expected = { foo: 'bar' };
      const rule = body.jsonEquals(expected).buildOne();
      
      expect(rule.type).toBe('body');
      expect(rule.body?.validator).toBeDefined();
      expect(rule.name).toBe('JSON body equals expected');
    });

    it('should create JSON path assertion', () => {
      const rule = body.jsonPath('$.data.id', 123).buildOne();
      
      expect(rule.type).toBe('body');
      expect(rule.body?.jsonPath?.[0].path).toBe('$.data.id');
      expect(rule.body?.jsonPath?.[0].value).toBe(123);
      expect(rule.body?.jsonPath?.[0].operator).toBe('eq');
      expect(rule.name).toBe("JSON path '$.data.id' equals value");
    });

    it('should create JSON path exists assertion', () => {
      const rule = body.jsonPath('$.data').buildOne();
      
      expect(rule.type).toBe('body');
      expect(rule.body?.jsonPath?.[0].path).toBe('$.data');
      expect(rule.body?.jsonPath?.[0].exists).toBe(true);
      expect(rule.name).toBe("JSON path '$.data' exists");
    });

    it('should create JSON schema assertion', () => {
      const schema = {
        type: 'object',
        properties: {
          id: { type: 'number' },
        },
      };
      const rule = body.jsonSchema(schema).buildOne();
      
      expect(rule.type).toBe('jsonSchema');
      expect(rule.jsonSchema?.schema).toBe(schema);
      expect(rule.name).toBe('Body matches JSON schema');
    });

    it('should create body is empty assertion', () => {
      const rule = body.isEmpty().buildOne();
      
      expect(rule.type).toBe('body');
      expect(rule.body?.validator).toBeDefined();
      expect(rule.name).toBe('Body is empty');
      
      // Test the validator
      const validator = rule.body!.validator!;
      expect(validator(null)).toBe(true);
      expect(validator('')).toBe(true);
      expect(validator({})).toBe(true);
      expect(validator([])).toBe(true);
      expect(validator('text')).toBe(false);
      expect(validator({ a: 1 })).toBe(false);
      expect(validator([1])).toBe(false);
    });

    it('should create body is not empty assertion', () => {
      const rule = body.isNotEmpty().buildOne();
      
      expect(rule.type).toBe('body');
      expect(rule.body?.validator).toBeDefined();
      expect(rule.name).toBe('Body is not empty');
      
      // Test the validator
      const validator = rule.body!.validator!;
      expect(validator(null)).toBe(false);
      expect(validator('')).toBe(false);
      expect(validator({})).toBe(false);
      expect(validator([])).toBe(false);
      expect(validator('text')).toBe(true);
      expect(validator({ a: 1 })).toBe(true);
      expect(validator([1])).toBe(true);
    });
  });

  describe('Performance Assertions', () => {
    let performance: PerformanceAssertions;

    beforeEach(() => {
      performance = new PerformanceAssertions();
    });

    it('should create response time assertion', () => {
      const rule = performance.respondsWithin(1000).buildOne();
      
      expect(rule.type).toBe('latency');
      expect(rule.performance?.maxLatency).toBe(1000);
      expect(rule.name).toBe('Response within 1000ms');
    });

    it('should create response size assertion', () => {
      const rule = performance.sizeUnder(100000).buildOne();
      
      expect(rule.type).toBe('size');
      expect(rule.performance?.maxSize).toBe(100000);
      expect(rule.name).toBe('Response size under 100000 bytes');
    });

    it('should create TTFB assertion', () => {
      const rule = performance.ttfbUnder(500).buildOne();
      
      expect(rule.type).toBe('latency');
      expect(rule.performance?.maxTTFB).toBe(500);
      expect(rule.name).toBe('TTFB under 500ms');
    });
  });

  describe('Main Assertion Library', () => {
    let assert: AssertionLibrary;

    beforeEach(() => {
      assert = createAssertions();
    });

    it('should provide status assertions', () => {
      expect(assert.status).toBeDefined();
      expect(assert.status).toBeInstanceOf(StatusAssertions);
    });

    it('should provide header assertions', () => {
      expect(assert.headers).toBeDefined();
      expect(assert.headers).toBeInstanceOf(HeaderAssertions);
    });

    it('should provide body assertions', () => {
      expect(assert.body).toBeDefined();
      expect(assert.body).toBeInstanceOf(BodyAssertions);
    });

    it('should provide performance assertions', () => {
      expect(assert.performance).toBeDefined();
      expect(assert.performance).toBeInstanceOf(PerformanceAssertions);
    });

    it('should create custom assertion', () => {
      const customAssertion = {
        name: 'Custom Check',
        assert: async () => true,
      };
      
      const rule = assert.custom(customAssertion);
      
      expect(rule.type).toBe('custom');
      expect(rule.customAssertions?.[0]).toBe(customAssertion);
      expect(rule.name).toBe('Custom Check');
    });

    it('should create all assertion (placeholder)', () => {
      const rules: ValidationRule[] = [
        assert.status.is(200).buildOne(),
        assert.headers.has('content-type').buildOne(),
      ];
      
      const combined = assert.all(...rules);
      
      expect(combined.type).toBe('custom');
      expect(combined.name).toBe('All assertions must pass');
    });

    it('should create any assertion (placeholder)', () => {
      const rules: ValidationRule[] = [
        assert.status.is(200).buildOne(),
        assert.status.is(201).buildOne(),
      ];
      
      const combined = assert.any(...rules);
      
      expect(combined.type).toBe('custom');
      expect(combined.name).toBe('Any assertion must pass');
    });

    it('should create not assertion (placeholder)', () => {
      const rule = assert.status.is(404).buildOne();
      const negated = assert.not(rule);
      
      expect(negated.type).toBe('custom');
      expect(negated.name).toBe('Not: Status is 404');
    });
  });

  describe('Common Assertions', () => {
    it('should provide REST success pattern', () => {
      const rules = CommonAssertions.restSuccess();
      
      expect(rules).toHaveLength(3);
      expect(rules[0].type).toBe('status');
      expect(rules[1].type).toBe('header');
      expect(rules[2].type).toBe('body');
    });

    it('should provide GraphQL response pattern', () => {
      const rules = CommonAssertions.graphqlResponse();
      
      expect(rules).toHaveLength(4);
      expect(rules[0].type).toBe('status');
      expect(rules[0].status?.expected).toBe(200);
      expect(rules[1].type).toBe('header');
      expect(rules[2].type).toBe('body');
      expect(rules[2].body?.jsonPath?.[0].path).toBe('$.data');
      expect(rules[3].type).toBe('body');
      expect(rules[3].body?.jsonPath?.[0].path).toBe('$.errors');
    });

    it('should provide paginated response pattern', () => {
      const rules = CommonAssertions.paginatedResponse();
      
      expect(rules.length).toBeGreaterThan(3);
      expect(rules.some(r => r.body?.jsonPath?.[0].path === '$.data')).toBe(true);
      expect(rules.some(r => r.body?.jsonPath?.[0].path === '$.pagination')).toBe(true);
      expect(rules.some(r => r.body?.jsonPath?.[0].path === '$.pagination.total')).toBe(true);
    });

    it('should provide error response pattern', () => {
      const rules = CommonAssertions.errorResponse();
      
      expect(rules.length).toBeGreaterThan(2);
      expect(rules[0].type).toBe('status');
      expect(rules[0].status?.range?.min).toBe(400);
      expect(rules[0].status?.range?.max).toBe(599);
      expect(rules.some(r => r.body?.jsonPath?.[0].path === '$.error')).toBe(true);
      expect(rules.some(r => r.body?.jsonPath?.[0].path === '$.message')).toBe(true);
    });

    it('should provide error response pattern with specific status', () => {
      const rules = CommonAssertions.errorResponse(404);
      
      expect(rules[0].type).toBe('status');
      expect(rules[0].status?.expected).toBe(404);
    });

    it('should provide performance budget pattern', () => {
      const rules = CommonAssertions.performanceBudget();
      
      expect(rules).toHaveLength(2);
      expect(rules[0].type).toBe('latency');
      expect(rules[0].performance?.maxLatency).toBe(1000);
      expect(rules[0].severity).toBe('warning');
      expect(rules[1].type).toBe('size');
      expect(rules[1].performance?.maxSize).toBe(100000);
      expect(rules[1].severity).toBe('warning');
    });

    it('should provide performance budget pattern with custom values', () => {
      const rules = CommonAssertions.performanceBudget(2000, 200000);
      
      expect(rules[0].performance?.maxLatency).toBe(2000);
      expect(rules[1].performance?.maxSize).toBe(200000);
    });
  });

  describe('Builder Chaining', () => {
    it('should support building multiple rules', () => {
      const builder = new StatusAssertions();
      
      builder.is(200);
      builder.is(201);
      
      const rules = builder.build();
      
      expect(rules).toHaveLength(2);
      expect(rules[0].status?.expected).toBe(200);
      expect(rules[1].status?.expected).toBe(201);
    });

    it('should support mixed chaining', () => {
      const builder = new StatusAssertions();
      
      builder
        .is(200)
        .severity('warning')
        .named('OK Status')
        .tagged('api', 'v1');
      
      builder
        .isSuccess()
        .severity('error')
        .named('Must be success');
      
      const rules = builder.build();
      
      expect(rules).toHaveLength(2);
      expect(rules[0].severity).toBe('warning');
      expect(rules[0].name).toBe('OK Status');
      expect(rules[0].tags).toEqual(['api', 'v1']);
      expect(rules[1].severity).toBe('error');
      expect(rules[1].name).toBe('Must be success');
    });
  });
});