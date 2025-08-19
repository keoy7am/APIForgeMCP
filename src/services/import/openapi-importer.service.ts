/**
 * OpenAPI 3.0 Specification Importer
 * Parses and converts OpenAPI specs to APIForge endpoints
 */

import { ApiEndpoint, HttpMethod, AuthConfig } from '../../types';
import { v4 as uuidv4 } from 'uuid';

// OpenAPI 3.0 Type Definitions
export interface OpenAPIDocument {
  openapi: string;
  info: OpenAPIInfo;
  servers?: OpenAPIServer[];
  paths: OpenAPIPaths;
  components?: OpenAPIComponents;
  security?: OpenAPISecurityRequirement[];
  tags?: OpenAPITag[];
}

interface OpenAPIInfo {
  title: string;
  version: string;
  description?: string;
  termsOfService?: string;
  contact?: OpenAPIContact;
  license?: OpenAPILicense;
}

interface OpenAPIContact {
  name?: string;
  url?: string;
  email?: string;
}

interface OpenAPILicense {
  name: string;
  url?: string;
}

interface OpenAPIServer {
  url: string;
  description?: string;
  variables?: Record<string, OpenAPIServerVariable>;
}

interface OpenAPIServerVariable {
  enum?: string[];
  default: string;
  description?: string;
}

interface OpenAPIPaths {
  [path: string]: OpenAPIPathItem;
}

interface OpenAPIPathItem {
  summary?: string;
  description?: string;
  get?: OpenAPIOperation;
  put?: OpenAPIOperation;
  post?: OpenAPIOperation;
  delete?: OpenAPIOperation;
  options?: OpenAPIOperation;
  head?: OpenAPIOperation;
  patch?: OpenAPIOperation;
  trace?: OpenAPIOperation;
  servers?: OpenAPIServer[];
  parameters?: OpenAPIParameter[];
}

interface OpenAPIOperation {
  tags?: string[];
  summary?: string;
  description?: string;
  externalDocs?: OpenAPIExternalDocs;
  operationId?: string;
  parameters?: OpenAPIParameter[];
  requestBody?: OpenAPIRequestBody;
  responses: OpenAPIResponses;
  callbacks?: Record<string, any>;
  deprecated?: boolean;
  security?: OpenAPISecurityRequirement[];
  servers?: OpenAPIServer[];
}

interface OpenAPIExternalDocs {
  description?: string;
  url: string;
}

interface OpenAPIParameter {
  name: string;
  in: 'query' | 'header' | 'path' | 'cookie';
  description?: string;
  required?: boolean;
  deprecated?: boolean;
  allowEmptyValue?: boolean;
  style?: string;
  explode?: boolean;
  allowReserved?: boolean;
  schema?: OpenAPISchema;
  example?: any;
  examples?: Record<string, OpenAPIExample>;
}

interface OpenAPIRequestBody {
  description?: string;
  content: Record<string, OpenAPIMediaType>;
  required?: boolean;
}

interface OpenAPIMediaType {
  schema?: OpenAPISchema;
  example?: any;
  examples?: Record<string, OpenAPIExample>;
  encoding?: Record<string, any>;
}

interface OpenAPIResponses {
  [statusCode: string]: OpenAPIResponse;
}

interface OpenAPIResponse {
  description: string;
  headers?: Record<string, OpenAPIHeader>;
  content?: Record<string, OpenAPIMediaType>;
  links?: Record<string, any>;
}

interface OpenAPIHeader {
  description?: string;
  required?: boolean;
  deprecated?: boolean;
  allowEmptyValue?: boolean;
  style?: string;
  explode?: boolean;
  allowReserved?: boolean;
  schema?: OpenAPISchema;
  example?: any;
  examples?: Record<string, OpenAPIExample>;
}

interface OpenAPISchema {
  type?: string;
  format?: string;
  title?: string;
  description?: string;
  default?: any;
  multipleOf?: number;
  maximum?: number;
  exclusiveMaximum?: boolean;
  minimum?: number;
  exclusiveMinimum?: boolean;
  maxLength?: number;
  minLength?: number;
  pattern?: string;
  maxItems?: number;
  minItems?: number;
  uniqueItems?: boolean;
  maxProperties?: number;
  minProperties?: number;
  required?: string[];
  enum?: any[];
  properties?: Record<string, OpenAPISchema>;
  additionalProperties?: boolean | OpenAPISchema;
  items?: OpenAPISchema;
  allOf?: OpenAPISchema[];
  oneOf?: OpenAPISchema[];
  anyOf?: OpenAPISchema[];
  not?: OpenAPISchema;
  discriminator?: OpenAPIDiscriminator;
  readOnly?: boolean;
  writeOnly?: boolean;
  xml?: any;
  externalDocs?: OpenAPIExternalDocs;
  example?: any;
  deprecated?: boolean;
}

interface OpenAPIDiscriminator {
  propertyName: string;
  mapping?: Record<string, string>;
}

interface OpenAPIExample {
  summary?: string;
  description?: string;
  value?: any;
  externalValue?: string;
}

