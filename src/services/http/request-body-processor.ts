import { z } from 'zod';
import { Logger } from '../../utils/logger';

/**
 * Request body types supported by the HTTP client
 */
export type RequestBodyType = 'json' | 'form-data' | 'url-encoded' | 'raw' | 'binary';

/**
 * Request body data structure
 */
export interface RequestBodyData {
  type: RequestBodyType;
  content: any;
  contentType?: string;
}

/**
 * Request Body Processor
 * 
 * Handles different types of request bodies for HTTP requests.
 * Supports JSON, Form Data, URL Encoded, Raw text, and Binary data.
 */
export class RequestBodyProcessor {
  private logger: Logger;

  constructor() {
    this.logger = new Logger('RequestBodyProcessor');
  }

  /**
   * Process request body based on type
   */
  async processBody(bodyData: RequestBodyData): Promise<{
    body: any;
    headers: Record<string, string>;
  }> {
    try {
      switch (bodyData.type) {
        case 'json':
          return this.processJSON(bodyData.content);
        
        case 'form-data':
          return this.processFormData(bodyData.content);
        
        case 'url-encoded':
          return this.processURLEncoded(bodyData.content);
        
        case 'raw':
          return this.processRaw(bodyData.content, bodyData.contentType);
        
        case 'binary':
          return this.processBinary(bodyData.content);
        
        default:
          throw new Error(`Unsupported body type: ${bodyData.type}`);
      }
    } catch (error) {
      this.logger.error(`Failed to process ${bodyData.type} body:`, error);
      throw error;
    }
  }

  /**
   * Process JSON request body
   */
  private processJSON(content: any): {
    body: string;
    headers: Record<string, string>;
  } {
    let jsonString: string;
    
    if (typeof content === 'string') {
      // Validate JSON string
      try {
        JSON.parse(content);
        jsonString = content;
      } catch {
        throw new Error('Invalid JSON string provided');
      }
    } else {
      // Convert object to JSON
      jsonString = JSON.stringify(content, null, 0);
    }

    return {
      body: jsonString,
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(jsonString, 'utf8').toString(),
      },
    };
  }

  /**
   * Process Form Data request body
   */
  private processFormData(content: Record<string, any>): {
    body: FormData;
    headers: Record<string, string>;
  } {
    const formData = new FormData();
    
    Object.entries(content).forEach(([key, value]) => {
      if (value instanceof File) {
        formData.append(key, value);
      } else if (value instanceof Blob) {
        formData.append(key, value);
      } else if (Array.isArray(value)) {
        // Handle array values
        value.forEach(item => {
          formData.append(key, String(item));
        });
      } else {
        formData.append(key, String(value));
      }
    });

    return {
      body: formData,
      headers: {
        // Don't set Content-Type for FormData - let browser set it with boundary
      },
    };
  }

  /**
   * Process URL Encoded request body
   */
  private processURLEncoded(content: Record<string, any>): {
    body: string;
    headers: Record<string, string>;
  } {
    const params = new URLSearchParams();
    
    Object.entries(content).forEach(([key, value]) => {
      if (Array.isArray(value)) {
        value.forEach(item => params.append(key, String(item)));
      } else {
        params.append(key, String(value));
      }
    });

    const bodyString = params.toString();

    return {
      body: bodyString,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(bodyString, 'utf8').toString(),
      },
    };
  }

  /**
   * Process raw text request body
   */
  private processRaw(
    content: string, 
    contentType?: string
  ): {
    body: string;
    headers: Record<string, string>;
  } {
    const bodyString = String(content);
    
    return {
      body: bodyString,
      headers: {
        'Content-Type': contentType || 'text/plain',
        'Content-Length': Buffer.byteLength(bodyString, 'utf8').toString(),
      },
    };
  }

  /**
   * Process binary request body
   */
  private processBinary(content: ArrayBuffer | Buffer | Uint8Array): {
    body: Buffer;
    headers: Record<string, string>;
  } {
    let buffer: Buffer;
    
    if (content instanceof ArrayBuffer) {
      buffer = Buffer.from(content);
    } else if (content instanceof Uint8Array) {
      buffer = Buffer.from(content);
    } else if (Buffer.isBuffer(content)) {
      buffer = content;
    } else {
      throw new Error('Invalid binary content type');
    }

    return {
      body: buffer,
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Length': buffer.length.toString(),
      },
    };
  }

  /**
   * Detect body type from content
   */
  detectBodyType(content: any): RequestBodyType {
    if (content === null || content === undefined) {
      return 'raw';
    }

    if (typeof content === 'string') {
      // Try to detect JSON
      try {
        JSON.parse(content);
        return 'json';
      } catch {
        return 'raw';
      }
    }

    if (content instanceof FormData) {
      return 'form-data';
    }

    if (content instanceof ArrayBuffer || 
        content instanceof Uint8Array || 
        Buffer.isBuffer(content)) {
      return 'binary';
    }

    if (typeof content === 'object') {
      return 'json';
    }

    return 'raw';
  }

  /**
   * Create request body data from various inputs
   */
  createBodyData(
    content: any, 
    type?: RequestBodyType,
    contentType?: string
  ): RequestBodyData {
    const detectedType = type || this.detectBodyType(content);
    
    return {
      type: detectedType,
      content,
      contentType,
    };
  }
}

/**
 * Request Body Validation Schema
 */
export const RequestBodyDataSchema = z.object({
  type: z.enum(['json', 'form-data', 'url-encoded', 'raw', 'binary']),
  content: z.any(),
  contentType: z.string().optional(),
});

export type RequestBodyDataType = z.infer<typeof RequestBodyDataSchema>;