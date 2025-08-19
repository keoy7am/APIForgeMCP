/**
 * Tests for EnvironmentManager
 */

import { jest } from '@jest/globals';
import { EnvironmentManager } from '../../../src/services/environment/environment-manager.service';
import { TestDataFactory, MockFactory, TestAssertions } from '../../utils/test-utils';
import { EnvironmentVariable, Variables } from '../../../src/types';
import { ValidationError, ConfigurationError } from '../../../src/services/error';

describe('EnvironmentManager', () => {
  let environmentManager: EnvironmentManager;
  let mockStorage: any;
  let mockEncryption: any;

  beforeEach(() => {
    mockStorage = MockFactory.createMockStorage();
    mockEncryption = {
      encrypt: jest.fn(),
      decrypt: jest.fn(),
      hash: jest.fn(),
      validateKey: jest.fn(),
    };
    
    environmentManager = new EnvironmentManager(mockStorage, mockEncryption);
  });

  describe('Variable Management', () => {
    describe('setVariable', () => {
      it('should set a simple string variable', async () => {
        const variable = TestDataFactory.createMockEnvironmentVariable({
          name: 'API_URL',
          value: 'https://api.example.com',
          type: 'string',
        });

        await environmentManager.setVariable('test-env', variable);

        expect(mockStorage.saveEnvironment).toHaveBeenCalledWith(
          'test-env',
          expect.objectContaining({
            variables: expect.objectContaining({
              API_URL: variable,
            }),
          })
        );
      });

      it('should encrypt sensitive variables', async () => {
        const secretVariable = TestDataFactory.createMockEnvironmentVariable({
          name: 'SECRET_KEY',
          value: 'super-secret-key',
          encrypted: true,
          type: 'secret',
        });

        mockEncryption.encrypt.mockResolvedValue('encrypted-value');

        await environmentManager.setVariable('test-env', secretVariable);

        expect(mockEncryption.encrypt).toHaveBeenCalledWith('super-secret-key');
        expect(mockStorage.saveEnvironment).toHaveBeenCalledWith(
          'test-env',
          expect.objectContaining({
            variables: expect.objectContaining({
              SECRET_KEY: expect.objectContaining({
                value: 'encrypted-value',
                encrypted: true,
              }),
            }),
          })
        );
      });

      it('should validate variable name format', async () => {
        const invalidVariable = TestDataFactory.createMockEnvironmentVariable({
          name: 'invalid-name!',
          value: 'test',
        });

        await TestAssertions.expectRejectsWithError(
          environmentManager.setVariable('test-env', invalidVariable),
          ValidationError,
          'Invalid variable name format'
        );
      });

      it('should handle different variable types', async () => {
        const variables = [
          TestDataFactory.createMockEnvironmentVariable({
            name: 'DEBUG',
            value: 'true',
            type: 'boolean',
          }),
          TestDataFactory.createMockEnvironmentVariable({
            name: 'PORT',
            value: '3000',
            type: 'number',
          }),
          TestDataFactory.createMockEnvironmentVariable({
            name: 'CONFIG',
            value: '{"env": "test"}',
            type: 'json',
          }),
        ];

        for (const variable of variables) {
          await environmentManager.setVariable('test-env', variable);
        }

        expect(mockStorage.saveEnvironment).toHaveBeenCalledTimes(3);
      });

      it('should update existing variables', async () => {
        const originalVariable = TestDataFactory.createMockEnvironmentVariable({
          name: 'API_URL',
          value: 'https://api.example.com',
        });

        const updatedVariable = TestDataFactory.createMockEnvironmentVariable({
          name: 'API_URL',
          value: 'https://api-v2.example.com',
        });

        mockStorage.getEnvironment.mockResolvedValue({
          variables: { API_URL: originalVariable },
        });

        await environmentManager.setVariable('test-env', updatedVariable);

        expect(mockStorage.saveEnvironment).toHaveBeenCalledWith(
          'test-env',
          expect.objectContaining({
            variables: expect.objectContaining({
              API_URL: expect.objectContaining({
                value: 'https://api-v2.example.com',
                updatedAt: expect.any(Date),
              }),
            }),
          })
        );
      });
    });

    describe('getVariable', () => {
      it('should retrieve a variable by name', async () => {
        const variable = TestDataFactory.createMockEnvironmentVariable({
          name: 'API_URL',
          value: 'https://api.example.com',
        });

        mockStorage.getEnvironment.mockResolvedValue({
          variables: { API_URL: variable },
        });

        const result = await environmentManager.getVariable('test-env', 'API_URL');

        expect(result).toEqual(variable);
        expect(mockStorage.getEnvironment).toHaveBeenCalledWith('test-env');
      });

      it('should decrypt encrypted variables', async () => {
        const encryptedVariable = TestDataFactory.createMockEnvironmentVariable({
          name: 'SECRET_KEY',
          value: 'encrypted-value',
          encrypted: true,
        });

        mockStorage.getEnvironment.mockResolvedValue({
          variables: { SECRET_KEY: encryptedVariable },
        });
        mockEncryption.decrypt.mockResolvedValue('decrypted-secret');

        const result = await environmentManager.getVariable('test-env', 'SECRET_KEY');

        expect(mockEncryption.decrypt).toHaveBeenCalledWith('encrypted-value');
        expect(result.value).toBe('decrypted-secret');
      });

      it('should return null for non-existent variable', async () => {
        mockStorage.getEnvironment.mockResolvedValue({
          variables: {},
        });

        const result = await environmentManager.getVariable('test-env', 'NON_EXISTENT');

        expect(result).toBeNull();
      });

      it('should handle decryption errors gracefully', async () => {
        const encryptedVariable = TestDataFactory.createMockEnvironmentVariable({
          name: 'SECRET_KEY',
          value: 'corrupted-encrypted-value',
          encrypted: true,
        });

        mockStorage.getEnvironment.mockResolvedValue({
          variables: { SECRET_KEY: encryptedVariable },
        });
        mockEncryption.decrypt.mockRejectedValue(new Error('Decryption failed'));

        await TestAssertions.expectRejectsWithError(
          environmentManager.getVariable('test-env', 'SECRET_KEY'),
          ConfigurationError,
          'Failed to decrypt variable: SECRET_KEY'
        );
      });
    });

    describe('deleteVariable', () => {
      it('should delete a variable', async () => {
        const variables = {
          API_URL: TestDataFactory.createMockEnvironmentVariable({
            name: 'API_URL',
            value: 'https://api.example.com',
          }),
          SECRET_KEY: TestDataFactory.createMockEnvironmentVariable({
            name: 'SECRET_KEY',
            value: 'secret',
          }),
        };

        mockStorage.getEnvironment.mockResolvedValue({ variables });

        await environmentManager.deleteVariable('test-env', 'SECRET_KEY');

        expect(mockStorage.saveEnvironment).toHaveBeenCalledWith(
          'test-env',
          expect.objectContaining({
            variables: {
              API_URL: variables.API_URL,
            },
          })
        );
      });

      it('should handle deletion of non-existent variable', async () => {
        mockStorage.getEnvironment.mockResolvedValue({
          variables: {},
        });

        await environmentManager.deleteVariable('test-env', 'NON_EXISTENT');

        expect(mockStorage.saveEnvironment).toHaveBeenCalledWith(
          'test-env',
          expect.objectContaining({
            variables: {},
          })
        );
      });
    });

    describe('listVariables', () => {
      it('should list all variables in environment', async () => {
        const variables = {
          API_URL: TestDataFactory.createMockEnvironmentVariable({
            name: 'API_URL',
            value: 'https://api.example.com',
          }),
          DEBUG: TestDataFactory.createMockEnvironmentVariable({
            name: 'DEBUG',
            value: 'true',
            type: 'boolean',
          }),
          SECRET: TestDataFactory.createMockEnvironmentVariable({
            name: 'SECRET',
            value: 'encrypted-value',
            encrypted: true,
          }),
        };

        mockStorage.getEnvironment.mockResolvedValue({ variables });

        const result = await environmentManager.listVariables('test-env');

        expect(result).toEqual(Object.values(variables));
        expect(result).toHaveLength(3);
      });

      it('should filter variables by type', async () => {
        const variables = {
          API_URL: TestDataFactory.createMockEnvironmentVariable({
            name: 'API_URL',
            value: 'https://api.example.com',
            type: 'string',
          }),
          DEBUG: TestDataFactory.createMockEnvironmentVariable({
            name: 'DEBUG',
            value: 'true',
            type: 'boolean',
          }),
          SECRET: TestDataFactory.createMockEnvironmentVariable({
            name: 'SECRET',
            value: 'secret-value',
            type: 'secret',
          }),
        };

        mockStorage.getEnvironment.mockResolvedValue({ variables });

        const secretVars = await environmentManager.listVariables('test-env', { type: 'secret' });
        const stringVars = await environmentManager.listVariables('test-env', { type: 'string' });

        expect(secretVars).toHaveLength(1);
        expect(secretVars[0].name).toBe('SECRET');
        expect(stringVars).toHaveLength(1);
        expect(stringVars[0].name).toBe('API_URL');
      });

      it('should filter encrypted variables', async () => {
        const variables = {
          PLAIN: TestDataFactory.createMockEnvironmentVariable({
            name: 'PLAIN',
            value: 'plain-value',
            encrypted: false,
          }),
          ENCRYPTED: TestDataFactory.createMockEnvironmentVariable({
            name: 'ENCRYPTED',
            value: 'encrypted-value',
            encrypted: true,
          }),
        };

        mockStorage.getEnvironment.mockResolvedValue({ variables });

        const encryptedVars = await environmentManager.listVariables('test-env', { encrypted: true });
        const plainVars = await environmentManager.listVariables('test-env', { encrypted: false });

        expect(encryptedVars).toHaveLength(1);
        expect(encryptedVars[0].name).toBe('ENCRYPTED');
        expect(plainVars).toHaveLength(1);
        expect(plainVars[0].name).toBe('PLAIN');
      });
    });
  });

  describe('Environment Operations', () => {
    describe('createEnvironment', () => {
      it('should create a new environment', async () => {
        const envConfig = {
          name: 'production',
          description: 'Production environment',
          variables: TestDataFactory.createMockVariables(),
        };

        await environmentManager.createEnvironment('production', envConfig);

        expect(mockStorage.saveEnvironment).toHaveBeenCalledWith(
          'production',
          expect.objectContaining({
            name: 'production',
            description: 'Production environment',
            variables: expect.any(Object),
            createdAt: expect.any(Date),
            updatedAt: expect.any(Date),
          })
        );
      });

      it('should prevent duplicate environment creation', async () => {
        mockStorage.getEnvironment.mockResolvedValue({
          name: 'production',
          variables: {},
        });

        await TestAssertions.expectRejectsWithError(
          environmentManager.createEnvironment('production', {}),
          ValidationError,
          'Environment already exists: production'
        );
      });
    });

    describe('cloneEnvironment', () => {
      it('should clone an existing environment', async () => {
        const sourceEnvironment = {
          name: 'development',
          description: 'Development environment',
          variables: {
            API_URL: TestDataFactory.createMockEnvironmentVariable({
              name: 'API_URL',
              value: 'https://dev-api.example.com',
            }),
            DEBUG: TestDataFactory.createMockEnvironmentVariable({
              name: 'DEBUG',
              value: 'true',
            }),
          },
        };

        mockStorage.getEnvironment.mockResolvedValue(sourceEnvironment);

        await environmentManager.cloneEnvironment('development', 'staging');

        expect(mockStorage.saveEnvironment).toHaveBeenCalledWith(
          'staging',
          expect.objectContaining({
            name: 'staging',
            description: 'Cloned from development',
            variables: expect.objectContaining({
              API_URL: expect.any(Object),
              DEBUG: expect.any(Object),
            }),
          })
        );
      });

      it('should handle cloning with variable transformations', async () => {
        const sourceEnvironment = {
          name: 'development',
          variables: {
            API_URL: TestDataFactory.createMockEnvironmentVariable({
              name: 'API_URL',
              value: 'https://dev-api.example.com',
            }),
          },
        };

        mockStorage.getEnvironment.mockResolvedValue(sourceEnvironment);

        const transformations = {
          API_URL: 'https://staging-api.example.com',
        };

        await environmentManager.cloneEnvironment('development', 'staging', transformations);

        expect(mockStorage.saveEnvironment).toHaveBeenCalledWith(
          'staging',
          expect.objectContaining({
            variables: expect.objectContaining({
              API_URL: expect.objectContaining({
                value: 'https://staging-api.example.com',
              }),
            }),
          })
        );
      });
    });

    describe('exportEnvironment', () => {
      it('should export environment to JSON', async () => {
        const environment = {
          name: 'production',
          description: 'Production environment',
          variables: {
            API_URL: TestDataFactory.createMockEnvironmentVariable({
              name: 'API_URL',
              value: 'https://api.example.com',
            }),
            SECRET: TestDataFactory.createMockEnvironmentVariable({
              name: 'SECRET',
              value: 'encrypted-value',
              encrypted: true,
            }),
          },
        };

        mockStorage.getEnvironment.mockResolvedValue(environment);
        mockEncryption.decrypt.mockResolvedValue('decrypted-secret');

        const exported = await environmentManager.exportEnvironment('production');

        expect(exported).toEqual({
          name: 'production',
          description: 'Production environment',
          variables: {
            API_URL: 'https://api.example.com',
            SECRET: 'decrypted-secret',
          },
          metadata: {
            exportedAt: expect.any(Date),
            version: expect.any(String),
          },
        });
      });

      it('should export without decrypting secrets', async () => {
        const environment = {
          name: 'production',
          variables: {
            SECRET: TestDataFactory.createMockEnvironmentVariable({
              name: 'SECRET',
              value: 'encrypted-value',
              encrypted: true,
            }),
          },
        };

        mockStorage.getEnvironment.mockResolvedValue(environment);

        const exported = await environmentManager.exportEnvironment('production', { decryptSecrets: false });

        expect(exported.variables.SECRET).toBe('[ENCRYPTED]');
        expect(mockEncryption.decrypt).not.toHaveBeenCalled();
      });
    });

    describe('importEnvironment', () => {
      it('should import environment from JSON', async () => {
        const importData = {
          name: 'imported-env',
          description: 'Imported environment',
          variables: {
            API_URL: 'https://imported-api.example.com',
            SECRET_KEY: 'imported-secret',
          },
          metadata: {
            exportedAt: new Date(),
            version: '1.0.0',
          },
        };

        await environmentManager.importEnvironment(importData);

        expect(mockStorage.saveEnvironment).toHaveBeenCalledWith(
          'imported-env',
          expect.objectContaining({
            name: 'imported-env',
            description: 'Imported environment',
            variables: expect.objectContaining({
              API_URL: expect.objectContaining({
                name: 'API_URL',
                value: 'https://imported-api.example.com',
              }),
              SECRET_KEY: expect.objectContaining({
                name: 'SECRET_KEY',
                value: 'imported-secret',
              }),
            }),
          })
        );
      });

      it('should validate import data format', async () => {
        const invalidImportData = {
          // Missing required fields
          variables: {},
        };

        await TestAssertions.expectRejectsWithError(
          environmentManager.importEnvironment(invalidImportData as any),
          ValidationError,
          'Invalid import data format'
        );
      });

      it('should handle import conflicts', async () => {
        mockStorage.getEnvironment.mockResolvedValue({
          name: 'existing-env',
          variables: {},
        });

        const importData = {
          name: 'existing-env',
          variables: {},
          metadata: { exportedAt: new Date(), version: '1.0.0' },
        };

        await TestAssertions.expectRejectsWithError(
          environmentManager.importEnvironment(importData),
          ValidationError,
          'Environment already exists: existing-env'
        );
      });
    });
  });

  describe('Variable Resolution', () => {
    it('should resolve all variables for environment', async () => {
      const variables = {
        API_URL: TestDataFactory.createMockEnvironmentVariable({
          name: 'API_URL',
          value: 'https://api.example.com',
        }),
        SECRET: TestDataFactory.createMockEnvironmentVariable({
          name: 'SECRET',
          value: 'encrypted-value',
          encrypted: true,
        }),
      };

      mockStorage.getEnvironment.mockResolvedValue({ variables });
      mockEncryption.decrypt.mockResolvedValue('decrypted-secret');

      const resolved = await environmentManager.resolveVariables('test-env');

      expect(resolved).toEqual({
        API_URL: 'https://api.example.com',
        SECRET: 'decrypted-secret',
      });
      expect(mockEncryption.decrypt).toHaveBeenCalledWith('encrypted-value');
    });

    it('should handle variable resolution errors', async () => {
      const variables = {
        CORRUPTED: TestDataFactory.createMockEnvironmentVariable({
          name: 'CORRUPTED',
          value: 'corrupted-encrypted-value',
          encrypted: true,
        }),
      };

      mockStorage.getEnvironment.mockResolvedValue({ variables });
      mockEncryption.decrypt.mockRejectedValue(new Error('Decryption failed'));

      await TestAssertions.expectRejectsWithError(
        environmentManager.resolveVariables('test-env'),
        ConfigurationError,
        'Failed to resolve variables for environment: test-env'
      );
    });
  });

  describe('Integration scenarios', () => {
    it('should handle complete environment workflow', async () => {
      // Create environment
      await environmentManager.createEnvironment('test-workflow', {
        name: 'test-workflow',
        description: 'Complete workflow test',
      });

      // Add variables
      const variables = [
        TestDataFactory.createMockEnvironmentVariable({
          name: 'API_URL',
          value: 'https://api.example.com',
          type: 'string',
        }),
        TestDataFactory.createMockEnvironmentVariable({
          name: 'API_KEY',
          value: 'secret-api-key',
          type: 'secret',
          encrypted: true,
        }),
        TestDataFactory.createMockEnvironmentVariable({
          name: 'DEBUG',
          value: 'true',
          type: 'boolean',
        }),
      ];

      mockEncryption.encrypt.mockResolvedValue('encrypted-api-key');

      for (const variable of variables) {
        await environmentManager.setVariable('test-workflow', variable);
      }

      // List variables
      mockStorage.getEnvironment.mockResolvedValue({
        variables: {
          API_URL: variables[0],
          API_KEY: { ...variables[1], value: 'encrypted-api-key' },
          DEBUG: variables[2],
        },
      });

      const listedVars = await environmentManager.listVariables('test-workflow');
      expect(listedVars).toHaveLength(3);

      // Resolve variables
      mockEncryption.decrypt.mockResolvedValue('secret-api-key');
      const resolved = await environmentManager.resolveVariables('test-workflow');
      
      expect(resolved).toEqual({
        API_URL: 'https://api.example.com',
        API_KEY: 'secret-api-key',
        DEBUG: 'true',
      });
    });
  });
});