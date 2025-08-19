/**
 * Tests for ResponseParser
 */

import { jest } from '@jest/globals';
import { ResponseParser } from '../../../src/services/http/response-parser';
import { MockFactory, TestAssertions } from '../../utils/test-utils';

describe('ResponseParser', () => {
  let parser: ResponseParser;

  beforeEach(() => {
    parser = new ResponseParser();
  });

  describe('parseResponse', () => {
    describe('JSON response parsing', () => {
      it('should parse JSON response correctly', async () => {
        const jsonData = { success: true, data: { id: 1, name: 'test' } };
        const response = MockFactory.createMockFetchResponse(jsonData, {
          headers: { 'content-type': 'application/json' },
        });

        const result = await parser.parseResponse(response);

        expect(result).toEqual({
          data: jsonData,
          type: 'json',
          size: expect.any(Number),
          contentType: 'application/json',
        });
      });

      it('should handle JSON with charset', async () => {
        const jsonData = { message: 'Hello World' };
        const response = MockFactory.createMockFetchResponse(jsonData, {
          headers: { 'content-type': 'application/json; charset=utf-8' },
        });

        const result = await parser.parseResponse(response);

        expect(result.type).toBe('json');
        expect(result.data).toEqual(jsonData);
        expect(result.contentType).toBe('application/json; charset=utf-8');
      });

      it('should handle API-specific JSON content types', async () => {
        const jsonData = { api: 'response' };
        const response = MockFactory.createMockFetchResponse(jsonData, {
          headers: { 'content-type': 'application/vnd.api+json' },
        });

        const result = await parser.parseResponse(response);

        expect(result.type).toBe('json');
        expect(result.data).toEqual(jsonData);
      });

      it('should handle empty JSON response', async () => {
        const response = MockFactory.createMockFetchResponse({}, {
          headers: { 'content-type': 'application/json' },
        });

        const result = await parser.parseResponse(response);

        expect(result.type).toBe('json');
        expect(result.data).toEqual({});
      });

      it('should handle JSON array response', async () => {
        const jsonArray = [{ id: 1 }, { id: 2 }, { id: 3 }];
        const response = MockFactory.createMockFetchResponse(jsonArray, {
          headers: { 'content-type': 'application/json' },
        });

        const result = await parser.parseResponse(response);

        expect(result.type).toBe('json');
        expect(result.data).toEqual(jsonArray);
      });

      it('should handle malformed JSON gracefully', async () => {
        const response = {
          ...MockFactory.createMockFetchResponse(null, {
            headers: { 'content-type': 'application/json' },
          }),
          json: jest.fn().mockRejectedValue(new Error('Invalid JSON')),
          text: jest.fn().mockResolvedValue('{ invalid json }'),
        };

        const result = await parser.parseResponse(response);

        expect(result.type).toBe('text');
        expect(result.data).toBe('{ invalid json }');
      });
    });

    describe('Text response parsing', () => {
      it('should parse plain text response', async () => {
        const textData = 'Plain text response';
        const response = {
          ...MockFactory.createMockFetchResponse(textData, {
            headers: { 'content-type': 'text/plain' },
          }),
          text: jest.fn().mockResolvedValue(textData),
        };

        const result = await parser.parseResponse(response);

        expect(result).toEqual({
          data: textData,
          type: 'text',
          size: expect.any(Number),
          contentType: 'text/plain',
        });
      });

      it('should parse HTML response', async () => {
        const htmlData = '<html><body><h1>Test</h1></body></html>';
        const response = {
          ...MockFactory.createMockFetchResponse(htmlData, {
            headers: { 'content-type': 'text/html' },
          }),
          text: jest.fn().mockResolvedValue(htmlData),
        };

        const result = await parser.parseResponse(response);

        expect(result.type).toBe('text');
        expect(result.data).toBe(htmlData);
        expect(result.contentType).toBe('text/html');
      });

      it('should parse XML response', async () => {
        const xmlData = '<?xml version=\"1.0\"?><root><item>value</item></root>';
        const response = {
          ...MockFactory.createMockFetchResponse(xmlData, {
            headers: { 'content-type': 'application/xml' },
          }),
          text: jest.fn().mockResolvedValue(xmlData),
        };

        const result = await parser.parseResponse(response);

        expect(result.type).toBe('text');
        expect(result.data).toBe(xmlData);
        expect(result.contentType).toBe('application/xml');
      });

      it('should parse CSV response', async () => {
        const csvData = 'name,age,city\\nJohn,30,New York\\nJane,25,Los Angeles';\n        const response = {\n          ...MockFactory.createMockFetchResponse(csvData, {\n            headers: { 'content-type': 'text/csv' },\n          }),\n          text: jest.fn().mockResolvedValue(csvData),\n        };\n\n        const result = await parser.parseResponse(response);\n\n        expect(result.type).toBe('text');\n        expect(result.data).toBe(csvData);\n        expect(result.contentType).toBe('text/csv');\n      });\n\n      it('should handle empty text response', async () => {\n        const response = {\n          ...MockFactory.createMockFetchResponse('', {\n            headers: { 'content-type': 'text/plain' },\n          }),\n          text: jest.fn().mockResolvedValue(''),\n        };\n\n        const result = await parser.parseResponse(response);\n\n        expect(result.type).toBe('text');\n        expect(result.data).toBe('');\n      });\n    });\n\n    describe('Binary response parsing', () => {\n      it('should parse binary response', async () => {\n        const binaryData = new ArrayBuffer(8);\n        const response = {\n          ...MockFactory.createMockFetchResponse(null, {\n            headers: { 'content-type': 'application/octet-stream' },\n          }),\n          arrayBuffer: jest.fn().mockResolvedValue(binaryData),\n        };\n\n        const result = await parser.parseResponse(response);\n\n        expect(result).toEqual({\n          data: binaryData,\n          type: 'binary',\n          size: expect.any(Number),\n          contentType: 'application/octet-stream',\n        });\n      });\n\n      it('should parse image response', async () => {\n        const imageData = new ArrayBuffer(1024);\n        const response = {\n          ...MockFactory.createMockFetchResponse(null, {\n            headers: { 'content-type': 'image/png' },\n          }),\n          arrayBuffer: jest.fn().mockResolvedValue(imageData),\n        };\n\n        const result = await parser.parseResponse(response);\n\n        expect(result.type).toBe('binary');\n        expect(result.data).toBe(imageData);\n        expect(result.contentType).toBe('image/png');\n      });\n\n      it('should parse PDF response', async () => {\n        const pdfData = new ArrayBuffer(2048);\n        const response = {\n          ...MockFactory.createMockFetchResponse(null, {\n            headers: { 'content-type': 'application/pdf' },\n          }),\n          arrayBuffer: jest.fn().mockResolvedValue(pdfData),\n        };\n\n        const result = await parser.parseResponse(response);\n\n        expect(result.type).toBe('binary');\n        expect(result.data).toBe(pdfData);\n      });\n    });\n\n    describe('Auto-detection parsing', () => {\n      it('should auto-detect JSON without content-type', async () => {\n        const jsonData = { autoDetected: true };\n        const response = {\n          ...MockFactory.createMockFetchResponse(jsonData, {\n            headers: {},\n          }),\n          text: jest.fn().mockResolvedValue(JSON.stringify(jsonData)),\n        };\n\n        const result = await parser.parseResponse(response);\n\n        expect(result.type).toBe('json');\n        expect(result.data).toEqual(jsonData);\n      });\n\n      it('should fallback to text for unknown content-type', async () => {\n        const textData = 'Unknown content type';\n        const response = {\n          ...MockFactory.createMockFetchResponse(textData, {\n            headers: { 'content-type': 'application/unknown' },\n          }),\n          text: jest.fn().mockResolvedValue(textData),\n        };\n\n        const result = await parser.parseResponse(response);\n\n        expect(result.type).toBe('text');\n        expect(result.data).toBe(textData);\n      });\n\n      it('should handle missing content-type header', async () => {\n        const textData = 'No content type';\n        const response = {\n          ...MockFactory.createMockFetchResponse(textData, {\n            headers: {},\n          }),\n          text: jest.fn().mockResolvedValue(textData),\n        };\n\n        const result = await parser.parseResponse(response);\n\n        expect(result.type).toBe('text');\n        expect(result.data).toBe(textData);\n      });\n    });\n\n    describe('Explicit type parsing', () => {\n      it('should respect explicit JSON type override', async () => {\n        const jsonData = { forced: 'json' };\n        const response = {\n          ...MockFactory.createMockFetchResponse(jsonData, {\n            headers: { 'content-type': 'text/plain' },\n          }),\n          text: jest.fn().mockResolvedValue(JSON.stringify(jsonData)),\n        };\n\n        const result = await parser.parseResponse(response, 'json');\n\n        expect(result.type).toBe('json');\n        expect(result.data).toEqual(jsonData);\n      });\n\n      it('should respect explicit text type override', async () => {\n        const textData = '{\"this\":\"should be text\"}';\n        const response = {\n          ...MockFactory.createMockFetchResponse(null, {\n            headers: { 'content-type': 'application/json' },\n          }),\n          text: jest.fn().mockResolvedValue(textData),\n        };\n\n        const result = await parser.parseResponse(response, 'text');\n\n        expect(result.type).toBe('text');\n        expect(result.data).toBe(textData);\n      });\n\n      it('should respect explicit binary type override', async () => {\n        const binaryData = new ArrayBuffer(16);\n        const response = {\n          ...MockFactory.createMockFetchResponse(null, {\n            headers: { 'content-type': 'text/plain' },\n          }),\n          arrayBuffer: jest.fn().mockResolvedValue(binaryData),\n        };\n\n        const result = await parser.parseResponse(response, 'binary');\n\n        expect(result.type).toBe('binary');\n        expect(result.data).toBe(binaryData);\n      });\n    });\n\n    describe('Error handling', () => {\n      it('should handle JSON parsing errors', async () => {\n        const response = {\n          ...MockFactory.createMockFetchResponse(null, {\n            headers: { 'content-type': 'application/json' },\n          }),\n          json: jest.fn().mockRejectedValue(new Error('JSON parse error')),\n          text: jest.fn().mockResolvedValue('invalid json'),\n        };\n\n        const result = await parser.parseResponse(response);\n\n        expect(result.type).toBe('text');\n        expect(result.data).toBe('invalid json');\n      });\n\n      it('should handle text parsing errors', async () => {\n        const response = {\n          ...MockFactory.createMockFetchResponse(null, {\n            headers: { 'content-type': 'text/plain' },\n          }),\n          text: jest.fn().mockRejectedValue(new Error('Text parse error')),\n          arrayBuffer: jest.fn().mockResolvedValue(new ArrayBuffer(0)),\n        };\n\n        const result = await parser.parseResponse(response);\n\n        expect(result.type).toBe('binary');\n        expect(result.data).toBeInstanceOf(ArrayBuffer);\n      });\n\n      it('should handle binary parsing errors', async () => {\n        const response = {\n          ...MockFactory.createMockFetchResponse(null, {\n            headers: { 'content-type': 'application/octet-stream' },\n          }),\n          arrayBuffer: jest.fn().mockRejectedValue(new Error('Binary parse error')),\n          text: jest.fn().mockResolvedValue('fallback text'),\n        };\n\n        const result = await parser.parseResponse(response);\n\n        expect(result.type).toBe('text');\n        expect(result.data).toBe('fallback text');\n      });\n\n      it('should handle complete parsing failure', async () => {\n        const response = {\n          ...MockFactory.createMockFetchResponse(null),\n          json: jest.fn().mockRejectedValue(new Error('JSON error')),\n          text: jest.fn().mockRejectedValue(new Error('Text error')),\n          arrayBuffer: jest.fn().mockRejectedValue(new Error('Binary error')),\n        };\n\n        await expect(parser.parseResponse(response))\n          .rejects.toThrow('Failed to parse response: all parsing methods failed');\n      });\n    });\n\n    describe('Size calculation', () => {\n      it('should calculate size from content-length header', async () => {\n        const response = MockFactory.createMockFetchResponse({ test: 'data' }, {\n          headers: {\n            'content-type': 'application/json',\n            'content-length': '1024',\n          },\n        });\n\n        const result = await parser.parseResponse(response);\n\n        expect(result.size).toBe(1024);\n      });\n\n      it('should estimate size from JSON string length', async () => {\n        const jsonData = { message: 'test data for size calculation' };\n        const response = MockFactory.createMockFetchResponse(jsonData, {\n          headers: { 'content-type': 'application/json' },\n        });\n\n        const result = await parser.parseResponse(response);\n\n        expect(result.size).toBe(JSON.stringify(jsonData).length);\n      });\n\n      it('should estimate size from text length', async () => {\n        const textData = 'This is test text data for size calculation';\n        const response = {\n          ...MockFactory.createMockFetchResponse(textData, {\n            headers: { 'content-type': 'text/plain' },\n          }),\n          text: jest.fn().mockResolvedValue(textData),\n        };\n\n        const result = await parser.parseResponse(response);\n\n        expect(result.size).toBe(textData.length);\n      });\n\n      it('should calculate size from ArrayBuffer byte length', async () => {\n        const binaryData = new ArrayBuffer(2048);\n        const response = {\n          ...MockFactory.createMockFetchResponse(null, {\n            headers: { 'content-type': 'application/octet-stream' },\n          }),\n          arrayBuffer: jest.fn().mockResolvedValue(binaryData),\n        };\n\n        const result = await parser.parseResponse(response);\n\n        expect(result.size).toBe(2048);\n      });\n    });\n  });\n\n  describe('Content-Type utilities', () => {\n    it('should extract charset from content-type', async () => {\n      const response = MockFactory.createMockFetchResponse({ test: 'data' }, {\n        headers: {\n          'content-type': 'application/json; charset=utf-8; boundary=something',\n        },\n      });\n\n      const result = await parser.parseResponse(response);\n\n      expect(result.contentType).toBe('application/json; charset=utf-8; boundary=something');\n    });\n\n    it('should handle case-insensitive content-type headers', async () => {\n      const response = MockFactory.createMockFetchResponse({ test: 'data' }, {\n        headers: {\n          'Content-Type': 'APPLICATION/JSON',\n        },\n      });\n\n      const result = await parser.parseResponse(response);\n\n      expect(result.type).toBe('json');\n    });\n  });\n\n  describe('integration scenarios', () => {\n    it('should handle complete response parsing workflow', async () => {\n      const responseData = {\n        status: 'success',\n        data: {\n          users: [{ id: 1, name: 'John' }, { id: 2, name: 'Jane' }],\n          pagination: { page: 1, total: 2 },\n        },\n        metadata: {\n          timestamp: new Date().toISOString(),\n          version: '1.0.0',\n        },\n      };\n\n      const response = MockFactory.createMockFetchResponse(responseData, {\n        status: 200,\n        headers: {\n          'content-type': 'application/json',\n          'content-length': JSON.stringify(responseData).length.toString(),\n        },\n      });\n\n      const result = await parser.parseResponse(response);\n\n      expect(result.type).toBe('json');\n      expect(result.data).toEqual(responseData);\n      expect(result.size).toBe(JSON.stringify(responseData).length);\n      expect(result.contentType).toBe('application/json');\n    });\n\n    it('should handle API error response parsing', async () => {\n      const errorResponse = {\n        error: {\n          code: 'VALIDATION_ERROR',\n          message: 'Invalid input data',\n          details: {\n            field: 'email',\n            reason: 'Invalid email format',\n          },\n        },\n      };\n\n      const response = MockFactory.createMockFetchResponse(errorResponse, {\n        status: 400,\n        statusText: 'Bad Request',\n        headers: { 'content-type': 'application/json' },\n      });\n\n      const result = await parser.parseResponse(response);\n\n      expect(result.type).toBe('json');\n      expect(result.data).toEqual(errorResponse);\n    });\n  });\n});"