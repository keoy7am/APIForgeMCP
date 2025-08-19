/**
 * Enhanced Test setup file for APIForge MCP Server
 */

// Jest setup
import { jest } from '@jest/globals';
import { TextEncoder, TextDecoder } from 'util';
import crypto from 'crypto';

// Global setup
global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;

// Mock crypto for Node.js compatibility
if (!global.crypto) {
  global.crypto = crypto as any;
}

// Mock fetch globally for testing
if (!global.fetch) {
  global.fetch = jest.fn();
}

// Mock console methods to reduce noise in tests
const originalConsole = { ...console };
global.console = {
  ...console,
  log: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: originalConsole.error, // Keep error for debugging
};

// Mock process.env for tests
process.env.NODE_ENV = 'test';
process.env.APIFORGE_TEST = 'true';

// Enhanced beforeEach setup
beforeEach(() => {
  jest.clearAllMocks();
  jest.clearAllTimers();
  
  // Reset fetch mock
  if (global.fetch && jest.isMockFunction(global.fetch)) {
    (global.fetch as jest.Mock).mockReset();
  }
  
  // Reset console mocks
  Object.keys(console).forEach(key => {
    if (jest.isMockFunction((console as any)[key])) {
      ((console as any)[key] as jest.Mock).mockClear();
    }
  });
});

// Enhanced afterEach cleanup
afterEach(() => {
  jest.runOnlyPendingTimers();
  jest.useRealTimers();
});

// Global test timeout
jest.setTimeout(15000);

// Unhandled promise rejection handler
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// Enhanced error reporting
expect.extend({
  toBeValidUUID(received: string) {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    const pass = uuidRegex.test(received);
    
    if (pass) {
      return {
        message: () => `expected ${received} not to be a valid UUID`,
        pass: true,
      };
    } else {
      return {
        message: () => `expected ${received} to be a valid UUID`,
        pass: false,
      };
    }
  },
  
  toBeValidDate(received: any) {
    const pass = received instanceof Date && !isNaN(received.getTime());
    
    if (pass) {
      return {
        message: () => `expected ${received} not to be a valid Date`,
        pass: true,
      };
    } else {
      return {
        message: () => `expected ${received} to be a valid Date`,
        pass: false,
      };
    }
  },
});

// Type declarations for custom matchers
declare global {
  namespace jest {
    interface Matchers<R> {
      toBeValidUUID(): R;
      toBeValidDate(): R;
    }
  }
}