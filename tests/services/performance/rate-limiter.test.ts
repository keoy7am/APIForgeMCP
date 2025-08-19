/**
 * Tests for Rate Limiter Service
 */

import { jest } from '@jest/globals';
import {
  RateLimiter,
  SlidingWindowRateLimiter,
  TokenBucketRateLimiter,
} from '../../../src/services/performance/rate-limiter.service';
import { MockFactory } from '../../utils/test-utils';
import type { RateLimiterConfig } from '../../../src/types';

describe('Rate Limiter Service', () => {
  let rateLimiter: RateLimiter;
  let mockLogger: any;

  beforeEach(() => {
    mockLogger = MockFactory.createMockLogger();
  });

  afterEach(() => {
    if (rateLimiter) {
      rateLimiter.dispose();
    }
  });

  describe('Basic Rate Limiting', () => {
    beforeEach(() => {
      const config: RateLimiterConfig = {
        maxRequests: 3,
        windowMs: 1000, // 1 second
        keyGenerator: (req) => req.clientId || 'default',
      };
      
      rateLimiter = new RateLimiter(config, mockLogger);
    });

    it('should allow requests within limit', async () => {
      const request = { clientId: 'client1' };
      
      // First 3 requests should be allowed
      for (let i = 0; i < 3; i++) {
        const result = await rateLimiter.checkLimit(request);
        expect(result.allowed).toBe(true);
        expect(result.state.count).toBe(i + 1);
        expect(result.state.remaining).toBe(3 - (i + 1));
      }
    });

    it('should block requests when limit exceeded', async () => {
      const request = { clientId: 'client1' };
      
      // Use up the limit
      for (let i = 0; i < 3; i++) {
        await rateLimiter.checkLimit(request);
      }
      
      // 4th request should be blocked
      const result = await rateLimiter.checkLimit(request);
      expect(result.allowed).toBe(false);
      expect(result.state.limited).toBe(true);
    });

    it('should reset limit after window expires', async () => {
      const request = { clientId: 'client1' };
      
      // Use up the limit
      for (let i = 0; i < 3; i++) {
        await rateLimiter.checkLimit(request);
      }
      
      // Should be blocked
      let result = await rateLimiter.checkLimit(request);
      expect(result.allowed).toBe(false);
      
      // Wait for window to expire
      await new Promise(resolve => setTimeout(resolve, 1100));
      
      // Should be allowed again
      result = await rateLimiter.checkLimit(request);
      expect(result.allowed).toBe(true);
      expect(result.state.count).toBe(1);
    });

    it('should handle different clients separately', async () => {
      const client1 = { clientId: 'client1' };
      const client2 = { clientId: 'client2' };
      
      // Client1 uses up their limit
      for (let i = 0; i < 3; i++) {
        const result = await rateLimiter.checkLimit(client1);
        expect(result.allowed).toBe(true);
      }
      
      // Client1 should be blocked
      let result = await rateLimiter.checkLimit(client1);
      expect(result.allowed).toBe(false);
      
      // Client2 should still be allowed
      result = await rateLimiter.checkLimit(client2);
      expect(result.allowed).toBe(true);
    });
  });

  describe('Configuration Options', () => {
    it('should skip successful requests when configured', async () => {
      const config: RateLimiterConfig = {
        maxRequests: 2,
        windowMs: 1000,
        skipSuccessful: true,
      };
      
      rateLimiter = new RateLimiter(config, mockLogger);
      const request = { clientId: 'client1' };
      
      // Make requests and record as successful
      const result1 = await rateLimiter.checkLimit(request);
      expect(result1.allowed).toBe(true);
      rateLimiter.recordResult(request, true);
      
      const result2 = await rateLimiter.checkLimit(request);
      expect(result2.allowed).toBe(true);
      rateLimiter.recordResult(request, true);
      
      // With skipSuccessful, should still be allowed
      const result3 = await rateLimiter.checkLimit(request);
      expect(result3.allowed).toBe(true);
    });

    it('should skip failed requests when configured', async () => {
      const config: RateLimiterConfig = {
        maxRequests: 2,
        windowMs: 1000,
        skipFailed: true,
      };
      
      rateLimiter = new RateLimiter(config, mockLogger);
      const request = { clientId: 'client1' };
      
      const result1 = await rateLimiter.checkLimit(request);
      expect(result1.allowed).toBe(true);
      rateLimiter.recordResult(request, false); // Failed request
      
      const result2 = await rateLimiter.checkLimit(request);
      expect(result2.allowed).toBe(true);
      rateLimiter.recordResult(request, false); // Failed request
      
      // Should still be allowed since we're skipping failed requests
      const result3 = await rateLimiter.checkLimit(request);
      expect(result3.allowed).toBe(true);
    });

    it('should use custom key generator', async () => {
      const config: RateLimiterConfig = {
        maxRequests: 1,
        windowMs: 1000,
        keyGenerator: (req) => `${req.userId}-${req.apiKey}`,
      };
      
      rateLimiter = new RateLimiter(config, mockLogger);
      
      const request1 = { userId: 'user1', apiKey: 'key1' };
      const request2 = { userId: 'user1', apiKey: 'key2' };
      
      // Different keys should be treated separately
      const result1 = await rateLimiter.checkLimit(request1);
      expect(result1.allowed).toBe(true);
      
      const result2 = await rateLimiter.checkLimit(request2);
      expect(result2.allowed).toBe(true);
    });

    it('should skip requests based on custom skip function', async () => {
      const config: RateLimiterConfig = {
        maxRequests: 1,
        windowMs: 1000,
        skip: (req) => req.isAdmin === true,
      };
      
      rateLimiter = new RateLimiter(config, mockLogger);
      
      const adminRequest = { clientId: 'admin', isAdmin: true };
      const userRequest = { clientId: 'user', isAdmin: false };
      
      // Admin requests should be skipped
      const adminResult = await rateLimiter.checkLimit(adminRequest);
      expect(adminResult.allowed).toBe(true);
      expect(adminResult.state.key).toBe('skipped');
      
      // User requests should be limited
      const userResult1 = await rateLimiter.checkLimit(userRequest);
      expect(userResult1.allowed).toBe(true);
      
      const userResult2 = await rateLimiter.checkLimit(userRequest);
      expect(userResult2.allowed).toBe(false);
    });

    it('should call onLimitExceeded callback', async () => {
      const onLimitExceeded = jest.fn();
      const config: RateLimiterConfig = {
        maxRequests: 1,
        windowMs: 1000,
        onLimitExceeded,
      };
      
      rateLimiter = new RateLimiter(config, mockLogger);
      const request = { clientId: 'client1' };
      
      // First request allowed
      await rateLimiter.checkLimit(request);
      
      // Second request should trigger callback
      await rateLimiter.checkLimit(request);
      expect(onLimitExceeded).toHaveBeenCalledWith('client1');
    });
  });

  describe('State Management', () => {
    beforeEach(() => {
      const config: RateLimiterConfig = {
        maxRequests: 3,
        windowMs: 1000,
      };
      
      rateLimiter = new RateLimiter(config, mockLogger);
    });

    it('should return current state for a key', async () => {
      const request = { clientId: 'client1' };
      
      await rateLimiter.checkLimit(request);
      await rateLimiter.checkLimit(request);
      
      const state = rateLimiter.getState('client1');
      expect(state).toBeDefined();
      expect(state!.count).toBe(2);
      expect(state!.remaining).toBe(1);
      expect(state!.limited).toBe(false);
    });

    it('should reset state for a key', async () => {
      const request = { clientId: 'client1' };
      
      await rateLimiter.checkLimit(request);
      expect(rateLimiter.getState('client1')?.count).toBe(1);
      
      rateLimiter.reset('client1');
      expect(rateLimiter.getState('client1')).toBeUndefined();
    });

    it('should reset all states', async () => {
      const request1 = { clientId: 'client1' };
      const request2 = { clientId: 'client2' };
      
      await rateLimiter.checkLimit(request1);
      await rateLimiter.checkLimit(request2);
      
      const states = rateLimiter.getAllStates();
      expect(states.size).toBe(2);
      
      rateLimiter.resetAll();
      const emptyStates = rateLimiter.getAllStates();
      expect(emptyStates.size).toBe(0);
    });

    it('should get all current states', async () => {
      const request1 = { clientId: 'client1' };
      const request2 = { clientId: 'client2' };
      
      await rateLimiter.checkLimit(request1);
      await rateLimiter.checkLimit(request2);
      await rateLimiter.checkLimit(request2);
      
      const states = rateLimiter.getAllStates();
      expect(states.size).toBe(2);
      expect(states.get('client1')?.count).toBe(1);
      expect(states.get('client2')?.count).toBe(2);
    });
  });
});

