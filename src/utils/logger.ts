/**
 * Simple logger implementation for APIForge MCP Server
 * 
 * IMPORTANT: All logs must go to stderr to avoid interfering with MCP protocol
 * MCP uses stdout for JSON-RPC communication, so any non-JSON output to stdout
 * will cause protocol errors.
 * 
 * Logs are DISABLED by default for normal MCP users.
 * Set APIFORGE_ENABLE_LOGS=true to enable logging for debugging.
 */
export class Logger {
  private context: string;
  private enabled: boolean;
  private static globalEnabled: boolean | null = null;

  constructor(context: string) {
    this.context = context;
    
    // Initialize global enabled state only once
    if (Logger.globalEnabled === null) {
      // Logs are disabled by default, only enabled when explicitly requested
      // or in development mode with explicit flag
      Logger.globalEnabled = process.env.APIFORGE_ENABLE_LOGS === 'true' ||
                            process.env.APIFORGE_DEBUG === 'true';
    }
    
    this.enabled = Logger.globalEnabled;
  }

  /**
   * Log info message to stderr
   */
  info(message: string, ...args: any[]): void {
    if (this.enabled) {
      console.error(`[INFO] [${this.context}] ${message}`, ...args);
    }
  }

  /**
   * Log warning message to stderr
   */
  warn(message: string, ...args: any[]): void {
    if (this.enabled) {
      console.error(`[WARN] [${this.context}] ${message}`, ...args);
    }
  }

  /**
   * Log error message to stderr
   */
  error(message: string, ...args: any[]): void {
    if (this.enabled) {
      console.error(`[ERROR] [${this.context}] ${message}`, ...args);
    }
  }

  /**
   * Log debug message to stderr (only in development)
   */
  debug(message: string, ...args: any[]): void {
    if (this.enabled && process.env.NODE_ENV !== 'production') {
      console.error(`[DEBUG] [${this.context}] ${message}`, ...args);
    }
  }

  /**
   * Create a child logger with additional context
   */
  child(additionalContext: string): Logger {
    return new Logger(`${this.context}:${additionalContext}`);
  }
}