interface OpenAPISecurityRequirement {
  [name: string]: string[];
}

interface OpenAPIComponents {
  schemas?: Record<string, OpenAPISchema>;
  responses?: Record<string, OpenAPIResponse>;
  parameters?: Record<string, OpenAPIParameter>;
  examples?: Record<string, OpenAPIExample>;
  requestBodies?: Record<string, OpenAPIRequestBody>;
  headers?: Record<string, OpenAPIHeader>;
  securitySchemes?: Record<string, OpenAPISecurityScheme>;
  links?: Record<string, any>;
  callbacks?: Record<string, any>;
}

interface OpenAPISecurityScheme {
  type: 'apiKey' | 'http' | 'oauth2' | 'openIdConnect';
  description?: string;
  name?: string;
  in?: 'query' | 'header' | 'cookie';
  scheme?: string;
  bearerFormat?: string;
  flows?: any;
  openIdConnectUrl?: string;
}

interface OpenAPITag {
  name: string;
  description?: string;
  externalDocs?: OpenAPIExternalDocs;
}

/**
 * OpenAPI Importer Service
 */
export class OpenAPIImporter {
  private logger: any;
  private workspaceId: string;

  constructor(logger: any, workspaceId: string) {
    this.logger = logger;
    this.workspaceId = workspaceId;
  }

  /**
   * Import OpenAPI specification from JSON/YAML object
   */
  async import(spec: OpenAPIDocument): Promise<ApiEndpoint[]> {
    this.logger.info('Importing OpenAPI specification', {
      title: spec.info.title,
      version: spec.info.version,
      openapi: spec.openapi,
    });

    // Validate OpenAPI version
    if (!spec.openapi || !spec.openapi.startsWith('3.')) {
      throw new Error(`Unsupported OpenAPI version: ${spec.openapi}. Only 3.x is supported.`);
    }

    const endpoints: ApiEndpoint[] = [];
    const baseUrl = this.getBaseUrl(spec.servers);
    const globalSecurity = spec.security;
    const securitySchemes = spec.components?.securitySchemes;

    // Process each path
    for (const [path, pathItem] of Object.entries(spec.paths || {})) {
      // Process each operation in the path
      for (const [method, operation] of Object.entries(pathItem)) {
        if (this.isHttpMethod(method) && operation && typeof operation === 'object') {
          const endpoint = this.createEndpoint(
            path,
            method as HttpMethod,
            operation as OpenAPIOperation,
            baseUrl,
            pathItem.parameters,
            globalSecurity,
            securitySchemes
          );
          endpoints.push(endpoint);
        }
      }
    }

    this.logger.info(`Imported ${endpoints.length} endpoints from OpenAPI spec`);
    return endpoints;
  }

  /**
   * Import from file path (JSON or YAML)
   */
  async importFromFile(filePath: string): Promise<ApiEndpoint[]> {
    const fs = await import('fs/promises');
    const yaml = await import('js-yaml');
    
    const content = await fs.readFile(filePath, 'utf-8');
    let spec: OpenAPIDocument;

    if (filePath.endsWith('.yaml') || filePath.endsWith('.yml')) {
      spec = yaml.load(content) as OpenAPIDocument;
    } else {
      spec = JSON.parse(content) as OpenAPIDocument;
    }

    return this.import(spec);
  }