describe('Sliding Window Rate Limiter', () => {
  let rateLimiter: SlidingWindowRateLimiter;
  let mockLogger: any;

  beforeEach(() => {
    mockLogger = MockFactory.createMockLogger();
    
    const config: RateLimiterConfig = {
      maxRequests: 3,
      windowMs: 1000,
    };
    
    rateLimiter = new SlidingWindowRateLimiter(config, mockLogger);
  });

  afterEach(() => {
    rateLimiter.dispose();
  });

  it('should implement sliding window behavior', async () => {
    const request = { clientId: 'client1' };
    
    // Make 3 requests at t=0
    for (let i = 0; i < 3; i++) {
      const result = await rateLimiter.checkLimit(request);
      expect(result.allowed).toBe(true);
    }
    
    // 4th request should be blocked
    let result = await rateLimiter.checkLimit(request);
    expect(result.allowed).toBe(false);
    
    // Wait 600ms (more than half the window)
    await new Promise(resolve => setTimeout(resolve, 600));
    
    // Should still be blocked (all 3 requests still in window)
    result = await rateLimiter.checkLimit(request);
    expect(result.allowed).toBe(false);
    
    // Wait another 500ms (total 1.1s, window should have moved)
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Should be allowed now (previous requests outside window)
    result = await rateLimiter.checkLimit(request);
    expect(result.allowed).toBe(true);
  });

  it('should handle gradual request spacing', async () => {
    const request = { clientId: 'client1' };
    
    // Make requests spaced 400ms apart
    for (let i = 0; i < 3; i++) {
      const result = await rateLimiter.checkLimit(request);
      expect(result.allowed).toBe(true);
      await new Promise(resolve => setTimeout(resolve, 400));
    }
    
    // After 1.2 seconds total, first request should be out of window
    // So this should be allowed
    const result = await rateLimiter.checkLimit(request);
    expect(result.allowed).toBe(true);
  });
});

