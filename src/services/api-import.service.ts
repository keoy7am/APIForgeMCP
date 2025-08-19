/**
 * API import service for OpenAPI and Postman collections
 */

import { IStorage } from '../storage';
import { Collection, ApiEndpoint, Environment, Variables } from '../types';
import { Logger } from '../utils/logger';

export interface ImportResult {
  success: boolean;
  collectionId?: string;
  environmentId?: string;
  endpointsImported?: number;
  variablesImported?: number;
  variablesCreated?: number;
  errors?: string[];
}

export interface ImportOptions {
  workspaceId: string;
  collectionName?: string;
  createEnvironment?: boolean;
}

export class APIImporter {
  private logger: Logger;

  constructor(private storage: IStorage) {
    this.logger = new Logger('APIImporter');
  }

  async importFromOpenAPI(spec: any, options: ImportOptions): Promise<ImportResult> {
    this.logger.info('Importing from OpenAPI', { title: spec.info?.title });
    
    const result: ImportResult = {
      success: false,
      endpointsImported: 0,
      variablesImported: 0,
      errors: [],
    };

    try {
      // Parse OpenAPI spec
      const openApiSpec = typeof spec === 'string' ? JSON.parse(spec) : spec;
      
      // Create collection
      const collection: Collection = {
        id: `col_${Date.now()}`,
        name: options.collectionName || openApiSpec.info?.title || 'Imported API',
        description: openApiSpec.info?.description,
        workspaceId: options.workspaceId,
        endpoints: [],
        folders: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      // Parse paths and create endpoints
      if (openApiSpec.paths) {
        for (const [path, pathItem] of Object.entries(openApiSpec.paths as any)) {
          for (const [method, operation] of Object.entries(pathItem as any)) {
            if (['get', 'post', 'put', 'patch', 'delete', 'head', 'options'].includes(method.toLowerCase())) {
              const typedOperation = operation as any;
              const endpoint: ApiEndpoint = {
                id: `ep_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                workspaceId: options.workspaceId,
                name: typedOperation.summary || typedOperation.operationId || `${method.toUpperCase()} ${path}`,
                description: typedOperation.description,
                method: method.toUpperCase() as any,
                url: this.buildUrlFromOpenAPI(openApiSpec.servers?.[0]?.url || '', path),
                headers: this.extractHeadersFromOpenAPI(typedOperation),
                queryParams: this.extractQueryParamsFromOpenAPI(typedOperation),
                body: this.extractBodyFromOpenAPI(typedOperation),
                authentication: this.extractAuthFromOpenAPI(typedOperation, openApiSpec),
                collectionId: collection.id,
                createdAt: new Date(),
                updatedAt: new Date(),
              };
              
              collection.endpoints.push(endpoint);
              result.endpointsImported!++;
            }
          }
        }
      }

      // Save collection
      await this.storage.saveCollection(collection);
      result.collectionId = collection.id;

      // Create environment if requested
      if (options.createEnvironment && openApiSpec.servers?.[0]?.variables) {
        const environment = await this.createEnvironmentFromOpenAPI(
          openApiSpec,
          options.workspaceId
        );
        result.environmentId = environment.id;
        result.variablesCreated = Object.keys(environment.variables).length;
      }

      result.success = true;
    } catch (error: any) {
      this.logger.error('Failed to import OpenAPI spec', error);
      result.errors?.push(error.message);
    }

    return result;
  }

  async importFromPostman(collection: any, options: ImportOptions): Promise<ImportResult> {
    this.logger.info('Importing from Postman', { name: collection.info?.name });
    
    const result: ImportResult = {
      success: false,
      endpointsImported: 0,
      variablesImported: 0,
      errors: [],
    };

    try {
      // Parse Postman collection
      const postmanCollection = typeof collection === 'string' ? JSON.parse(collection) : collection;
      
      // Create collection
      const newCollection: Collection = {
        id: `col_${Date.now()}`,
        name: options.collectionName || postmanCollection.info?.name || 'Imported Collection',
        description: postmanCollection.info?.description,
        workspaceId: options.workspaceId,
        endpoints: [],
        folders: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      // Parse items recursively
      if (postmanCollection.item) {
        this.parsePostmanItems(postmanCollection.item, newCollection, result, options);
      }

      // Save collection
      await this.storage.saveCollection(newCollection);
      result.collectionId = newCollection.id;

      // Create environment from variables
      if (postmanCollection.variable && postmanCollection.variable.length > 0) {
        const environment = await this.createEnvironmentFromPostman(
          postmanCollection,
          options.workspaceId
        );
        result.environmentId = environment.id;
        result.variablesImported = postmanCollection.variable.length;
      }

      result.success = true;
    } catch (error: any) {
      this.logger.error('Failed to import Postman collection', error);
      result.errors?.push(error.message);
    }

    return result;
  }

  private parsePostmanItems(items: any[], collection: Collection, result: ImportResult, options: ImportOptions, folderId?: string) {
    for (const item of items) {
      if (item.item) {
        // It's a folder
        const folder = {
          id: `folder_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          name: item.name,
          description: item.description,
          parentId: folderId,
          endpoints: [],
          subFolders: [],
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        collection.folders = collection.folders || [];
        collection.folders.push(folder);
        
        // Recursively parse items in folder
        this.parsePostmanItems(item.item, collection, result, options, folder.id);
      } else if (item.request) {
        // It's a request
        const endpoint: ApiEndpoint = {
          id: `ep_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          workspaceId: options.workspaceId,
          name: item.name,
          description: item.description,
          method: item.request.method as any,
          url: this.extractUrlFromPostman(item.request.url),
          headers: this.extractHeadersFromPostman(item.request.header),
          body: this.extractBodyFromPostman(item.request.body),
          authentication: this.extractAuthFromPostman(item.request.auth || item.auth),
          folderId,
          collectionId: collection.id,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        
        collection.endpoints.push(endpoint);
        result.endpointsImported!++;
      }
    }
  }

  private buildUrlFromOpenAPI(baseUrl: string, path: string): string {
    // Remove trailing slash from base URL and leading slash from path
    const cleanBase = baseUrl.replace(/\/$/, '');
    const cleanPath = path.replace(/^\//, '');
    return `${cleanBase}/${cleanPath}`;
  }

  private extractHeadersFromOpenAPI(operation: any): Record<string, string> {
    const headers: Record<string, string> = {};
    
    if (operation.parameters) {
      for (const param of operation.parameters) {
        if (param.in === 'header') {
          headers[param.name] = param.schema?.default || `{{${param.name}}}`;
        }
      }
    }
    
    return headers;
  }

  private extractQueryParamsFromOpenAPI(operation: any): Record<string, string> {
    const params: Record<string, string> = {};
    
    if (operation.parameters) {
      for (const param of operation.parameters) {
        if (param.in === 'query' && param.name) {
          params[param.name] = param.schema?.default || `{{${param.name}}}`;
        }
      }
    }
    
    return params;
  }

  private extractBodyFromOpenAPI(operation: any): any {
    if (operation.requestBody?.content) {
      const contentTypes = Object.keys(operation.requestBody.content);
      if (contentTypes.length === 0) return null;
      
      const contentType = contentTypes[0];
      const schema = operation.requestBody.content[contentType]?.schema;
      
      if (schema?.example) {
        return schema.example;
      }
      
      // Generate sample body from schema
      return this.generateSampleFromSchema(schema);
    }
    
    return undefined;
  }

  private generateSampleFromSchema(schema: any): any {
    if (!schema) return undefined;
    
    if (schema.type === 'object') {
      const obj: any = {};
      if (schema.properties) {
        for (const [key, prop] of Object.entries(schema.properties as any)) {
          obj[key] = this.generateSampleFromSchema(prop);
        }
      }
      return obj;
    }
    
    if (schema.type === 'array') {
      return [this.generateSampleFromSchema(schema.items)];
    }
    
    // Return default values based on type
    switch (schema.type) {
      case 'string': return schema.example || 'string';
      case 'number': return schema.example || 0;
      case 'integer': return schema.example || 0;
      case 'boolean': return schema.example || false;
      default: return null;
    }
  }

  private extractAuthFromOpenAPI(operation: any, spec: any): any {
    if (operation.security && operation.security.length > 0) {
      const securityReq = operation.security[0];
      const securityScheme = Object.keys(securityReq)[0];
      const scheme = spec.components?.securitySchemes?.[securityScheme];
      
      if (scheme) {
        switch (scheme.type) {
          case 'http':
            if (scheme.scheme === 'bearer') {
              return { type: 'bearer', credentials: { token: '{{bearer_token}}' } };
            }
            if (scheme.scheme === 'basic') {
              return { type: 'basic', credentials: { username: '{{username}}', password: '{{password}}' } };
            }
            break;
          case 'apiKey':
            return {
              type: 'apikey',
              credentials: {
                key: scheme.name,
                value: `{{${scheme.name}}}`,
                location: scheme.in,
              },
            };
          case 'oauth2':
            return { type: 'oauth2', credentials: { accessToken: '{{oauth_token}}' } };
        }
      }
    }
    
    return undefined;
  }

  private extractUrlFromPostman(url: any): string {
    if (typeof url === 'string') {
      return url;
    }
    
    if (url.raw) {
      return url.raw;
    }
    
    // Build from parts
    if (url.protocol && url.host && url.path) {
      const host = Array.isArray(url.host) ? url.host.join('.') : url.host;
      const path = Array.isArray(url.path) ? url.path.join('/') : url.path;
      return `${url.protocol}://${host}/${path}`;
    }
    
    return '';
  }

  private extractHeadersFromPostman(headers: any[]): Record<string, string> {
    if (!headers) return {};
    
    const headerObj: Record<string, string> = {};
    for (const header of headers) {
      if (header.key && !header.disabled) {
        headerObj[header.key] = header.value;
      }
    }
    return headerObj;
  }

  private extractBodyFromPostman(body: any): any {
    if (!body) return undefined;
    
    switch (body.mode) {
      case 'raw':
        try {
          return JSON.parse(body.raw);
        } catch {
          return body.raw;
        }
      case 'urlencoded':
        const formData: Record<string, string> = {};
        if (body.urlencoded) {
          for (const param of body.urlencoded) {
            formData[param.key] = param.value;
          }
        }
        return formData;
      case 'formdata':
        const multipart: Record<string, any> = { fields: {} };
        if (body.formdata) {
          for (const param of body.formdata) {
            if (param.type === 'file') {
              multipart.files = multipart.files || [];
              multipart.files.push({ name: param.key, src: param.src });
            } else {
              multipart.fields[param.key] = param.value;
            }
          }
        }
        return multipart;
      default:
        return undefined;
    }
  }

  private extractAuthFromPostman(auth: any): any {
    if (!auth) return undefined;
    
    switch (auth.type) {
      case 'bearer':
        return {
          type: 'bearer',
          credentials: {
            token: auth.bearer?.[0]?.value || '{{bearer_token}}',
          },
        };
      case 'basic':
        return {
          type: 'basic',
          credentials: {
            username: auth.basic?.find((p: any) => p.key === 'username')?.value || '{{username}}',
            password: auth.basic?.find((p: any) => p.key === 'password')?.value || '{{password}}',
          },
        };
      case 'apikey':
        return {
          type: 'apikey',
          credentials: {
            key: auth.apikey?.find((p: any) => p.key === 'key')?.value || 'X-API-Key',
            value: auth.apikey?.find((p: any) => p.key === 'value')?.value || '{{api_key}}',
            location: auth.apikey?.find((p: any) => p.key === 'in')?.value || 'header',
          },
        };
      case 'oauth2':
        return {
          type: 'oauth2',
          credentials: {
            accessToken: auth.oauth2?.find((p: any) => p.key === 'accessToken')?.value || '{{oauth_token}}',
          },
        };
      default:
        return undefined;
    }
  }

  private async createEnvironmentFromOpenAPI(spec: any, workspaceId: string): Promise<Environment> {
    const variables: Variables = {};
    
    // Add server variables
    if (spec.servers?.[0]?.variables) {
      for (const [key, varDef] of Object.entries(spec.servers[0].variables as any)) {
        const typedVarDef = varDef as any;
        variables[key] = {
          name: key,
          value: typedVarDef.default || '',
          description: typedVarDef.description,
          encrypted: false,
        };
      }
    }
    
    const environment: Environment = {
      id: `env_${Date.now()}`,
      name: `${spec.info?.title || 'API'} Environment`,
      workspaceId,
      variables,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    
    await this.storage.saveEnvironment(environment);
    return environment;
  }

  private async createEnvironmentFromPostman(collection: any, workspaceId: string): Promise<Environment> {
    const variables: Variables = {};
    
    if (collection.variable) {
      for (const variable of collection.variable) {
        variables[variable.key] = {
          name: variable.key,
          value: variable.value || '',
          description: variable.description,
          encrypted: variable.type === 'secret',
        };
      }
    }
    
    const environment: Environment = {
      id: `env_${Date.now()}`,
      name: `${collection.info?.name || 'Collection'} Environment`,
      workspaceId,
      variables,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    
    await this.storage.saveEnvironment(environment);
    return environment;
  }
}