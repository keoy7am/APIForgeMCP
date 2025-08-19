/**
 * Validation Profile Service
 * Manages validation profiles and templates
 */

import { v4 as uuidv4 } from 'uuid';
import type {
  ValidationProfile,
  ValidationTemplate,
  ValidationRule,
  ResponseData,
} from '../../types';
import { FileStorage } from '../../storage/file-storage';
import { ErrorHandler } from '../../utils/errors';
import { Logger } from '../../utils/logger';
import { CommonAssertions } from './assertion-library';

export class ValidationProfileService {
  private profiles: Map<string, ValidationProfile> = new Map();
  private templates: Map<string, ValidationTemplate> = new Map();
  private storage: FileStorage;
  private errorHandler: ErrorHandler;
  private logger: Logger;

  constructor(
    storage: FileStorage,
    errorHandler: ErrorHandler = new ErrorHandler(),
    logger: Logger = new Logger('ValidationProfileService')
  ) {
    this.storage = storage;
    this.errorHandler = errorHandler;
    this.logger = logger;
    
    this.initializeDefaultTemplates();
    this.loadProfiles();
  }

  /**
   * Create a new validation profile
   */
  async createProfile(
    name: string,
    rules: ValidationRule[],
    options?: Partial<ValidationProfile>
  ): Promise<ValidationProfile> {
    const profile: ValidationProfile = {
      id: uuidv4(),
      name,
      rules,
      defaultSeverity: options?.defaultSeverity || 'error',
      stopOnFirstError: options?.stopOnFirstError || false,
      timeout: options?.timeout || 30000,
      tags: options?.tags || [],
      description: options?.description,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.profiles.set(profile.id, profile);
    await this.saveProfiles();
    
    this.logger.info(`Created validation profile: ${name}`);
    return profile;
  }

  /**
   * Get a validation profile
   */
  getProfile(profileId: string): ValidationProfile | undefined {
    return this.profiles.get(profileId);
  }

  /**
   * List all profiles
   */
  listProfiles(tags?: string[]): ValidationProfile[] {
    let profiles = Array.from(this.profiles.values());
    
    if (tags && tags.length > 0) {
      profiles = profiles.filter(profile =>
        tags.some(tag => profile.tags?.includes(tag))
      );
    }
    
    return profiles;
  }

  /**
   * Update a profile
   */
  async updateProfile(
    profileId: string,
    updates: Partial<ValidationProfile>
  ): Promise<ValidationProfile> {
    const profile = this.profiles.get(profileId);
    if (!profile) {
      throw ErrorHandler.createError(
        'VALIDATION_PROFILE_NOT_FOUND',
        `Profile ${profileId} not found`
      );
    }

    const updatedProfile: ValidationProfile = {
      ...profile,
      ...updates,
      id: profile.id,
      createdAt: profile.createdAt,
      updatedAt: new Date(),
    };

    this.profiles.set(profileId, updatedProfile);
    await this.saveProfiles();
    
    this.logger.info(`Updated validation profile: ${updatedProfile.name}`);
    return updatedProfile;
  }

  /**
   * Delete a profile
   */
  async deleteProfile(profileId: string): Promise<void> {
    const profile = this.profiles.get(profileId);
    if (!profile) {
      throw ErrorHandler.createError(
        'VALIDATION_PROFILE_NOT_FOUND',
        `Profile ${profileId} not found`
      );
    }

    this.profiles.delete(profileId);
    await this.saveProfiles();
    
    this.logger.info(`Deleted validation profile: ${profile.name}`);
  }

  /**
   * Create profile from template
   */
  async createFromTemplate(
    templateId: string,
    name: string,
    variables?: Record<string, any>
  ): Promise<ValidationProfile> {
    const template = this.templates.get(templateId);
    if (!template) {
      throw ErrorHandler.createError(
        'VALIDATION_TEMPLATE_NOT_FOUND',
        `Template ${templateId} not found`
      );
    }

    // Apply variables to template rules
    const rules = this.applyVariablesToRules(template.rules, variables || {});

    return this.createProfile(name, rules, {
      description: `Created from template: ${template.name}`,
      tags: [`template:${template.category}`],
    });
  }

  /**
   * Get a template
   */
  getTemplate(templateId: string): ValidationTemplate | undefined {
    return this.templates.get(templateId);
  }

  /**
   * List all templates
   */
  listTemplates(category?: ValidationTemplate['category']): ValidationTemplate[] {
    let templates = Array.from(this.templates.values());
    
    if (category) {
      templates = templates.filter(t => t.category === category);
    }
    
    return templates;
  }

  /**
   * Initialize default templates
   */
  private initializeDefaultTemplates(): void {
    // REST API template
    this.templates.set('rest-api', {
      id: 'rest-api',
      name: 'REST API Validation',
      category: 'rest',
      rules: CommonAssertions.restSuccess(),
      variables: [
        {
          name: 'expectedStatus',
          description: 'Expected HTTP status code',
          type: 'number',
          default: 200,
        },
        {
          name: 'maxLatency',
          description: 'Maximum response latency in ms',
          type: 'number',
          default: 1000,
        },
      ],
    });

    // GraphQL template
    this.templates.set('graphql', {
      id: 'graphql',
      name: 'GraphQL Validation',
      category: 'graphql',
      rules: CommonAssertions.graphqlResponse(),
      variables: [
        {
          name: 'requireData',
          description: 'Require data field in response',
          type: 'boolean',
          default: true,
        },
      ],
    });

    // Paginated API template
    this.templates.set('paginated-api', {
      id: 'paginated-api',
      name: 'Paginated API Validation',
      category: 'rest',
      rules: CommonAssertions.paginatedResponse(),
      variables: [
        {
          name: 'minPageSize',
          description: 'Minimum page size',
          type: 'number',
          default: 1,
        },
        {
          name: 'maxPageSize',
          description: 'Maximum page size',
          type: 'number',
          default: 100,
        },
      ],
    });

    // Error response template
    this.templates.set('error-response', {
      id: 'error-response',
      name: 'Error Response Validation',
      category: 'rest',
      rules: CommonAssertions.errorResponse(),
      variables: [
        {
          name: 'expectedErrorCode',
          description: 'Expected error status code',
          type: 'number',
          required: false,
        },
      ],
    });

    // Performance budget template
    this.templates.set('performance-budget', {
      id: 'performance-budget',
      name: 'Performance Budget',
      category: 'custom',
      rules: CommonAssertions.performanceBudget(),
      variables: [
        {
          name: 'maxLatency',
          description: 'Maximum latency in ms',
          type: 'number',
          default: 1000,
        },
        {
          name: 'maxSize',
          description: 'Maximum response size in bytes',
          type: 'number',
          default: 100000,
        },
      ],
    });

    // SOAP template
    this.templates.set('soap', {
      id: 'soap',
      name: 'SOAP Response Validation',
      category: 'soap',
      rules: [
        {
          id: 'soap-status',
          name: 'SOAP Status',
          type: 'status',
          status: { expected: 200 },
        },
        {
          id: 'soap-content-type',
          name: 'SOAP Content Type',
          type: 'header',
          headers: [{
            name: 'content-type',
            value: /text\/xml|application\/soap\+xml/,
          }],
        },
        {
          id: 'soap-envelope',
          name: 'SOAP Envelope',
          type: 'body',
          body: {
            contains: ['<soap:Envelope', '</soap:Envelope>'],
          },
        },
      ],
      variables: [],
    });

    // WebSocket template
    this.templates.set('websocket', {
      id: 'websocket',
      name: 'WebSocket Message Validation',
      category: 'websocket',
      rules: [
        {
          id: 'ws-message-type',
          name: 'WebSocket Message Type',
          type: 'body',
          body: {
            jsonPath: [{
              path: '$.type',
              exists: true,
            }],
          },
        },
        {
          id: 'ws-message-data',
          name: 'WebSocket Message Data',
          type: 'body',
          body: {
            jsonPath: [{
              path: '$.data',
              exists: true,
            }],
          },
        },
      ],
      variables: [
        {
          name: 'expectedType',
          description: 'Expected message type',
          type: 'string',
          required: false,
        },
      ],
    });

    this.logger.debug(`Initialized ${this.templates.size} default templates`);
  }

  /**
   * Apply variables to rules
   */
  private applyVariablesToRules(
    rules: ValidationRule[],
    variables: Record<string, any>
  ): ValidationRule[] {
    // This is a simplified implementation
    // In a real system, we'd need template string replacement
    return rules.map(rule => {
      const appliedRule = { ...rule };
      
      // Example: Apply expectedStatus variable to status rules
      if (rule.type === 'status' && variables.expectedStatus !== undefined) {
        appliedRule.status = {
          ...appliedRule.status,
          expected: variables.expectedStatus,
        };
      }
      
      // Example: Apply maxLatency to performance rules
      if (rule.type === 'latency' && variables.maxLatency !== undefined) {
        appliedRule.performance = {
          ...appliedRule.performance,
          maxLatency: variables.maxLatency,
        };
      }
      
      return appliedRule;
    });
  }

  /**
   * Load profiles from storage
   */
  private async loadProfiles(): Promise<void> {
    try {
      const data = await this.storage.readData<{
        profiles: ValidationProfile[];
      }>('validation-profiles.json');
      
      if (data?.profiles) {
        for (const profile of data.profiles) {
          // Convert date strings to Date objects
          profile.createdAt = new Date(profile.createdAt);
          profile.updatedAt = new Date(profile.updatedAt);
          this.profiles.set(profile.id, profile);
        }
        
        this.logger.debug(`Loaded ${this.profiles.size} validation profiles`);
      }
    } catch (error) {
      this.logger.debug('No existing validation profiles found');
    }
  }

  /**
   * Save profiles to storage
   */
  private async saveProfiles(): Promise<void> {
    const profiles = Array.from(this.profiles.values());
    await this.storage.writeData('validation-profiles.json', { profiles });
  }

  /**
   * Export profile as JSON
   */
  exportProfile(profileId: string): string {
    const profile = this.profiles.get(profileId);
    if (!profile) {
      throw ErrorHandler.createError(
        'VALIDATION_PROFILE_NOT_FOUND',
        `Profile ${profileId} not found`
      );
    }

    return JSON.stringify(profile, null, 2);
  }

  /**
   * Import profile from JSON
   */
  async importProfile(json: string, overwrite = false): Promise<ValidationProfile> {
    try {
      const profileData = JSON.parse(json);
      
      // Generate new ID if not overwriting
      if (!overwrite) {
        profileData.id = uuidv4();
        profileData.name = `${profileData.name} (Imported)`;
      }
      
      // Convert dates
      profileData.createdAt = new Date(profileData.createdAt || Date.now());
      profileData.updatedAt = new Date();
      
      // Validate required fields
      if (!profileData.name || !profileData.rules || !Array.isArray(profileData.rules)) {
        throw new Error('Invalid profile format');
      }
      
      const profile: ValidationProfile = profileData;
      
      // Check if profile exists
      if (this.profiles.has(profile.id) && !overwrite) {
        throw ErrorHandler.createError(
          'VALIDATION_PROFILE_EXISTS',
          `Profile ${profile.id} already exists`
        );
      }
      
      this.profiles.set(profile.id, profile);
      await this.saveProfiles();
      
      this.logger.info(`Imported validation profile: ${profile.name}`);
      return profile;
    } catch (error) {
      throw ErrorHandler.createError(
        'VALIDATION_PROFILE_IMPORT_ERROR',
        `Failed to import profile: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
}