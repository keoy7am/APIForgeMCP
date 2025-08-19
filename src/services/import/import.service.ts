/**
 * Unified Import Service
 * Auto-detects format and delegates to appropriate importer
 */

import { ApiEndpoint } from '../../types';
import { OpenAPIImporter, OpenAPIDocument } from './openapi-importer.service';
import { PostmanImporter, PostmanCollection } from './postman-importer.service';

export type ImportFormat = 'openapi' | 'postman' | 'auto';

export interface ImportOptions {
  format?: ImportFormat;
  workspaceId: string;
  source: 'file' | 'url' | 'data';
  path?: string; // For file or URL
  data?: any; // For direct data import
}

export interface ImportResult {
  format: 'openapi' | 'postman';
  version: string;
  endpoints: ApiEndpoint[];
  metadata: {
    title?: string;
    description?: string;
    importedAt: Date;
    sourceType: 'file' | 'url' | 'data';
    source?: string;
  };
}

/**
 * Unified Import Service
 */
export class ImportService {
  private logger: any;
  private openApiImporter: OpenAPIImporter;
  private postmanImporter: PostmanImporter;

  constructor(logger: any) {
    this.logger = logger;
    this.openApiImporter = new OpenAPIImporter(logger, '');
    this.postmanImporter = new PostmanImporter(logger, '');
  }

  /**
   * Import API definitions with auto-detection
   */
  async import(options: ImportOptions): Promise<ImportResult> {
    this.logger.info('Starting import', {
      format: options.format,
      source: options.source,
      workspaceId: options.workspaceId,
    });

    // Update workspace ID for importers
    this.openApiImporter = new OpenAPIImporter(this.logger, options.workspaceId);
    this.postmanImporter = new PostmanImporter(this.logger, options.workspaceId);

    let data: any;
    let sourcePath: string | undefined;

    // Load data based on source type
    switch (options.source) {
      case 'file':
        if (!options.path) {
          throw new Error('File path is required for file import');
        }
        data = await this.loadFromFile(options.path);
        sourcePath = options.path;
        break;
      
      case 'url':
        if (!options.path) {
          throw new Error('URL is required for URL import');
        }
        data = await this.loadFromUrl(options.path);
        sourcePath = options.path;
        break;
      
      case 'data':
        if (!options.data) {
          throw new Error('Data is required for direct import');
        }
        data = options.data;
        break;
      
      default:
        throw new Error(`Unknown source type: ${options.source}`);
    }

    // Detect format if auto
    let format = options.format;
    if (format === 'auto' || !format) {
      format = this.detectFormat(data);
      this.logger.info(`Auto-detected format: ${format}`);
    }

    // Import based on format
    let endpoints: ApiEndpoint[];
    let version: string;
    let title: string | undefined;
    let description: string | undefined;

    if (format === 'openapi') {
      const spec = data as OpenAPIDocument;
      endpoints = await this.openApiImporter.import(spec);
      version = spec.openapi;
      title = spec.info.title;
      description = spec.info.description;
    } else if (format === 'postman') {
      const collection = data as PostmanCollection;
      endpoints = await this.postmanImporter.import(collection);
      version = collection.info.schema || 'v2.1.0';
      title = collection.info.name;
      description = typeof collection.info.description === 'string' 
        ? collection.info.description 
        : collection.info.description?.content;
    } else {
      throw new Error(`Unsupported format: ${format}`);
    }

    const result: ImportResult = {
      format,
      version,
      endpoints,
      metadata: {
        title,
        description,
        importedAt: new Date(),
        sourceType: options.source,
        source: sourcePath,
      },
    };

    this.logger.info('Import completed', {
      format: result.format,
      endpointCount: result.endpoints.length,
      title: result.metadata.title,
    });

    return result;
  }

  /**
   * Import from file with format auto-detection
   */
  async importFromFile(filePath: string, workspaceId: string, format?: ImportFormat): Promise<ImportResult> {
    return this.import({
      format: format || 'auto',
      workspaceId,
      source: 'file',
      path: filePath,
    });
  }

  /**
   * Import from URL with format auto-detection
   */
  async importFromUrl(url: string, workspaceId: string, format?: ImportFormat): Promise<ImportResult> {
    return this.import({
      format: format || 'auto',
      workspaceId,
      source: 'url',
      path: url,
    });
  }

  /**
   * Import from data object with format auto-detection
   */
  async importFromData(data: any, workspaceId: string, format?: ImportFormat): Promise<ImportResult> {
    return this.import({
      format: format || 'auto',
      workspaceId,
      source: 'data',
      data,
    });
  }

