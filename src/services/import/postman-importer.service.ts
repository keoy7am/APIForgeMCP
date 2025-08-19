/**
 * Postman Collection v2.1 Importer
 * Parses and converts Postman collections to APIForge endpoints
 */

import { ApiEndpoint, HttpMethod, AuthConfig } from '../../types';
import { v4 as uuidv4 } from 'uuid';

// Postman Collection v2.1 Type Definitions
export interface PostmanCollection {
  info: PostmanInfo;
  item: PostmanItem[];
  auth?: PostmanAuth;
  event?: PostmanEvent[];
  variable?: PostmanVariable[];
  protocolProfileBehavior?: any;
}

interface PostmanInfo {
  name: string;
  _postman_id?: string;
  description?: string | PostmanDescription;
  version?: string;
  schema: string;
}

interface PostmanDescription {
  content: string;
  type?: string;
  version?: string;
}

interface PostmanItem {
  id?: string;
  name: string;
  description?: string | PostmanDescription;
  variable?: PostmanVariable[];
  event?: PostmanEvent[];
  request?: PostmanRequest | string;
  response?: PostmanResponse[];
  item?: PostmanItem[]; // For folders
  protocolProfileBehavior?: any;
}

interface PostmanRequest {
  url?: PostmanUrl | string;
  auth?: PostmanAuth;
  method?: string;
  description?: string | PostmanDescription;
  header?: PostmanHeader[];
  body?: PostmanBody;
  certificate?: PostmanCertificate;
  proxy?: PostmanProxy;
}

interface PostmanUrl {
  raw?: string;
  protocol?: string;
  auth?: PostmanAuth;
  host?: string | string[];
  port?: string;
  path?: string | string[];
  query?: PostmanQueryParam[];
  hash?: string;
  variable?: PostmanVariable[];
}

interface PostmanAuth {
  type: string;
  noauth?: any;
  apikey?: PostmanAuthApiKey[];
  awsv4?: PostmanAuthAwsV4[];
  basic?: PostmanAuthBasic[];
  bearer?: PostmanAuthBearer[];
  digest?: PostmanAuthDigest[];
  edgegrid?: PostmanAuthEdgeGrid[];
  hawk?: PostmanAuthHawk[];
  ntlm?: PostmanAuthNtlm[];
  oauth1?: PostmanAuthOAuth1[];
  oauth2?: PostmanAuthOAuth2[];
}

interface PostmanAuthApiKey {
  key: string;
  value: any;
  type?: string;
}

interface PostmanAuthAwsV4 {
  key: string;
  value: any;
  type?: string;
}

interface PostmanAuthBasic {
  key: string;
  value: any;
  type?: string;
}

interface PostmanAuthBearer {
  key: string;
  value: any;
  type?: string;
}

interface PostmanAuthDigest {
  key: string;
  value: any;
  type?: string;
}

interface PostmanAuthEdgeGrid {
  key: string;
  value: any;
  type?: string;
}

interface PostmanAuthHawk {
  key: string;
  value: any;
  type?: string;
}

interface PostmanAuthNtlm {
  key: string;
  value: any;
  type?: string;
}

interface PostmanAuthOAuth1 {
  key: string;
  value: any;
  type?: string;
}

interface PostmanAuthOAuth2 {
  key: string;
  value: any;
  type?: string;
}

interface PostmanHeader {
  key: string;
  value: string;
  type?: string;
  disabled?: boolean;
  description?: string | PostmanDescription;
}

interface PostmanBody {
  mode?: 'raw' | 'urlencoded' | 'formdata' | 'file' | 'graphql';
  raw?: string;
  urlencoded?: PostmanUrlEncoded[];
  formdata?: PostmanFormData[];
  file?: PostmanFile;
  graphql?: PostmanGraphQL;
  options?: PostmanBodyOptions;
  disabled?: boolean;
}

interface PostmanUrlEncoded {
  key: string;
  value?: string;
  disabled?: boolean;
  type?: string;
  description?: string | PostmanDescription;
}

