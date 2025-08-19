/**
 * SSL Configuration Module
 * Manages SSL/TLS certificate validation policies for different environments
 */

import { Logger } from '../utils/logger';

export interface SSLConfig {
  /** Whether to reject unauthorized certificates */
  rejectUnauthorized: boolean;
  /** List of hostnames allowed to use self-signed certificates */
  allowedSelfSignedHosts: string[];
  /** Whether to allow self-signed certificates for localhost */
  allowLocalhost: boolean;
  /** Whether to allow self-signed certificates for private networks */
  allowPrivateNetworks: boolean;
  /** Log warnings when SSL validation is disabled */
  logWarnings: boolean;
  /** Trusted certificate fingerprints (SHA256) */
  trustedFingerprints: string[];
}

export class SSLConfigManager {
  private logger: Logger;
  private config: SSLConfig;
  private auditLog: Array<{
    timestamp: Date;
    url: string;
    action: string;
    reason: string;
  }> = [];

  constructor() {
    this.logger = new Logger('SSLConfig');
    this.config = this.loadConfig();
  }

  /**
   * Load SSL configuration based on environment
   */
  private loadConfig(): SSLConfig {
    const nodeEnv = process.env.NODE_ENV;
    const isProduction = nodeEnv === 'production';
    const isTest = nodeEnv === 'test';
    const isDevelopment = nodeEnv === 'development';
    
    // For APIForgeMCP, we default to a developer-friendly mode when NODE_ENV is not set
    // This is intentional as APIForgeMCP is primarily a development tool
    const isDefaultMode = !nodeEnv || (!isProduction && !isTest && !isDevelopment);

    // Parse environment variables
    const allowedHosts = process.env.SSL_ALLOWED_SELF_SIGNED_HOSTS?.split(',').map(h => h.trim()) || [];
    const trustedFingerprints = process.env.SSL_TRUSTED_FINGERPRINTS?.split(',').map(f => f.trim()) || [];
    
    // Default configurations based on environment
    if (isProduction) {
      return {
        rejectUnauthorized: process.env.SSL_REJECT_UNAUTHORIZED !== 'false',
        allowedSelfSignedHosts: allowedHosts,
        allowLocalhost: false,
        allowPrivateNetworks: false,
        logWarnings: true,
        trustedFingerprints,
      };
    } else if (isTest) {
      return {
        rejectUnauthorized: process.env.SSL_REJECT_UNAUTHORIZED === 'true',
        allowedSelfSignedHosts: allowedHosts,
        allowLocalhost: true,
        allowPrivateNetworks: true,
        logWarnings: false,
        trustedFingerprints,
      };
    } else if (isDevelopment || isDefaultMode) {
      // Development environment OR when NODE_ENV is not set (default for npm package users)
      // APIForgeMCP is primarily a development tool, so we default to developer-friendly settings
      if (isDefaultMode && !nodeEnv) {
        this.logger.info('NODE_ENV not set, using developer-friendly SSL settings');
        this.logger.info('For production use, set NODE_ENV=production');
      }
      
      return {
        rejectUnauthorized: process.env.SSL_REJECT_UNAUTHORIZED === 'true',
        allowedSelfSignedHosts: allowedHosts,
        allowLocalhost: true,  // Allow localhost self-signed certificates
        allowPrivateNetworks: true,  // Allow private network self-signed certificates
        logWarnings: true,
        trustedFingerprints,
      };
    } else {
      // Unknown environment - use safe defaults
      this.logger.warn(`Unknown NODE_ENV value: ${nodeEnv}, using safe defaults`);
      return {
        rejectUnauthorized: process.env.SSL_REJECT_UNAUTHORIZED !== 'false',
        allowedSelfSignedHosts: allowedHosts,
        allowLocalhost: false,
        allowPrivateNetworks: false,
        logWarnings: true,
        trustedFingerprints,
      };
    }
  }