describe('Token Bucket Rate Limiter', () => {
  let rateLimiter: TokenBucketRateLimiter;
  let mockLogger: any;

  beforeEach(() => {
    mockLogger = MockFactory.createMockLogger();
    
    const config = {
      bucketSize: 5,
      refillRate: 2, // 2 tokens per second
    };
    
    rateLimiter = new TokenBucketRateLimiter(config, mockLogger);
  });

  it('should allow requests when tokens available', async () => {
    const request = { clientId: 'client1' };
    
    // Should start with full bucket
    const result1 = await rateLimiter.checkLimit(request, 3);
    expect(result1.allowed).toBe(true);
    expect(result1.tokensRemaining).toBe(2);
    
    const result2 = await rateLimiter.checkLimit(request, 2);
    expect(result2.allowed).toBe(true);
    expect(result2.tokensRemaining).toBe(0);
  });

  it('should block requests when insufficient tokens', async () => {
    const request = { clientId: 'client1' };
    
    // Use all tokens
    await rateLimiter.checkLimit(request, 5);
    
    // Should be blocked
    const result = await rateLimiter.checkLimit(request, 1);
    expect(result.allowed).toBe(false);
    expect(result.tokensRemaining).toBe(0);
  });

  it('should refill tokens over time', async () => {
    const request = { clientId: 'client1' };
    
    // Use all tokens
    await rateLimiter.checkLimit(request, 5);
    
    // Wait for refill (rate is 2 tokens/second)
    await new Promise(resolve => setTimeout(resolve, 1100));
    
    // Should have ~2 tokens now
    const result = await rateLimiter.checkLimit(request, 2);
    expect(result.allowed).toBe(true);
  });

  it('should handle different clients separately', async () => {
    const client1 = { clientId: 'client1' };
    const client2 = { clientId: 'client2' };
    
    // Client1 uses all tokens
    await rateLimiter.checkLimit(client1, 5);
    
    // Client1 should be blocked
    let result = await rateLimiter.checkLimit(client1, 1);
    expect(result.allowed).toBe(false);
    
    // Client2 should have full bucket
    result = await rateLimiter.checkLimit(client2, 3);
    expect(result.allowed).toBe(true);
    expect(result.tokensRemaining).toBe(2);
  });

  it('should reset buckets', () => {
    rateLimiter.reset('client1');
    expect(() => rateLimiter.reset('non-existent')).not.toThrow();
    
    rateLimiter.resetAll();
  });
});