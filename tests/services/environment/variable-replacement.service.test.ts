/**
 * Tests for VariableReplacementService
 */

import { jest } from '@jest/globals';
import { VariableReplacementService } from '../../../src/services/environment/variable-replacement.service';
import { TestDataFactory, TestAssertions } from '../../utils/test-utils';
import { Variables } from '../../../src/types';
import { ValidationError, ConfigurationError } from '../../../src/services/error';

describe('VariableReplacementService', () => {
  let variableService: VariableReplacementService;

  beforeEach(() => {
    variableService = new VariableReplacementService();
  });

  describe('Variable Syntax Detection', () => {
    describe('findVariables', () => {
      it('should detect simple variable references', () => {
        const text = 'API URL is {{API_URL}} and key is {{API_KEY}}';
        const variables = variableService.findVariables(text);

        expect(variables).toEqual(['API_URL', 'API_KEY']);
      });

      it('should detect variables with different syntax patterns', () => {
        const testCases = [
          { text: '${API_URL}', expected: ['API_URL'] },
          { text: '{API_URL}', expected: ['API_URL'] },
          { text: '{{API_URL}}', expected: ['API_URL'] },
          { text: '$API_URL', expected: ['API_URL'] },
          { text: '%API_URL%', expected: ['API_URL'] },
        ];

        testCases.forEach(({ text, expected }) => {
          const variables = variableService.findVariables(text);
          expect(variables).toEqual(expected);
        });
      });

      it('should handle nested and complex patterns', () => {
        const text = 'URL: {{BASE_URL}}/api/{{VERSION}}/users/{{USER_ID}}';
        const variables = variableService.findVariables(text);

        expect(variables).toEqual(['BASE_URL', 'VERSION', 'USER_ID']);
      });

      it('should handle variables in JSON structures', () => {
        const jsonText = JSON.stringify({
          apiUrl: '{{API_URL}}',
          headers: {
            authorization: 'Bearer {{TOKEN}}',
            'x-api-key': '{{API_KEY}}',
          },
          data: {
            userId: '{{USER_ID}}',
            timestamp: '{{TIMESTAMP}}',
          },
        });

        const variables = variableService.findVariables(jsonText);
        expect(variables).toEqual(['API_URL', 'TOKEN', 'API_KEY', 'USER_ID', 'TIMESTAMP']);
      });

      it('should deduplicate variable references', () => {
        const text = '{{API_URL}} is used here and {{API_URL}} is used again';
        const variables = variableService.findVariables(text);

        expect(variables).toEqual(['API_URL']);
      });

      it('should ignore malformed variable syntax', () => {
        const text = '{{INCOMPLETE} and {{}} and {{  }} and {{VALID_VAR}}';
        const variables = variableService.findVariables(text);

        expect(variables).toEqual(['VALID_VAR']);
      });

      it('should handle escaped variable syntax', () => {
        const text = 'This is \\{{NOT_A_VARIABLE}} but this is {{REAL_VARIABLE}}';
        const variables = variableService.findVariables(text);

        expect(variables).toEqual(['REAL_VARIABLE']);
      });
    });

    describe('validateVariableName', () => {
      it('should validate correct variable names', () => {
        const validNames = [
          'API_URL',
          'DATABASE_HOST',
          'USER_123',
          'ENV_VAR_NAME',
          'A',
          'LONG_VARIABLE_NAME_WITH_MANY_UNDERSCORES',
        ];

        validNames.forEach(name => {
          expect(variableService.validateVariableName(name)).toBe(true);
        });
      });

      it('should reject invalid variable names', () => {
        const invalidNames = [
          '', // empty
          '123_INVALID', // starts with number
          'INVALID-NAME', // contains hyphen
          'INVALID.NAME', // contains dot
          'INVALID NAME', // contains space
          'INVALID@NAME', // contains special character
          'invalid_name', // lowercase
          'InValidName', // mixed case
        ];

        invalidNames.forEach(name => {
          expect(variableService.validateVariableName(name)).toBe(false);
        });
      });
    });
  });

  describe('Variable Replacement', () => {
    describe('replaceVariables', () => {
      it('should replace simple variables', async () => {
        const text = 'API URL is {{API_URL}} and version is {{VERSION}}';
        const variables: Variables = {
          API_URL: 'https://api.example.com',
          VERSION: 'v1',
        };

        const result = await variableService.replaceVariables(text, variables);

        expect(result).toBe('API URL is https://api.example.com and version is v1');
      });

      it('should handle different variable syntax patterns', async () => {
        const testCases = [
          {
            text: 'URL: ${API_URL}',
            variables: { API_URL: 'https://api.example.com' },
            expected: 'URL: https://api.example.com',
          },
          {
            text: 'URL: {{API_URL}}',
            variables: { API_URL: 'https://api.example.com' },
            expected: 'URL: https://api.example.com',
          },
          {
            text: 'URL: %API_URL%',
            variables: { API_URL: 'https://api.example.com' },
            expected: 'URL: https://api.example.com',
          },
        ];

        for (const { text, variables, expected } of testCases) {
          const result = await variableService.replaceVariables(text, variables);
          expect(result).toBe(expected);
        }
      });

      it('should handle complex JSON replacement', async () => {
        const jsonTemplate = JSON.stringify({
          baseUrl: '{{BASE_URL}}',
          endpoints: {
            users: '{{BASE_URL}}/users',
            auth: '{{BASE_URL}}/auth/{{AUTH_VERSION}}',
          },
          headers: {
            authorization: 'Bearer {{TOKEN}}',
            'user-agent': '{{APP_NAME}}/{{APP_VERSION}}',
          },
        }, null, 2);

        const variables: Variables = {
          BASE_URL: 'https://api.example.com',
          AUTH_VERSION: 'v2',
          TOKEN: 'abc123token',
          APP_NAME: 'APIForge',
          APP_VERSION: '1.0.0',
        };

        const result = await variableService.replaceVariables(jsonTemplate, variables);
        const parsed = JSON.parse(result);

        expect(parsed).toEqual({
          baseUrl: 'https://api.example.com',
          endpoints: {
            users: 'https://api.example.com/users',
            auth: 'https://api.example.com/auth/v2',
          },
          headers: {
            authorization: 'Bearer abc123token',
            'user-agent': 'APIForge/1.0.0',
          },
        });
      });

      it('should handle recursive variable replacement', async () => {
        const text = 'Full URL: {{FULL_URL}}';
        const variables: Variables = {
          BASE_URL: 'https://api.example.com',
          ENDPOINT: '/users',
          FULL_URL: '{{BASE_URL}}{{ENDPOINT}}',
        };

        const result = await variableService.replaceVariables(text, variables);

        expect(result).toBe('Full URL: https://api.example.com/users');
      });

      it('should handle multiple levels of recursion', async () => {
        const text = 'Complete path: {{COMPLETE_PATH}}';
        const variables: Variables = {
          PROTOCOL: 'https',
          DOMAIN: 'api.example.com',
          PORT: '443',
          PATH: '/v1/users',
          BASE_URL: '{{PROTOCOL}}://{{DOMAIN}}:{{PORT}}',
          COMPLETE_PATH: '{{BASE_URL}}{{PATH}}',
        };

        const result = await variableService.replaceVariables(text, variables);

        expect(result).toBe('Complete path: https://api.example.com:443/v1/users');
      });

      it('should detect circular references', async () => {
        const text = 'Value: {{VAR_A}}';
        const variables: Variables = {
          VAR_A: '{{VAR_B}}',
          VAR_B: '{{VAR_C}}',
          VAR_C: '{{VAR_A}}', // Circular reference
        };

        await TestAssertions.expectRejectsWithError(
          variableService.replaceVariables(text, variables),
          ValidationError,
          'Circular reference detected'
        );
      });

      it('should handle missing variables with different strategies', async () => {
        const text = 'URL: {{API_URL}} and missing: {{MISSING_VAR}}';
        const variables: Variables = {
          API_URL: 'https://api.example.com',
        };

        // Default strategy: throw error
        await TestAssertions.expectRejectsWithError(
          variableService.replaceVariables(text, variables),
          ValidationError,
          'Variable not found: MISSING_VAR'
        );

        // Ignore strategy: leave as-is
        const resultIgnore = await variableService.replaceVariables(text, variables, {
          missingVariableStrategy: 'ignore',
        });
        expect(resultIgnore).toBe('URL: https://api.example.com and missing: {{MISSING_VAR}}');

        // Empty strategy: replace with empty string
        const resultEmpty = await variableService.replaceVariables(text, variables, {
          missingVariableStrategy: 'empty',
        });
        expect(resultEmpty).toBe('URL: https://api.example.com and missing: ');
      });

      it('should handle empty variable values', async () => {
        const text = 'Value: "{{EMPTY_VAR}}" and "{{NULL_VAR}}"';
        const variables: Variables = {
          EMPTY_VAR: '',
          NULL_VAR: null as any,
        };

        const result = await variableService.replaceVariables(text, variables);

        expect(result).toBe('Value: "" and ""');
      });

      it('should handle special characters in variable values', async () => {
        const text = 'Special: {{SPECIAL_CHARS}}';
        const variables: Variables = {
          SPECIAL_CHARS: 'Value with "quotes", {braces}, and $pecial ch@rs!',
        };

        const result = await variableService.replaceVariables(text, variables);

        expect(result).toBe('Special: Value with "quotes", {braces}, and $pecial ch@rs!');
      });
    });

    describe('replaceVariablesInObject', () => {
      it('should replace variables in object properties', async () => {
        const obj = {
          url: '{{BASE_URL}}/api',
          headers: {
            authorization: 'Bearer {{TOKEN}}',
            'x-api-key': '{{API_KEY}}',
          },
          data: {
            userId: '{{USER_ID}}',
            timestamp: new Date('2025-01-01'),
            count: 42,
            active: true,
          },
        };

        const variables: Variables = {
          BASE_URL: 'https://api.example.com',
          TOKEN: 'abc123',
          API_KEY: 'key456',
          USER_ID: '12345',
        };

        const result = await variableService.replaceVariablesInObject(obj, variables);

        expect(result).toEqual({
          url: 'https://api.example.com/api',
          headers: {
            authorization: 'Bearer abc123',
            'x-api-key': 'key456',
          },
          data: {
            userId: '12345',
            timestamp: new Date('2025-01-01'),
            count: 42,
            active: true,
          },
        });
      });

      it('should handle arrays with variable replacement', async () => {
        const obj = {
          endpoints: [
            '{{BASE_URL}}/users',
            '{{BASE_URL}}/posts',
            '{{BASE_URL}}/comments/{{COMMENT_ID}}',
          ],
          headers: ['Authorization: Bearer {{TOKEN}}', 'Content-Type: application/json'],
        };

        const variables: Variables = {
          BASE_URL: 'https://api.example.com',
          COMMENT_ID: '123',
          TOKEN: 'token123',
        };

        const result = await variableService.replaceVariablesInObject(obj, variables);

        expect(result).toEqual({
          endpoints: [
            'https://api.example.com/users',
            'https://api.example.com/posts',
            'https://api.example.com/comments/123',
          ],
          headers: ['Authorization: Bearer token123', 'Content-Type: application/json'],
        });
      });

      it('should preserve non-string types', async () => {
        const obj = {
          string: '{{VALUE}}',
          number: 42,
          boolean: true,
          null: null,
          undefined: undefined,
          date: new Date('2025-01-01'),
          array: [1, 2, 3],
          nestedObject: {
            nestedString: '{{NESTED_VALUE}}',
            nestedNumber: 100,
          },
        };

        const variables: Variables = {
          VALUE: 'replaced',
          NESTED_VALUE: 'nested-replaced',
        };

        const result = await variableService.replaceVariablesInObject(obj, variables);

        expect(result).toEqual({
          string: 'replaced',
          number: 42,
          boolean: true,
          null: null,
          undefined: undefined,
          date: new Date('2025-01-01'),
          array: [1, 2, 3],
          nestedObject: {
            nestedString: 'nested-replaced',
            nestedNumber: 100,
          },
        });
      });
    });
  });

  describe('Advanced Features', () => {
    describe('Variable expressions', () => {
      it('should handle variable expressions with default values', async () => {
        const text = 'URL: {{API_URL:https://default.com}} and Port: {{PORT:8080}}';
        const variables: Variables = {
          API_URL: 'https://api.example.com',
          // PORT is missing, should use default
        };

        const result = await variableService.replaceVariables(text, variables, {
          enableExpressions: true,
        });

        expect(result).toBe('URL: https://api.example.com and Port: 8080');
      });

      it('should handle conditional expressions', async () => {
        const text = 'Environment: {{ENV:development}} | Debug: {{DEBUG:false}}';
        const variables: Variables = {
          ENV: 'production',
          DEBUG: 'true',
        };

        const result = await variableService.replaceVariables(text, variables, {
          enableExpressions: true,
        });

        expect(result).toBe('Environment: production | Debug: true');
      });

      it('should handle transform expressions', async () => {
        const text = 'URL: {{BASE_URL|upper}} and key: {{API_KEY|lower}}';
        const variables: Variables = {
          BASE_URL: 'https://api.example.com',
          API_KEY: 'SECRET_KEY_123',
        };

        const result = await variableService.replaceVariables(text, variables, {
          enableExpressions: true,
          transforms: {
            upper: (value) => value.toUpperCase(),
            lower: (value) => value.toLowerCase(),
          },
        });

        expect(result).toBe('URL: HTTPS://API.EXAMPLE.COM and key: secret_key_123');
      });
    });

    describe('Variable validation', () => {
      it('should validate required variables', async () => {
        const text = 'URL: {{API_URL}} and Key: {{API_KEY}}';
        const variables: Variables = {
          API_URL: 'https://api.example.com',
          // API_KEY is missing
        };

        const requiredVariables = ['API_URL', 'API_KEY'];

        await TestAssertions.expectRejectsWithError(
          variableService.replaceVariables(text, variables, { requiredVariables }),
          ValidationError,
          'Required variable missing: API_KEY'
        );
      });

      it('should validate variable values', async () => {
        const text = 'URL: {{API_URL}}';
        const variables: Variables = {
          API_URL: 'not-a-valid-url',
        };

        const validators = {
          API_URL: (value: string) => {
            if (!value.startsWith('https://')) {
              throw new Error('API_URL must start with https://');
            }
            return true;
          },
        };

        await TestAssertions.expectRejectsWithError(
          variableService.replaceVariables(text, variables, { validators }),
          ValidationError,
          'Variable validation failed for API_URL: API_URL must start with https://'
        );
      });
    });

    describe('Performance optimizations', () => {
      it('should cache compiled variable patterns', async () => {
        const text = 'URL: {{API_URL}} repeated {{API_URL}}';
        const variables: Variables = {
          API_URL: 'https://api.example.com',
        };

        // First replacement should compile patterns
        const result1 = await variableService.replaceVariables(text, variables);
        
        // Second replacement should use cached patterns
        const result2 = await variableService.replaceVariables(text, variables);

        expect(result1).toBe(result2);
        expect(result1).toBe('URL: https://api.example.com repeated https://api.example.com');
      });

      it('should handle large text efficiently', async () => {
        const largeText = 'Variable: {{TEST_VAR}} '.repeat(1000);
        const variables: Variables = {
          TEST_VAR: 'value',
        };

        const startTime = Date.now();
        const result = await variableService.replaceVariables(largeText, variables);
        const endTime = Date.now();

        expect(result).toBe('Variable: value '.repeat(1000));
        expect(endTime - startTime).toBeLessThan(1000); // Should complete within 1 second
      });
    });
  });

  describe('Integration scenarios', () => {
    it('should handle complete API request variable replacement', async () => {
      const requestTemplate = {
        method: 'POST',
        url: '{{BASE_URL}}/{{API_VERSION}}/users',
        headers: {
          'Authorization': 'Bearer {{ACCESS_TOKEN}}',
          'Content-Type': 'application/json',
          'X-API-Key': '{{API_KEY}}',
          'User-Agent': '{{APP_NAME}}/{{APP_VERSION}}',
        },
        body: {
          user: {
            id: '{{USER_ID}}',
            email: '{{USER_EMAIL}}',
            profile: {
              name: '{{USER_NAME}}',
              settings: {
                theme: '{{UI_THEME}}',
                language: '{{USER_LANGUAGE}}',
              },
            },
          },
          metadata: {
            requestId: '{{REQUEST_ID}}',
            timestamp: '{{TIMESTAMP}}',
            source: '{{REQUEST_SOURCE}}',
          },
        },
      };

      const variables: Variables = {
        BASE_URL: 'https://api.example.com',
        API_VERSION: 'v2',
        ACCESS_TOKEN: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
        API_KEY: 'sk_live_abcd1234',
        APP_NAME: 'APIForge',
        APP_VERSION: '1.2.0',
        USER_ID: '12345',
        USER_EMAIL: 'user@example.com',
        USER_NAME: 'John Doe',
        UI_THEME: 'dark',
        USER_LANGUAGE: 'en',
        REQUEST_ID: 'req_123456789',
        TIMESTAMP: '2025-01-01T12:00:00Z',
        REQUEST_SOURCE: 'web-app',
      };

      const result = await variableService.replaceVariablesInObject(requestTemplate, variables);

      expect(result).toEqual({
        method: 'POST',
        url: 'https://api.example.com/v2/users',
        headers: {
          'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
          'Content-Type': 'application/json',
          'X-API-Key': 'sk_live_abcd1234',
          'User-Agent': 'APIForge/1.2.0',
        },
        body: {
          user: {
            id: '12345',
            email: 'user@example.com',
            profile: {
              name: 'John Doe',
              settings: {
                theme: 'dark',
                language: 'en',
              },
            },
          },
          metadata: {
            requestId: 'req_123456789',
            timestamp: '2025-01-01T12:00:00Z',
            source: 'web-app',
          },
        },
      });
    });

    it('should handle environment-specific variable replacement', async () => {
      const template = {
        database: {
          host: '{{DB_HOST}}',
          port: '{{DB_PORT}}',
          name: '{{DB_NAME}}',
          ssl: '{{DB_SSL:false}}',
        },
        redis: {
          url: '{{REDIS_URL}}',
          timeout: '{{REDIS_TIMEOUT:5000}}',
        },
        api: {
          baseUrl: '{{API_BASE_URL}}',
          timeout: '{{API_TIMEOUT:30000}}',
          retries: '{{API_RETRIES:3}}',
        },
      };

      // Development environment variables
      const devVariables: Variables = {
        DB_HOST: 'localhost',
        DB_PORT: '5432',
        DB_NAME: 'apiforge_dev',
        REDIS_URL: 'redis://localhost:6379',
        API_BASE_URL: 'http://localhost:3000',
      };

      // Production environment variables
      const prodVariables: Variables = {
        DB_HOST: 'prod-db.example.com',
        DB_PORT: '5432',
        DB_NAME: 'apiforge_prod',
        DB_SSL: 'true',
        REDIS_URL: 'redis://prod-redis.example.com:6379',
        REDIS_TIMEOUT: '3000',
        API_BASE_URL: 'https://api.example.com',
        API_TIMEOUT: '10000',
        API_RETRIES: '5',
      };

      const devResult = await variableService.replaceVariablesInObject(template, devVariables, {
        enableExpressions: true,
      });

      const prodResult = await variableService.replaceVariablesInObject(template, prodVariables, {
        enableExpressions: true,
      });

      expect(devResult.database.ssl).toBe('false'); // Default value
      expect(prodResult.database.ssl).toBe('true'); // Overridden value

      expect(devResult.api.timeout).toBe('30000'); // Default value
      expect(prodResult.api.timeout).toBe('10000'); // Overridden value
    });
  });
});