  /**
   * Detect format from data structure
   */
  private detectFormat(data: any): 'openapi' | 'postman' {
    if (!data || typeof data !== 'object') {
      throw new Error('Invalid data format');
    }

    // Check for OpenAPI
    if ('openapi' in data && typeof data.openapi === 'string') {
      if (data.openapi.startsWith('3.')) {
        return 'openapi';
      }
    }

    // Check for Swagger 2.0 (converted to OpenAPI 3.0 format)
    if ('swagger' in data && data.swagger === '2.0') {
      this.logger.warn('Swagger 2.0 detected, treating as OpenAPI');
      return 'openapi';
    }

    // Check for Postman Collection
    if ('info' in data && 'item' in data) {
      if (data.info && typeof data.info === 'object') {
        if ('schema' in data.info || '_postman_id' in data.info) {
          return 'postman';
        }
        // Even without schema, if it has the collection structure
        if (Array.isArray(data.item)) {
          return 'postman';
        }
      }
    }

    // Check for additional Postman indicators
    if ('collection' in data) {
      if (data.collection && typeof data.collection === 'object') {
        if ('info' in data.collection && 'item' in data.collection) {
          // Wrapped Postman collection
          return 'postman';
        }
      }
    }

    // Default fallback based on structure
    if ('paths' in data) {
      return 'openapi';
    }

    throw new Error('Unable to detect format. Please specify format explicitly.');
  }

  /**
   * Load data from file
   */
  private async loadFromFile(filePath: string): Promise<any> {
    const fs = await import('fs/promises');
    const path = await import('path');
    
    // Check if file exists
    try {
      await fs.access(filePath);
    } catch {
      throw new Error(`File not found: ${filePath}`);
    }

    const content = await fs.readFile(filePath, 'utf-8');
    const ext = path.extname(filePath).toLowerCase();

    // Parse based on file extension
    if (ext === '.yaml' || ext === '.yml') {
      const yaml = await import('js-yaml');
      return yaml.load(content);
    } else if (ext === '.json') {
      return JSON.parse(content);
    } else {
      // Try JSON first, then YAML
      try {
        return JSON.parse(content);
      } catch {
        try {
          const yaml = await import('js-yaml');
          return yaml.load(content);
        } catch {
          throw new Error('Unable to parse file as JSON or YAML');
        }
      }
    }
  }

  /**
   * Load data from URL
   */
  private async loadFromUrl(url: string): Promise<any> {
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`Failed to fetch from URL: ${response.statusText}`);
    }

    const contentType = response.headers.get('content-type') || '';
    const text = await response.text();

    // Parse based on content type
    if (contentType.includes('yaml') || contentType.includes('yml')) {
      const yaml = await import('js-yaml');
      return yaml.load(text);
    } else if (contentType.includes('json')) {
      return JSON.parse(text);
    } else {
      // Try JSON first, then YAML
      try {
        return JSON.parse(text);
      } catch {
        try {
          const yaml = await import('js-yaml');
          return yaml.load(text);
        } catch {
          throw new Error('Unable to parse response as JSON or YAML');
        }
      }
    }
  }

  /**
   * Validate imported endpoints
   */
  validateEndpoints(endpoints: ApiEndpoint[]): {
    valid: ApiEndpoint[];
    invalid: Array<{ endpoint: Partial<ApiEndpoint>; errors: string[] }>;
  } {
    const valid: ApiEndpoint[] = [];
    const invalid: Array<{ endpoint: Partial<ApiEndpoint>; errors: string[] }> = [];

    for (const endpoint of endpoints) {
      const errors: string[] = [];

      // Validate required fields
      if (!endpoint.name) {
        errors.push('Missing endpoint name');
      }

      if (!endpoint.method) {
        errors.push('Missing HTTP method');
      } else if (!this.isValidHttpMethod(endpoint.method)) {
        errors.push(`Invalid HTTP method: ${endpoint.method}`);
      }

      if (!endpoint.url) {
        errors.push('Missing URL');
      } else if (!this.isValidUrl(endpoint.url)) {
        errors.push(`Invalid URL: ${endpoint.url}`);
      }

      if (!endpoint.workspaceId) {
        errors.push('Missing workspace ID');
      }

      // Add to appropriate list
      if (errors.length === 0) {
        valid.push(endpoint);
      } else {
        invalid.push({ endpoint, errors });
      }
    }

    return { valid, invalid };
  }

  /**
   * Check if HTTP method is valid
   */
  private isValidHttpMethod(method: string): boolean {
    const validMethods = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS', 'TRACE'];
    return validMethods.includes(method.toUpperCase());
  }

  /**
   * Check if URL is valid (basic validation)
   */
  private isValidUrl(url: string): boolean {
    // Allow URLs with variables
    const processedUrl = url.replace(/{{[^}]+}}/g, 'placeholder');
    
    try {
      // Try to parse as URL
      new URL(processedUrl);
      return true;
    } catch {
      // Allow relative URLs and paths
      if (processedUrl.startsWith('/') || processedUrl.startsWith('http')) {
        return true;
      }
      return false;
    }
  }
}