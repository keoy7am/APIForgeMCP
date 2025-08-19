/**
 * Rate Limiter Service
 * Implements rate limiting to prevent API abuse and manage resource usage
 */

import type { RateLimiterConfig, RateLimiterState } from '../../types';
import { Logger } from '../../utils/logger';

export class RateLimiter {
  protected config: Required<RateLimiterConfig>;
  private states: Map<string, RateLimiterState> = new Map();
  private logger: Logger;
  private cleanupTimer?: NodeJS.Timeout;

  constructor(
    config: RateLimiterConfig,
    logger: Logger = new Logger('RateLimiter')
  ) {
    this.config = {
      maxRequests: config.maxRequests,
      windowMs: config.windowMs,
      skipSuccessful: config.skipSuccessful || false,
      skipFailed: config.skipFailed || false,
      keyGenerator: config.keyGenerator || ((req) => 'default'),
      skip: config.skip || (() => false),
      onLimitExceeded: config.onLimitExceeded || (() => {}),
    };
    
    this.logger = logger;
    this.startCleanup();
  }

  /**
   * Check if request should be allowed
   */
  async checkLimit(request: any): Promise<{
    allowed: boolean;
    state: RateLimiterState;
  }> {
    // Check if should skip
    if (this.config.skip && this.config.skip(request)) {
      return {
        allowed: true,
        state: this.getDefaultState('skipped'),
      };
    }
    
    const key = this.config.keyGenerator!(request);
    const now = new Date();
    
    // Get or create state
    let state = this.states.get(key);
    
    if (!state) {
      state = this.createState(key, now);
      this.states.set(key, state);
    }
    
    // Check if window has expired
    if (now.getTime() - state.windowStart.getTime() >= this.config.windowMs) {
      // Reset window
      state = this.resetState(state, now);
      this.states.set(key, state);
    }
    
    // Check if limit exceeded
    if (state.count >= this.config.maxRequests) {
      state.limited = true;
      
      if (this.config.onLimitExceeded) {
        this.config.onLimitExceeded(key);
      }
      
      this.logger.warn(`Rate limit exceeded for key: ${key}`);
      
      return {
        allowed: false,
        state: { ...state },
      };
    }
    
    // Increment counter
    state.count++;
    state.remaining = this.config.maxRequests - state.count;
    
    return {
      allowed: true,
      state: { ...state },
    };
  }

  /**
   * Record request result
   */
  recordResult(request: any, success: boolean): void {
    // Skip based on configuration
    if (success && this.config.skipSuccessful) return;
    if (!success && this.config.skipFailed) return;
    
    const key = this.config.keyGenerator!(request);
    const state = this.states.get(key);
    
    if (state && !success) {
      // Optionally handle failed requests differently
      // For now, just log
      this.logger.debug(`Failed request for key: ${key}`);
    }
  }

  /**
   * Get current state for a key
   */
  getState(key: string): RateLimiterState | undefined {
    const state = this.states.get(key);
    if (!state) return undefined;
    
    const now = new Date();
    
    // Check if window has expired
    if (now.getTime() - state.windowStart.getTime() >= this.config.windowMs) {
      return this.resetState(state, now);
    }
    
    return { ...state };
  }

  /**
   * Reset limiter for a key
   */
  reset(key: string): void {
    this.states.delete(key);
  }

  /**
   * Reset all limiters
   */
  resetAll(): void {
    this.states.clear();
    this.logger.info('All rate limiters reset');
  }

  /**
   * Get all current states
   */
  getAllStates(): Map<string, RateLimiterState> {
    const now = new Date();
    const result = new Map<string, RateLimiterState>();
    
    for (const [key, state] of this.states.entries()) {
      // Check if window has expired
      if (now.getTime() - state.windowStart.getTime() >= this.config.windowMs) {
        result.set(key, this.resetState(state, now));
      } else {
        result.set(key, { ...state });
      }
    }
    
    return result;
  }

  /**
   * Create new state
   */
  private createState(key: string, now: Date): RateLimiterState {
    const resetTime = new Date(now.getTime() + this.config.windowMs);
    
    return {
      key,
      count: 0,
      windowStart: now,
      remaining: this.config.maxRequests,
      resetTime,
      limited: false,
    };
  }

  /**
   * Reset state for new window
   */
  private resetState(state: RateLimiterState, now: Date): RateLimiterState {
    const resetTime = new Date(now.getTime() + this.config.windowMs);
    
    return {
      ...state,
      count: 0,
      windowStart: now,
      remaining: this.config.maxRequests,
      resetTime,
      limited: false,
    };
  }

  /**
   * Get default state
   */
  private getDefaultState(key: string): RateLimiterState {
    const now = new Date();
    const resetTime = new Date(now.getTime() + this.config.windowMs);
    
    return {
      key,
      count: 0,
      windowStart: now,
      remaining: this.config.maxRequests,
      resetTime,
      limited: false,
    };
  }

  /**
   * Start cleanup timer
   */
  private startCleanup(): void {
    // Clean up expired states every minute
    this.cleanupTimer = setInterval(() => {
      this.cleanupExpiredStates();
    }, 60000);
  }

