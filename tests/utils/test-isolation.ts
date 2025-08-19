/**
 * Test Isolation Helper for APIForge MCP Server
 * Provides utilities for test data isolation and cleanup
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { randomUUID } from 'crypto';

/**
 * Test Isolation Manager
 * Manages temporary test directories and ensures proper cleanup
 */
export class TestIsolation {
  private static activeDirs: Set<string> = new Set();
  private static baseDir = './test-data';
  
  /**
   * Create an isolated test directory
   * @param prefix Optional prefix for the directory name
   * @returns Path to the created directory
   */
  static async createTestDir(prefix: string = 'test'): Promise<string> {
    const dirName = `${prefix}-${randomUUID()}`;
    const dirPath = path.join(this.baseDir, dirName);
    
    await fs.mkdir(dirPath, { recursive: true });
    this.activeDirs.add(dirPath);
    
    return dirPath;
  }
  
  /**
   * Clean up a specific test directory
   * @param dirPath Path to the directory to clean up
   */
  static async cleanupDir(dirPath: string): Promise<void> {
    if (!this.activeDirs.has(dirPath)) {
      return; // Directory not managed by this class
    }
    
    try {
      await fs.rm(dirPath, { recursive: true, force: true });
      this.activeDirs.delete(dirPath);
    } catch (error) {
      // Log but don't throw - cleanup errors shouldn't fail tests
      console.warn(`Failed to cleanup test directory ${dirPath}:`, error);
    }
  }
  
  /**
   * Clean up all active test directories
   * Should be called in global afterAll or similar
   */
  static async cleanupAll(): Promise<void> {
    const cleanupPromises = Array.from(this.activeDirs).map(dir => 
      this.cleanupDir(dir)
    );
    
    await Promise.all(cleanupPromises);
    
    // Try to remove base test directory if empty
    try {
      const entries = await fs.readdir(this.baseDir);
      if (entries.length === 0) {
        await fs.rmdir(this.baseDir);
      }
    } catch (error) {
      // Ignore - base directory might not exist or not be empty
    }
  }
  
  /**
   * Get a unique file path within a test directory
   * @param testDir The test directory
   * @param filename Optional filename (will be made unique)
   * @returns Unique file path
   */
  static getUniqueFilePath(testDir: string, filename: string = 'file'): string {
    const ext = path.extname(filename);
    const base = path.basename(filename, ext);
    const uniqueName = `${base}-${randomUUID()}${ext}`;
    return path.join(testDir, uniqueName);
  }
  
  /**
   * Create a test file with content
   * @param testDir The test directory
   * @param filename The filename
   * @param content The file content
   * @returns Path to the created file
   */
  static async createTestFile(
    testDir: string, 
    filename: string, 
    content: string | object
  ): Promise<string> {
    const filePath = path.join(testDir, filename);
    const fileContent = typeof content === 'object' 
      ? JSON.stringify(content, null, 2) 
      : content;
    
    await fs.writeFile(filePath, fileContent, 'utf-8');
    return filePath;
  }
  
  /**
   * Check if a test directory exists
   * @param dirPath Path to check
   * @returns True if directory exists
   */
  static async dirExists(dirPath: string): Promise<boolean> {
    try {
      const stats = await fs.stat(dirPath);
      return stats.isDirectory();
    } catch {
      return false;
    }
  }
  
  /**
   * Ensure test isolation is properly set up
   * Call this in beforeEach or test setup
   */
  static async setup(): Promise<void> {
    // Ensure base directory exists
    await fs.mkdir(this.baseDir, { recursive: true });
  }
  
  /**
   * Get active test directories count
   * Useful for debugging and ensuring cleanup
   */
  static getActiveCount(): number {
    return this.activeDirs.size;
  }
  
  /**
   * Wait for file system operations to complete
   * Useful for avoiding race conditions in tests
   */
  static async waitForFS(ms: number = 100): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * Test Data Manager
 * Manages test data lifecycle with automatic cleanup
 */
export class TestDataManager {
  private testDir: string | null = null;
  
  /**
   * Initialize the test data manager
   * @param prefix Optional prefix for the test directory
   */
  async init(prefix: string = 'test'): Promise<string> {
    if (this.testDir) {
      await this.cleanup();
    }
    
    this.testDir = await TestIsolation.createTestDir(prefix);
    return this.testDir;
  }
  
  /**
   * Get the current test directory
   * @throws Error if not initialized
   */
  getDir(): string {
    if (!this.testDir) {
      throw new Error('TestDataManager not initialized. Call init() first.');
    }
    return this.testDir;
  }
  
  /**
   * Create a file in the test directory
   * @param filename The filename
   * @param content The file content
   * @returns Path to the created file
   */
  async createFile(filename: string, content: string | object): Promise<string> {
    return TestIsolation.createTestFile(this.getDir(), filename, content);
  }
  
  /**
   * Get a unique file path in the test directory
   * @param filename Optional base filename
   * @returns Unique file path
   */
  getUniquePath(filename: string = 'file'): string {
    return TestIsolation.getUniqueFilePath(this.getDir(), filename);
  }
  
  /**
   * Clean up the test directory
   */
  async cleanup(): Promise<void> {
    if (this.testDir) {
      await TestIsolation.cleanupDir(this.testDir);
      this.testDir = null;
    }
  }
  
  /**
   * Check if the test directory exists
   */
  async exists(): Promise<boolean> {
    if (!this.testDir) {
      return false;
    }
    return TestIsolation.dirExists(this.testDir);
  }
}

/**
 * Jest test helpers for test isolation
 */
export const testIsolationHelpers = {
  /**
   * Use in beforeEach to set up test isolation
   */
  beforeEach: async (): Promise<TestDataManager> => {
    await TestIsolation.setup();
    const manager = new TestDataManager();
    await manager.init();
    return manager;
  },
  
  /**
   * Use in afterEach to clean up test data
   */
  afterEach: async (manager: TestDataManager): Promise<void> => {
    await manager.cleanup();
  },
  
  /**
   * Use in afterAll to ensure all test data is cleaned up
   */
  afterAll: async (): Promise<void> => {
    await TestIsolation.cleanupAll();
  },
};

// Export types for better TypeScript support
export type { TestDataManager };