#!/usr/bin/env node

import { APIForgeMCPServer } from './server';

/**
 * Main entry point for APIForge MCP Server
 * 
 * This server provides API testing and management capabilities for AI Agents
 * through the Model Context Protocol (MCP).
 */
async function main(): Promise<void> {
  try {
    const server = new APIForgeMCPServer();
    
    // Start the server
    await server.start();
    
    // Handle graceful shutdown
    process.on('SIGINT', async () => {
      console.warn('Received SIGINT, shutting down gracefully...');
      await server.stop();
      process.exit(0);
    });
    
    process.on('SIGTERM', async () => {
      console.warn('Received SIGTERM, shutting down gracefully...');
      await server.stop();
      process.exit(0);
    });
    
  } catch (error) {
    console.error('Failed to start APIForge MCP Server:', error);
    process.exit(1);
  }
}

// Only run if this file is executed directly
if (require.main === module) {
  main().catch(error => {
    console.error('Unhandled error:', error);
    process.exit(1);
  });
}

export { APIForgeMCPServer } from './server';
export * from './types';