  /**
   * Clean up expired states
   */
  private cleanupExpiredStates(): void {
    const now = new Date();
    const expiredKeys: string[] = [];
    
    for (const [key, state] of this.states.entries()) {
      // Remove states that haven't been used in 2x the window time
      const expireTime = state.windowStart.getTime() + (this.config.windowMs * 2);
      if (now.getTime() > expireTime) {
        expiredKeys.push(key);
      }
    }
    
    for (const key of expiredKeys) {
      this.states.delete(key);
    }
    
    if (expiredKeys.length > 0) {
      this.logger.debug(`Cleaned up ${expiredKeys.length} expired rate limiter states`);
    }
  }

  /**
   * Stop cleanup timer
   */
  stopCleanup(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = undefined;
    }
  }

  /**
   * Dispose of the rate limiter
   */
  dispose(): void {
    this.stopCleanup();
    this.states.clear();
  }
}

/**
 * Sliding window rate limiter
 */
export class SlidingWindowRateLimiter extends RateLimiter {
  private timestamps: Map<string, number[]> = new Map();

  /**
   * Check if request should be allowed (sliding window)
   */
  async checkLimit(request: any): Promise<{
    allowed: boolean;
    state: RateLimiterState;
  }> {
    const key = this.config.keyGenerator!(request);
    const now = Date.now();
    
    // Get or create timestamps array
    let timestamps = this.timestamps.get(key) || [];
    
    // Remove timestamps outside the window
    const windowStart = now - this.config.windowMs;
    timestamps = timestamps.filter(ts => ts > windowStart);
    
    // Check if limit exceeded
    if (timestamps.length >= this.config.maxRequests) {
      const state: RateLimiterState = {
        key,
        count: timestamps.length,
        windowStart: new Date(windowStart),
        remaining: 0,
        resetTime: new Date(timestamps[0] + this.config.windowMs),
        limited: true,
      };
      
      if (this.config.onLimitExceeded) {
        this.config.onLimitExceeded(key);
      }
      
      return {
        allowed: false,
        state,
      };
    }
    
    // Add current timestamp
    timestamps.push(now);
    this.timestamps.set(key, timestamps);
    
    const state: RateLimiterState = {
      key,
      count: timestamps.length,
      windowStart: new Date(windowStart),
      remaining: this.config.maxRequests - timestamps.length,
      resetTime: new Date(timestamps[0] + this.config.windowMs),
      limited: false,
    };
    
    return {
      allowed: true,
      state,
    };
  }

  /**
   * Reset limiter for a key
   */
  reset(key: string): void {
    super.reset(key);
    this.timestamps.delete(key);
  }

  /**
   * Reset all limiters
   */
  resetAll(): void {
    super.resetAll();
    this.timestamps.clear();
  }
}

/**
 * Token bucket rate limiter
 */
export class TokenBucketRateLimiter {
  private buckets: Map<string, {
    tokens: number;
    lastRefill: number;
  }> = new Map();
  
  private config: {
    bucketSize: number;
    refillRate: number; // tokens per second
    keyGenerator: (request: any) => string;
    onLimitExceeded?: (key: string) => void;
  };
  
  private logger: Logger;

  constructor(
    config: {
      bucketSize: number;
      refillRate: number;
      keyGenerator?: (request: any) => string;
      onLimitExceeded?: (key: string) => void;
    },
    logger: Logger = new Logger('TokenBucketRateLimiter')
  ) {
    this.config = {
      bucketSize: config.bucketSize,
      refillRate: config.refillRate,
      keyGenerator: config.keyGenerator || ((req) => 'default'),
      onLimitExceeded: config.onLimitExceeded,
    };
    
    this.logger = logger;
  }

  /**
   * Check if request should be allowed
   */
  async checkLimit(
    request: any,
    tokensRequired: number = 1
  ): Promise<{
    allowed: boolean;
    tokensRemaining: number;
  }> {
    const key = this.config.keyGenerator(request);
    const now = Date.now();
    
    // Get or create bucket
    let bucket = this.buckets.get(key);
    
    if (!bucket) {
      bucket = {
        tokens: this.config.bucketSize,
        lastRefill: now,
      };
      this.buckets.set(key, bucket);
    }
    
    // Refill tokens based on time elapsed
    const timePassed = (now - bucket.lastRefill) / 1000; // Convert to seconds
    const tokensToAdd = timePassed * this.config.refillRate;
    bucket.tokens = Math.min(this.config.bucketSize, bucket.tokens + tokensToAdd);
    bucket.lastRefill = now;
    
    // Check if enough tokens available
    if (bucket.tokens < tokensRequired) {
      if (this.config.onLimitExceeded) {
        this.config.onLimitExceeded(key);
      }
      
      this.logger.warn(`Token bucket exhausted for key: ${key}`);
      
      return {
        allowed: false,
        tokensRemaining: bucket.tokens,
      };
    }
    
    // Consume tokens
    bucket.tokens -= tokensRequired;
    
    return {
      allowed: true,
      tokensRemaining: bucket.tokens,
    };
  }

  /**
   * Reset bucket for a key
   */
  reset(key: string): void {
    this.buckets.delete(key);
  }

  /**
   * Reset all buckets
   */
  resetAll(): void {
    this.buckets.clear();
    this.logger.info('All token buckets reset');
  }
}