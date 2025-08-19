/**
 * Tests for RequestBodyProcessor
 */

import { jest } from '@jest/globals';
import { RequestBodyProcessor } from '../../../src/services/http/request-body-processor';
import { TestDataFactory, MockFactory, TestAssertions } from '../../utils/test-utils';

describe('RequestBodyProcessor', () => {
  let processor: RequestBodyProcessor;

  beforeEach(() => {
    processor = new RequestBodyProcessor();
  });

  describe('createBodyData', () => {
    it('should create JSON body data for objects', () => {
      const input = { name: 'test', value: 123 };
      const result = processor.createBodyData(input);

      expect(result).toEqual({
        type: 'json',
        data: input,
        contentType: 'application/json',
      });
    });

    it('should create raw body data for strings', () => {
      const input = 'test string';
      const result = processor.createBodyData(input);

      expect(result).toEqual({
        type: 'raw',
        data: input,
        contentType: 'text/plain',
      });
    });

    it('should create form data for FormData objects', () => {
      const input = new FormData();
      input.append('field', 'value');
      
      const result = processor.createBodyData(input);

      expect(result).toEqual({
        type: 'form',
        data: input,
        contentType: 'multipart/form-data',
      });
    });

    it('should create binary data for ArrayBuffer', () => {
      const input = new ArrayBuffer(8);
      const result = processor.createBodyData(input);

      expect(result).toEqual({
        type: 'binary',
        data: input,
        contentType: 'application/octet-stream',
      });
    });

    it('should create binary data for Uint8Array', () => {
      const input = new Uint8Array([1, 2, 3, 4]);
      const result = processor.createBodyData(input);

      expect(result).toEqual({
        type: 'binary',
        data: input,
        contentType: 'application/octet-stream',
      });
    });

    it('should handle null input', () => {
      const result = processor.createBodyData(null);

      expect(result).toEqual({
        type: 'raw',
        data: null,
        contentType: 'text/plain',
      });
    });

    it('should handle undefined input', () => {
      const result = processor.createBodyData(undefined);

      expect(result).toEqual({
        type: 'raw',
        data: undefined,
        contentType: 'text/plain',
      });
    });
  });

  describe('processBody', () => {
    describe('JSON processing', () => {
      it('should process JSON body correctly', async () => {
        const bodyData = {
          type: 'json' as const,
          data: { name: 'test', value: 123 },
          contentType: 'application/json',
        };

        const result = await processor.processBody(bodyData);

        expect(result).toEqual({
          body: JSON.stringify(bodyData.data),
          headers: {
            'Content-Type': 'application/json',
          },
        });
      });

      it('should handle complex nested objects', async () => {
        const complexData = {
          user: {
            id: 1,
            profile: {
              name: 'John Doe',
              preferences: ['pref1', 'pref2'],
            },
          },
          metadata: {
            timestamp: new Date().toISOString(),
            version: '1.0.0',
          },
        };

        const bodyData = {
          type: 'json' as const,
          data: complexData,
          contentType: 'application/json',
        };

        const result = await processor.processBody(bodyData);

        expect(result.body).toBe(JSON.stringify(complexData));
        expect(result.headers['Content-Type']).toBe('application/json');
      });

      it('should handle arrays', async () => {
        const arrayData = [1, 2, 3, { name: 'test' }];
        const bodyData = {
          type: 'json' as const,
          data: arrayData,
          contentType: 'application/json',
        };

        const result = await processor.processBody(bodyData);

        expect(result.body).toBe(JSON.stringify(arrayData));
        expect(result.headers['Content-Type']).toBe('application/json');
      });

      it('should throw error for circular references', async () => {
        const circularData: any = { name: 'test' };
        circularData.self = circularData;

        const bodyData = {
          type: 'json' as const,
          data: circularData,
          contentType: 'application/json',
        };

        await expect(processor.processBody(bodyData))
          .rejects.toThrow('Converting circular structure to JSON');
      });
    });

    describe('Form data processing', () => {
      it('should process FormData correctly', async () => {
        const formData = new FormData();
        formData.append('field1', 'value1');
        formData.append('field2', 'value2');

        const bodyData = {
          type: 'form' as const,
          data: formData,
          contentType: 'multipart/form-data',
        };

        const result = await processor.processBody(bodyData);

        expect(result.body).toBe(formData);
        expect(result.headers['Content-Type']).toBe('multipart/form-data');
      });

      it('should process URLSearchParams as form data', async () => {
        const urlParams = new URLSearchParams();
        urlParams.append('param1', 'value1');
        urlParams.append('param2', 'value2');

        const bodyData = {
          type: 'form' as const,
          data: urlParams,
          contentType: 'application/x-www-form-urlencoded',
        };

        const result = await processor.processBody(bodyData);

        expect(result.body).toBe(urlParams.toString());
        expect(result.headers['Content-Type']).toBe('application/x-www-form-urlencoded');
      });

      it('should convert object to URLSearchParams', async () => {
        const objectData = { param1: 'value1', param2: 'value2' };
        const bodyData = {
          type: 'form' as const,
          data: objectData,
          contentType: 'application/x-www-form-urlencoded',
        };

        const result = await processor.processBody(bodyData);

        expect(result.body).toBe('param1=value1&param2=value2');
        expect(result.headers['Content-Type']).toBe('application/x-www-form-urlencoded');
      });

      it('should handle empty form data', async () => {
        const formData = new FormData();
        const bodyData = {
          type: 'form' as const,
          data: formData,
          contentType: 'multipart/form-data',
        };

        const result = await processor.processBody(bodyData);

        expect(result.body).toBe(formData);
        expect(result.headers['Content-Type']).toBe('multipart/form-data');
      });
    });

    describe('Raw data processing', () => {
      it('should process string data correctly', async () => {
        const stringData = 'test string data';
        const bodyData = {
          type: 'raw' as const,
          data: stringData,
          contentType: 'text/plain',
        };

        const result = await processor.processBody(bodyData);

        expect(result.body).toBe(stringData);
        expect(result.headers['Content-Type']).toBe('text/plain');
      });

      it('should handle XML content', async () => {
        const xmlData = '<?xml version=\"1.0\"?><root><item>value</item></root>';
        const bodyData = {
          type: 'raw' as const,
          data: xmlData,
          contentType: 'application/xml',
        };

        const result = await processor.processBody(bodyData);

        expect(result.body).toBe(xmlData);
        expect(result.headers['Content-Type']).toBe('application/xml');
      });

      it('should handle HTML content', async () => {
        const htmlData = '<html><body><h1>Test</h1></body></html>';
        const bodyData = {
          type: 'raw' as const,
          data: htmlData,
          contentType: 'text/html',
        };

        const result = await processor.processBody(bodyData);

        expect(result.body).toBe(htmlData);
        expect(result.headers['Content-Type']).toBe('text/html');
      });

      it('should handle null data', async () => {
        const bodyData = {
          type: 'raw' as const,
          data: null,
          contentType: 'text/plain',
        };

        const result = await processor.processBody(bodyData);

        expect(result.body).toBeNull();
        expect(result.headers['Content-Type']).toBe('text/plain');
      });

      it('should handle undefined data', async () => {
        const bodyData = {
          type: 'raw' as const,
          data: undefined,
          contentType: 'text/plain',
        };

        const result = await processor.processBody(bodyData);

        expect(result.body).toBeUndefined();
        expect(result.headers['Content-Type']).toBe('text/plain');
      });
    });

    describe('Binary data processing', () => {
      it('should process ArrayBuffer correctly', async () => {
        const buffer = new ArrayBuffer(8);
        const view = new Uint8Array(buffer);
        view[0] = 1;
        view[1] = 2;

        const bodyData = {
          type: 'binary' as const,
          data: buffer,
          contentType: 'application/octet-stream',
        };

        const result = await processor.processBody(bodyData);

        expect(result.body).toBe(buffer);
        expect(result.headers['Content-Type']).toBe('application/octet-stream');
      });

      it('should process Uint8Array correctly', async () => {
        const uint8Array = new Uint8Array([1, 2, 3, 4]);
        const bodyData = {
          type: 'binary' as const,
          data: uint8Array,
          contentType: 'application/octet-stream',
        };

        const result = await processor.processBody(bodyData);

        expect(result.body).toBe(uint8Array);
        expect(result.headers['Content-Type']).toBe('application/octet-stream');
      });

      it('should handle Buffer objects', async () => {
        const buffer = Buffer.from('test data', 'utf8');
        const bodyData = {
          type: 'binary' as const,
          data: buffer,
          contentType: 'application/octet-stream',
        };

        const result = await processor.processBody(bodyData);

        expect(result.body).toBe(buffer);
        expect(result.headers['Content-Type']).toBe('application/octet-stream');
      });
    });

    describe('Error handling', () => {
      it('should throw error for unsupported body type', async () => {
        const bodyData = {
          type: 'unsupported' as any,
          data: 'test',
          contentType: 'text/plain',
        };

        await expect(processor.processBody(bodyData))
          .rejects.toThrow('Unsupported body type: unsupported');
      });

      it('should handle processing errors gracefully', async () => {
        // Mock JSON.stringify to throw error
        const originalStringify = JSON.stringify;
        JSON.stringify = jest.fn().mockImplementation(() => {
          throw new Error('Stringify error');
        });

        const bodyData = {
          type: 'json' as const,
          data: { test: 'data' },
          contentType: 'application/json',
        };

        await expect(processor.processBody(bodyData))
          .rejects.toThrow('Stringify error');

        // Restore original function
        JSON.stringify = originalStringify;
      });
    });

    describe('Content-Type header handling', () => {
      it('should preserve custom content-type', async () => {
        const bodyData = {
          type: 'json' as const,
          data: { test: 'data' },
          contentType: 'application/vnd.api+json',
        };

        const result = await processor.processBody(bodyData);

        expect(result.headers['Content-Type']).toBe('application/vnd.api+json');
      });

      it('should handle charset in content-type', async () => {
        const bodyData = {
          type: 'raw' as const,
          data: 'test data',
          contentType: 'text/plain; charset=utf-8',
        };

        const result = await processor.processBody(bodyData);

        expect(result.headers['Content-Type']).toBe('text/plain; charset=utf-8');
      });
    });
  });

  describe('integration scenarios', () => {
    it('should handle complete request body processing workflow', async () => {
      const requestData = {
        user: { id: 1, name: 'John' },
        metadata: { timestamp: Date.now() },
      };

      // Create body data
      const bodyData = processor.createBodyData(requestData);
      expect(bodyData.type).toBe('json');

      // Process body
      const result = await processor.processBody(bodyData);
      expect(result.body).toBe(JSON.stringify(requestData));
      expect(result.headers['Content-Type']).toBe('application/json');
    });

    it('should handle file upload simulation', async () => {
      const formData = new FormData();
      formData.append('file', new Blob(['file content'], { type: 'text/plain' }), 'test.txt');
      formData.append('description', 'Test file upload');

      const bodyData = processor.createBodyData(formData);
      const result = await processor.processBody(bodyData);

      expect(result.body).toBe(formData);
      expect(result.headers['Content-Type']).toBe('multipart/form-data');
    });
  });
});