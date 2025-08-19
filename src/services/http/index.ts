/**
 * HTTP Services Module
 * 
 * Provides comprehensive HTTP request and response handling capabilities
 * including body processing, response parsing, and content type handling.
 */

export { RequestBodyProcessor, RequestBodyDataSchema } from './request-body-processor';
export type { 
  RequestBodyType, 
  RequestBodyData, 
  RequestBodyDataType 
} from './request-body-processor';

export { ResponseParser, ResponseUtils } from './response-parser';
export type { 
  ResponseType, 
  ParsedResponse 
} from './response-parser';

// Re-export for convenience
export const HTTP_METHODS = [
  'GET', 
  'POST', 
  'PUT', 
  'DELETE', 
  'PATCH', 
  'HEAD', 
  'OPTIONS'
] as const;

export type HttpMethod = typeof HTTP_METHODS[number];