interface PostmanFormData {
  key: string;
  value?: string;
  src?: string | string[];
  disabled?: boolean;
  type?: string;
  contentType?: string;
  description?: string | PostmanDescription;
}

interface PostmanFile {
  src?: string | null;
  content?: string;
}

interface PostmanGraphQL {
  query?: string;
  variables?: string;
}

interface PostmanBodyOptions {
  raw?: {
    language?: string;
  };
  urlencoded?: {
    contentType?: string;
  };
  formdata?: {
    contentType?: string;
  };
}

interface PostmanQueryParam {
  key: string;
  value?: string;
  disabled?: boolean;
  description?: string | PostmanDescription;
}

interface PostmanVariable {
  id?: string;
  key: string;
  value: any;
  type?: string;
  name?: string;
  description?: string | PostmanDescription;
  system?: boolean;
  disabled?: boolean;
}

interface PostmanEvent {
  listen: string;
  script?: PostmanScript;
  disabled?: boolean;
}

interface PostmanScript {
  id?: string;
  type?: string;
  exec?: string | string[];
  src?: PostmanUrl;
  name?: string;
}

interface PostmanResponse {
  id?: string;
  name?: string;
  originalRequest?: PostmanRequest;
  status?: string;
  code?: number;
  _postman_previewlanguage?: string;
  header?: PostmanHeader[] | string;
  cookie?: any[];
  body?: string;
}

interface PostmanCertificate {
  name?: string;
  matches?: string[];
  key?: PostmanCertificateKey;
  cert?: PostmanCertificateCert;
  passphrase?: string;
}

interface PostmanCertificateKey {
  src?: string;
}

interface PostmanCertificateCert {
  src?: string;
}

interface PostmanProxy {
  match?: string;
  host?: string;
  port?: number;
  tunnel?: boolean;
  disabled?: boolean;
}

/**
 * Postman Collection Importer Service
 */
export class PostmanImporter {
  private logger: any;
  private workspaceId: string;
  private collectionVariables: Map<string, any> = new Map();

  constructor(logger: any, workspaceId: string) {
    this.logger = logger;
    this.workspaceId = workspaceId;
  }

  /**
   * Import Postman collection from JSON object
   */
  async import(collection: PostmanCollection): Promise<ApiEndpoint[]> {
    this.logger.info('Importing Postman collection', {
      name: collection.info.name,
      schema: collection.info.schema,
    });

    // Validate collection version
    if (!collection.info.schema || !collection.info.schema.includes('v2.1')) {
      this.logger.warn(`Postman collection schema ${collection.info.schema} may not be fully compatible`);
    }

    // Store collection variables for replacement
    if (collection.variable) {
      collection.variable.forEach(v => {
        if (!v.disabled) {
          this.collectionVariables.set(v.key, v.value);
        }
      });
    }

    const endpoints: ApiEndpoint[] = [];
    const globalAuth = collection.auth;

    // Process items recursively (handles folders)
    this.processItems(collection.item, endpoints, globalAuth);

    this.logger.info(`Imported ${endpoints.length} endpoints from Postman collection`);
    return endpoints;
  }

  /**
   * Import from file path
   */
  async importFromFile(filePath: string): Promise<ApiEndpoint[]> {
    const fs = await import('fs/promises');
    const content = await fs.readFile(filePath, 'utf-8');
    const collection = JSON.parse(content) as PostmanCollection;
    return this.import(collection);
  }