  /**
   * Check if a URL should allow self-signed certificates
   */
  shouldAllowSelfSigned(url: string): boolean {
    try {
      const parsedUrl = new URL(url);
      const hostname = parsedUrl.hostname;
      const protocol = parsedUrl.protocol;

      // Only apply to HTTPS requests
      if (protocol !== 'https:') {
        return false;
      }

      // Check if globally disabled
      if (this.config.rejectUnauthorized) {
        // Check if hostname is in allowed list
        if (this.config.allowedSelfSignedHosts.includes(hostname)) {
          this.logDecision(url, 'ALLOWED', 'Hostname in allowed list');
          return true;
        }

        // Check wildcard patterns
        for (const pattern of this.config.allowedSelfSignedHosts) {
          if (pattern.startsWith('*.')) {
            const domain = pattern.substring(2);
            if (hostname.endsWith(domain)) {
              this.logDecision(url, 'ALLOWED', `Matches wildcard pattern: ${pattern}`);
              return true;
            }
          }
        }

        // In production, strict mode - no other exceptions
        if (process.env.NODE_ENV === 'production') {
          this.logDecision(url, 'REJECTED', 'Production environment with strict SSL');
          return false;
        }
      }

      // Check localhost
      if (this.config.allowLocalhost) {
        if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1') {
          this.logDecision(url, 'ALLOWED', 'Localhost connection');
          return true;
        }
      }

      // Check private networks
      if (this.config.allowPrivateNetworks) {
        if (this.isPrivateNetwork(hostname)) {
          this.logDecision(url, 'ALLOWED', 'Private network connection');
          return true;
        }
      }

      // Default: follow global setting
      const allowed = !this.config.rejectUnauthorized;
      this.logDecision(
        url, 
        allowed ? 'ALLOWED' : 'REJECTED',
        allowed ? 'Default policy allows self-signed' : 'Default policy rejects self-signed'
      );
      
      return allowed;
      
    } catch (error) {
      this.logger.error(`Error parsing URL for SSL config: ${error}`);
      // On error, be conservative
      return false;
    }
  }

  /**
   * Check if hostname is in a private network range
   */
  private isPrivateNetwork(hostname: string): boolean {
    // IPv4 private ranges
    const privateIPv4Patterns = [
      /^10\./,                    // 10.0.0.0/8
      /^172\.(1[6-9]|2[0-9]|3[01])\./,  // 172.16.0.0/12
      /^192\.168\./,              // 192.168.0.0/16
      /^169\.254\./,              // 169.254.0.0/16 (link-local)
    ];

    // Check if it's an IP address
    if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname)) {
      return privateIPv4Patterns.some(pattern => pattern.test(hostname));
    }

    // Check for .local domain (mDNS)
    if (hostname.endsWith('.local')) {
      return true;
    }

    // Check for common private network hostnames
    const privateHostPatterns = [
      /^.*\.internal$/,
      /^.*\.intranet$/,
      /^.*\.private$/,
      /^.*\.corp$/,
      /^.*\.home$/,
    ];

    return privateHostPatterns.some(pattern => pattern.test(hostname));
  }

  /**
   * Log SSL decision for auditing
   */
  private logDecision(url: string, action: string, reason: string): void {
    const entry = {
      timestamp: new Date(),
      url,
      action,
      reason,
    };

    this.auditLog.push(entry);

    // Keep audit log size manageable
    if (this.auditLog.length > 1000) {
      this.auditLog = this.auditLog.slice(-500);
    }

    // Log warnings if configured
    if (this.config.logWarnings && action === 'ALLOWED') {
      this.logger.warn(`⚠️ SSL certificate validation bypassed for ${url}: ${reason}`);
      
      if (process.env.NODE_ENV === 'production') {
        this.logger.error('🚨 SSL validation bypass in production environment!');
      }
    }
  }

  /**
   * Get SSL validation settings for a specific URL
   */
  getSSLSettings(url: string): { rejectUnauthorized: boolean; warnings: string[] } {
    const allowSelfSigned = this.shouldAllowSelfSigned(url);
    const warnings: string[] = [];

    if (allowSelfSigned) {
      warnings.push('SSL certificate validation is disabled for this request');
      
      if (process.env.NODE_ENV === 'production') {
        warnings.push('⚠️ WARNING: Running with disabled SSL validation in production!');
      }
      
      warnings.push('This connection may be vulnerable to MITM attacks');
    }

    return {
      rejectUnauthorized: !allowSelfSigned,
      warnings,
    };
  }

  /**
   * Get audit log entries
   */
  getAuditLog(limit: number = 100): typeof this.auditLog {
    return this.auditLog.slice(-limit);
  }

  /**
   * Clear audit log
   */
  clearAuditLog(): void {
    this.auditLog = [];
    this.logger.info('SSL audit log cleared');
  }

  /**
   * Update configuration
   */
  updateConfig(updates: Partial<SSLConfig>): void {
    this.config = {
      ...this.config,
      ...updates,
    };
    this.logger.info('SSL configuration updated', updates);
  }

  /**
   * Get current configuration
   */
  getConfig(): Readonly<SSLConfig> {
    return { ...this.config };
  }

  /**
   * Export audit log to JSON
   */
  exportAuditLog(): string {
    return JSON.stringify(this.auditLog, null, 2);
  }

  /**
   * Generate security report
   */
  generateSecurityReport(): {
    totalRequests: number;
    allowedRequests: number;
    rejectedRequests: number;
    uniqueHosts: string[];
    riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  } {
    const allowed = this.auditLog.filter(e => e.action === 'ALLOWED');
    const rejected = this.auditLog.filter(e => e.action === 'REJECTED');
    
    const uniqueHosts = [...new Set(this.auditLog.map(e => {
      try {
        return new URL(e.url).hostname;
      } catch {
        return 'unknown';
      }
    }))];

    // Determine risk level
    let riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    const allowedRatio = allowed.length / (this.auditLog.length || 1);
    const isProduction = process.env.NODE_ENV === 'production';

    if (isProduction && allowedRatio > 0) {
      riskLevel = 'CRITICAL';
    } else if (allowedRatio > 0.5) {
      riskLevel = 'HIGH';
    } else if (allowedRatio > 0.2) {
      riskLevel = 'MEDIUM';
    } else {
      riskLevel = 'LOW';
    }

    return {
      totalRequests: this.auditLog.length,
      allowedRequests: allowed.length,
      rejectedRequests: rejected.length,
      uniqueHosts,
      riskLevel,
    };
  }
}

// Export singleton instance
export const sslConfig = new SSLConfigManager();