  /**
   * Import from URL
   */
  async importFromUrl(url: string): Promise<ApiEndpoint[]> {
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`Failed to fetch OpenAPI spec: ${response.statusText}`);
    }

    const contentType = response.headers.get('content-type') || '';
    let spec: OpenAPIDocument;

    if (contentType.includes('yaml') || contentType.includes('yml')) {
      const yaml = await import('js-yaml');
      const text = await response.text();
      spec = yaml.load(text) as OpenAPIDocument;
    } else {
      spec = await response.json() as OpenAPIDocument;
    }

    return this.import(spec);
  }

  /**
   * Create an APIForge endpoint from OpenAPI operation
   */
  private createEndpoint(
    path: string,
    method: HttpMethod,
    operation: OpenAPIOperation,
    baseUrl: string,
    pathParameters?: OpenAPIParameter[],
    globalSecurity?: OpenAPISecurityRequirement[],
    securitySchemes?: Record<string, OpenAPISecurityScheme>
  ): ApiEndpoint {
    const id = uuidv4();
    const name = operation.operationId || `${method} ${path}`;
    const description = operation.summary || operation.description;
    
    // Combine path and operation parameters
    const allParameters = [
      ...(pathParameters || []),
      ...(operation.parameters || [])
    ];

    // Build URL with path parameters as variables
    let url = baseUrl + path;
    const pathParams = allParameters.filter(p => p.in === 'path');
    pathParams.forEach(param => {
      url = url.replace(`{${param.name}}`, `{{${param.name}}}`);
    });

    // Extract query parameters
    const queryParams: Record<string, string> = {};
    allParameters
      .filter(p => p.in === 'query')
      .forEach(param => {
        queryParams[param.name] = param.example || `{{${param.name}}}`;
      });

    // Extract headers
    const headers: Record<string, string> = {};
    allParameters
      .filter(p => p.in === 'header')
      .forEach(param => {
        headers[param.name] = param.example || `{{${param.name}}}`;
      });

    // Process request body
    let body: any = null;
    if (operation.requestBody && operation.requestBody.content) {
      const content = operation.requestBody.content;
      
      // Prefer JSON content
      if (content['application/json']) {
        headers['Content-Type'] = 'application/json';
        body = content['application/json'].example || 
               this.generateExampleFromSchema(content['application/json'].schema);
      } else if (content['application/x-www-form-urlencoded']) {
        headers['Content-Type'] = 'application/x-www-form-urlencoded';
        body = content['application/x-www-form-urlencoded'].example || {};
      } else if (content['multipart/form-data']) {
        headers['Content-Type'] = 'multipart/form-data';
        body = content['multipart/form-data'].example || {};
      }
    }

    // Process authentication
    const auth = this.extractAuthentication(
      operation.security || globalSecurity,
      securitySchemes
    );

    // Extract tags
    const tags = operation.tags || [];

    return {
      id,
      workspaceId: this.workspaceId,
      name,
      description,
      method: method.toUpperCase() as HttpMethod,
      url,
      headers: Object.keys(headers).length > 0 ? headers : undefined,
      queryParams: Object.keys(queryParams).length > 0 ? queryParams : undefined,
      body,
      authentication: auth,
      tags: tags.length > 0 ? tags : undefined,
      timeout: 30000,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  /**
   * Extract authentication configuration from security requirements
   */
  private extractAuthentication(
    security?: OpenAPISecurityRequirement[],
    securitySchemes?: Record<string, OpenAPISecurityScheme>
  ): AuthConfig | undefined {
    if (!security || security.length === 0 || !securitySchemes) {
      return { type: 'none' };
    }

    // Use the first security requirement
    const requirement = security[0];
    const schemeName = Object.keys(requirement)[0];
    const scheme = securitySchemes[schemeName];

    if (!scheme) {
      return { type: 'none' };
    }

    switch (scheme.type) {
      case 'http':
        if (scheme.scheme === 'basic') {
          return {
            type: 'basic',
            credentials: {
              username: '{{username}}',
              password: '{{password}}',
            },
          };
        } else if (scheme.scheme === 'bearer') {
          return {
            type: 'bearer',
            credentials: {
              token: '{{bearerToken}}',
            },
          };
        }
        break;
      
      case 'apiKey':
        return {
          type: 'apikey',
          credentials: {
            key: scheme.name || 'X-API-Key',
            value: '{{apiKey}}',
            location: scheme.in || 'header',
          },
        };
      
      case 'oauth2':
        return {
          type: 'oauth2',
          credentials: {
            accessToken: '{{accessToken}}',
            refreshToken: '{{refreshToken}}',
            tokenType: 'Bearer',
            expiresAt: new Date(Date.now() + 3600000), // 1 hour from now
          },
        };
    }

    return { type: 'none' };
  }

  /**
   * Generate example from OpenAPI schema
   */
  private generateExampleFromSchema(schema?: OpenAPISchema): any {
    if (!schema) return {};

    if (schema.example !== undefined) {
      return schema.example;
    }

    switch (schema.type) {
      case 'object':
        const obj: any = {};
        if (schema.properties) {
          for (const [key, propSchema] of Object.entries(schema.properties)) {
            obj[key] = this.generateExampleFromSchema(propSchema);
          }
        }
        return obj;
      
      case 'array':
        return [this.generateExampleFromSchema(schema.items)];
      
      case 'string':
        if (schema.enum && schema.enum.length > 0) {
          return schema.enum[0];
        }
        if (schema.format === 'date') return '2025-01-01';
        if (schema.format === 'date-time') return '2025-01-01T00:00:00Z';
        if (schema.format === 'email') return 'user@example.com';
        if (schema.format === 'uuid') return '123e4567-e89b-12d3-a456-426614174000';
        return 'string';
      
      case 'number':
      case 'integer':
        if (schema.enum && schema.enum.length > 0) {
          return schema.enum[0];
        }
        if (schema.minimum !== undefined) return schema.minimum;
        return schema.type === 'integer' ? 0 : 0.0;
      
      case 'boolean':
        return false;
      
      default:
        return null;
    }
  }

  /**
   * Get base URL from servers array
   */
  private getBaseUrl(servers?: OpenAPIServer[]): string {
    if (!servers || servers.length === 0) {
      return 'http://localhost';
    }

    let url = servers[0].url;
    
    // Replace server variables with their default values
    if (servers[0].variables) {
      for (const [varName, varDef] of Object.entries(servers[0].variables)) {
        url = url.replace(`{${varName}}`, varDef.default);
      }
    }

    // Remove trailing slash
    return url.replace(/\/$/, '');
  }

  /**
   * Check if a string is a valid HTTP method
   */
  private isHttpMethod(method: string): boolean {
    const methods = ['get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace'];
    return methods.includes(method.toLowerCase());
  }
}