  /**
   * Import from URL
   */
  async importFromUrl(url: string): Promise<ApiEndpoint[]> {
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`Failed to fetch Postman collection: ${response.statusText}`);
    }

    const collection = await response.json() as PostmanCollection;
    return this.import(collection);
  }

  /**
   * Process items recursively (handles folders)
   */
  private processItems(
    items: PostmanItem[],
    endpoints: ApiEndpoint[],
    parentAuth?: PostmanAuth,
    folderPath: string[] = []
  ): void {
    for (const item of items) {
      if (item.item) {
        // This is a folder, process recursively
        const newPath = [...folderPath, item.name];
        const itemAuth = (typeof item.request === 'object' && item.request?.auth) || parentAuth;
        this.processItems(item.item, endpoints, itemAuth, newPath);
      } else if (item.request) {
        // This is a request, convert to endpoint
        const endpoint = this.createEndpoint(item, parentAuth, folderPath);
        if (endpoint) {
          endpoints.push(endpoint);
        }
      }
    }
  }

  /**
   * Create an APIForge endpoint from Postman item
   */
  private createEndpoint(
    item: PostmanItem,
    parentAuth?: PostmanAuth,
    folderPath: string[] = []
  ): ApiEndpoint | null {
    if (!item.request) {
      return null;
    }

    const request = typeof item.request === 'string' 
      ? { url: item.request } 
      : item.request;

    const id = uuidv4();
    const name = item.name;
    const description = this.extractDescription(item.description);
    
    // Parse URL
    const urlData = this.parseUrl(request.url);
    if (!urlData) {
      this.logger.warn(`Skipping item "${name}" - invalid URL`);
      return null;
    }

    // Extract method
    const method = (request.method || 'GET').toUpperCase() as HttpMethod;

    // Extract headers
    const headers = this.extractHeaders(request.header);

    // Extract query parameters
    const queryParams = this.extractQueryParams(urlData.query);

    // Extract body
    const body = this.extractBody(headers, request.body);

    // Extract authentication
    const auth = this.extractAuthentication(request.auth || parentAuth);

    // Build tags from folder path
    const tags = folderPath.length > 0 ? folderPath : undefined;

    return {
      id,
      workspaceId: this.workspaceId,
      name,
      description,
      method,
      url: urlData.url,
      headers: Object.keys(headers).length > 0 ? headers : undefined,
      queryParams: Object.keys(queryParams).length > 0 ? queryParams : undefined,
      body,
      authentication: auth,
      tags,
      timeout: 30000,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  /**
   * Parse Postman URL
   */
  private parseUrl(url?: PostmanUrl | string): { url: string; query?: PostmanQueryParam[] } | null {
    if (!url) {
      return null;
    }

    if (typeof url === 'string') {
      // Replace Postman variables
      const processedUrl = this.replaceVariables(url);
      return { url: processedUrl };
    }

    // Build URL from components
    let fullUrl = '';

    if (url.raw) {
      fullUrl = this.replaceVariables(url.raw);
    } else {
      // Build from components
      const protocol = url.protocol || 'http';
      const host = Array.isArray(url.host) ? url.host.join('.') : (url.host || 'localhost');
      const port = url.port ? `:${url.port}` : '';
      const path = Array.isArray(url.path) 
        ? '/' + url.path.map(p => this.replaceVariables(p)).join('/')
        : (url.path || '');
      
      fullUrl = `${protocol}://${host}${port}${path}`;
    }

    return {
      url: fullUrl,
      query: url.query
    };
  }

  /**
   * Extract headers from Postman format
   */
  private extractHeaders(headers?: PostmanHeader[]): Record<string, string> {
    const result: Record<string, string> = {};
    
    if (!headers) {
      return result;
    }

    for (const header of headers) {
      if (!header.disabled && header.key && header.value) {
        result[header.key] = this.replaceVariables(header.value);
      }
    }

    return result;
  }

  /**
   * Extract query parameters
   */
  private extractQueryParams(params?: PostmanQueryParam[]): Record<string, string> {
    const result: Record<string, string> = {};
    
    if (!params) {
      return result;
    }

    for (const param of params) {
      if (!param.disabled && param.key) {
        result[param.key] = this.replaceVariables(param.value || '');
      }
    }

    return result;
  }

  /**
   * Extract request body
   */
  private extractBody(headers: Record<string, string>, body?: PostmanBody): any {
    if (!body || body.disabled) {
      return null;
    }

    switch (body.mode) {
      case 'raw':
        if (body.raw) {
          const processed = this.replaceVariables(body.raw);
          
          // Try to parse as JSON if content type suggests it
          if (body.options?.raw?.language === 'json' || 
              headers['Content-Type']?.includes('json')) {
            try {
              return JSON.parse(processed);
            } catch {
              return processed;
            }
          }
          
          return processed;
        }
        break;
      
      case 'urlencoded':
        if (body.urlencoded) {
          const result: Record<string, string> = {};
          for (const param of body.urlencoded) {
            if (!param.disabled && param.key) {
              result[param.key] = this.replaceVariables(param.value || '');
            }
          }
          return result;
        }
        break;
      
      case 'formdata':
        if (body.formdata) {
          const result: Record<string, any> = {};
          for (const field of body.formdata) {
            if (!field.disabled && field.key) {
              if (field.type === 'file') {
                result[field.key] = {
                  type: 'file',
                  src: field.src
                };
              } else {
                result[field.key] = this.replaceVariables(field.value || '');
              }
            }
          }
          return result;
        }
        break;
      
      case 'graphql':
        if (body.graphql) {
          return {
            query: body.graphql.query,
            variables: body.graphql.variables ? 
              JSON.parse(body.graphql.variables) : undefined
          };
        }
        break;
    }

    return null;
  }

  /**
   * Extract authentication configuration
   */
  private extractAuthentication(auth?: PostmanAuth): AuthConfig {
    if (!auth) {
      return { type: 'none' };
    }

    switch (auth.type) {
      case 'noauth':
        return { type: 'none' };
      
      case 'basic':
        const basicAuth = auth.basic || [];
        const username = basicAuth.find(a => a.key === 'username')?.value || '{{username}}';
        const password = basicAuth.find(a => a.key === 'password')?.value || '{{password}}';
        
        return {
          type: 'basic',
          credentials: {
            username: this.replaceVariables(username),
            password: this.replaceVariables(password),
          },
        };
      
      case 'bearer':
        const bearerAuth = auth.bearer || [];
        const token = bearerAuth.find(a => a.key === 'token')?.value || '{{bearerToken}}';
        
        return {
          type: 'bearer',
          credentials: {
            token: this.replaceVariables(token),
          },
        };
      
      case 'apikey':
        const apikeyAuth = auth.apikey || [];
        const key = apikeyAuth.find(a => a.key === 'key')?.value || 'X-API-Key';
        const value = apikeyAuth.find(a => a.key === 'value')?.value || '{{apiKey}}';
        const location = apikeyAuth.find(a => a.key === 'in')?.value || 'header';
        
        return {
          type: 'apikey',
          credentials: {
            key: this.replaceVariables(key),
            value: this.replaceVariables(value),
            location: location as 'header' | 'query',
          },
        };
      
      case 'oauth2':
        const oauth2Auth = auth.oauth2 || [];
        const accessToken = oauth2Auth.find(a => a.key === 'accessToken')?.value || '{{accessToken}}';
        const refreshToken = oauth2Auth.find(a => a.key === 'refreshToken')?.value || '{{refreshToken}}';
        
        return {
          type: 'oauth2',
          credentials: {
            accessToken: this.replaceVariables(accessToken),
            refreshToken: this.replaceVariables(refreshToken),
            tokenType: 'Bearer',
            expiresAt: new Date(Date.now() + 3600000),
          },
        };
      
      default:
        this.logger.warn(`Unsupported auth type: ${auth.type}`);
        return { type: 'none' };
    }
  }

  /**
   * Replace Postman variables with APIForge variable syntax
   */
  private replaceVariables(text: string): string {
    if (!text) return text;

    // Replace Postman {{variable}} with our {{variable}} syntax (same format)
    // But replace collection variables with their actual values
    let result = text;

    // Replace collection variables with actual values
    this.collectionVariables.forEach((value, key) => {
      const pattern = new RegExp(`{{${key}}}`, 'g');
      result = result.replace(pattern, value);
    });

    // Keep other variables as-is for environment replacement
    return result;
  }

  /**
   * Extract description as string
   */
  private extractDescription(desc?: string | PostmanDescription): string | undefined {
    if (!desc) return undefined;
    
    if (typeof desc === 'string') {
      return desc;
    }
    
    return desc.content;
  }
}