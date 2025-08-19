import { Logger } from '../../utils/logger';

/**
 * Response types that can be parsed
 */
export type ResponseType = 'json' | 'text' | 'binary' | 'stream' | 'blob' | 'auto';

/**
 * Parsed response data structure
 */
export interface ParsedResponse {
  data: any;
  type: ResponseType;
  size: number;
  encoding?: string;
}

/**
 * Response Parser Service
 * 
 * Handles parsing of different response types from HTTP requests.
 * Supports JSON, Text, Binary, Stream, and Blob responses with auto-detection.
 */
export class ResponseParser {
  private logger: Logger;

  constructor() {
    this.logger = new Logger('ResponseParser');
  }

  /**
   * Parse response based on content type or explicit type
   */
  async parseResponse(
    response: Response,
    explicitType?: ResponseType
  ): Promise<ParsedResponse> {
    try {
      const contentType = response.headers.get('Content-Type') || '';
      const contentLength = response.headers.get('Content-Length');
      
      // Determine response type
      const responseType = explicitType || this.detectResponseType(contentType);
      
      this.logger.debug(`Parsing response as ${responseType}, Content-Type: ${contentType}`);

      // Parse based on type
      let data: any;
      let size = 0;

      switch (responseType) {
        case 'json':
          data = await this.parseJSON(response);
          size = this.calculateSize(data);
          break;
        
        case 'text':
          data = await this.parseText(response);
          size = data.length;
          break;
        
        case 'binary':
          data = await this.parseBinary(response);
          size = data.byteLength;
          break;
        
        case 'stream':
          data = await this.parseStream(response);
          size = parseInt(contentLength || '0', 10);
          break;
        
        case 'blob':
          data = await this.parseBlob(response);
          size = data.size;
          break;
        
        case 'auto':
        default:
          data = await this.parseAuto(response, contentType);
          size = this.calculateSize(data);
          break;
      }

      const result: ParsedResponse = {
        data,
        type: responseType,
        size,
        encoding: this.extractEncoding(contentType),
      };

      this.logger.debug(`Parsed response: ${size} bytes, type: ${responseType}`);
      return result;

    } catch (error) {
      this.logger.error('Failed to parse response:', error);
      
      // Fallback to text parsing
      try {
        const fallbackData = await response.text();
        return {
          data: fallbackData,
          type: 'text',
          size: fallbackData.length,
        };
      } catch (fallbackError) {
        throw new Error(
          `Failed to parse response: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }
    }
  }

  /**
   * Parse JSON response
   */
  private async parseJSON(response: Response): Promise<any> {
    const text = await response.text();
    
    if (!text.trim()) {
      return null;
    }

    try {
      return JSON.parse(text);
    } catch (error) {
      throw new Error(`Invalid JSON response: ${error instanceof Error ? error.message : 'Parse error'}`);
    }
  }

  /**
   * Parse text response
   */
  private async parseText(response: Response): Promise<string> {
    return await response.text();
  }

  /**
   * Parse binary response
   */
  private async parseBinary(response: Response): Promise<ArrayBuffer> {
    return await response.arrayBuffer();
  }

  /**
   * Parse stream response
   */
  private async parseStream(response: Response): Promise<ReadableStream<Uint8Array> | null> {
    return response.body;
  }

  /**
   * Parse blob response
   */
  private async parseBlob(response: Response): Promise<Blob> {
    return await response.blob();
  }

  /**
   * Auto-detect and parse response
   */
  private async parseAuto(response: Response, contentType: string): Promise<any> {
    if (this.isJSONContent(contentType)) {
      return await this.parseJSON(response);
    }
    
    if (this.isTextContent(contentType)) {
      return await this.parseText(response);
    }
    
    if (this.isBinaryContent(contentType)) {
      return await this.parseBinary(response);
    }

    // Default to text
    return await this.parseText(response);
  }

  /**
   * Detect response type from content type
   */
  private detectResponseType(contentType: string): ResponseType {
    if (this.isJSONContent(contentType)) {
      return 'json';
    }
    
    if (this.isTextContent(contentType)) {
      return 'text';
    }
    
    if (this.isBinaryContent(contentType)) {
      return 'binary';
    }

    return 'auto';
  }

  /**
   * Check if content type indicates JSON
   */
  private isJSONContent(contentType: string): boolean {
    const lowerType = contentType.toLowerCase();
    return lowerType.includes('application/json') ||
           lowerType.includes('text/json') ||
           lowerType.includes('+json');
  }

  /**
   * Check if content type indicates text
   */
  private isTextContent(contentType: string): boolean {
    const lowerType = contentType.toLowerCase();
    return lowerType.startsWith('text/') ||
           lowerType.includes('application/xml') ||
           lowerType.includes('application/javascript') ||
           lowerType.includes('application/html') ||
           lowerType.includes('+xml');
  }

  /**
   * Check if content type indicates binary
   */
  private isBinaryContent(contentType: string): boolean {
    const lowerType = contentType.toLowerCase();
    return lowerType.startsWith('image/') ||
           lowerType.startsWith('video/') ||
           lowerType.startsWith('audio/') ||
           lowerType.includes('application/octet-stream') ||
           lowerType.includes('application/pdf') ||
           lowerType.includes('application/zip');
  }

  /**
   * Extract encoding from content type
   */
  private extractEncoding(contentType: string): string | undefined {
    const charsetMatch = contentType.match(/charset=([^;]+)/i);
    return charsetMatch?.[1]?.trim();
  }

  /**
   * Calculate size of parsed data
   */
  private calculateSize(data: any): number {
    if (typeof data === 'string') {
      return Buffer.byteLength(data, 'utf8');
    }
    
    if (data instanceof ArrayBuffer) {
      return data.byteLength;
    }
    
    if (data instanceof Blob) {
      return data.size;
    }
    
    if (Buffer.isBuffer(data)) {
      return data.length;
    }
    
    // For objects, estimate size
    try {
      return Buffer.byteLength(JSON.stringify(data), 'utf8');
    } catch {
      return 0;
    }
  }

  /**
   * Check if response can be parsed as specific type
   */
  canParseAs(contentType: string, targetType: ResponseType): boolean {
    switch (targetType) {
      case 'json':
        return this.isJSONContent(contentType);
      case 'text':
        return this.isTextContent(contentType);
      case 'binary':
        return this.isBinaryContent(contentType);
      case 'stream':
      case 'blob':
      case 'auto':
        return true;
      default:
        return false;
    }
  }

  /**
   * Get appropriate response type for content
   */
  getRecommendedType(contentType: string): ResponseType {
    return this.detectResponseType(contentType);
  }
}

/**
 * Response parsing utilities
 */
export class ResponseUtils {
  /**
   * Check if response is successful
   */
  static isSuccessful(status: number): boolean {
    return status >= 200 && status < 300;
  }

  /**
   * Check if response indicates redirect
   */
  static isRedirect(status: number): boolean {
    return status >= 300 && status < 400;
  }

  /**
   * Check if response indicates client error
   */
  static isClientError(status: number): boolean {
    return status >= 400 && status < 500;
  }

  /**
   * Check if response indicates server error
   */
  static isServerError(status: number): boolean {
    return status >= 500 && status < 600;
  }

  /**
   * Get status category
   */
  static getStatusCategory(status: number): string {
    if (this.isSuccessful(status)) return 'success';
    if (this.isRedirect(status)) return 'redirect';
    if (this.isClientError(status)) return 'client_error';
    if (this.isServerError(status)) return 'server_error';
    return 'unknown';
  }
}