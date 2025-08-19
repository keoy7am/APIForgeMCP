import { z } from 'zod';
import { APIForgeError } from '../utils/errors';
import { Logger } from '../utils/logger';

/**
 * MCP Tool interface
 */
export interface MCPTool {
  name: string;
  description: string;
  inputSchema: z.ZodSchema;
  handler: (input: any) => Promise<any>;
}

/**
 * Tool description for MCP protocol
 */
export interface ToolDescription {
  name: string;
  description: string;
  inputSchema: {
    type: string;
    properties: Record<string, any>;
    required?: string[];
  };
}

/**
 * Tool Registry for managing MCP tools
 * 
 * This class manages registration and execution of MCP tools,
 * providing a centralized way to handle tool lifecycle.
 */
export class ToolRegistry {
  private tools: Map<string, MCPTool> = new Map();
  private logger: Logger;

  constructor() {
    this.logger = new Logger('ToolRegistry');
  }

  /**
   * Register a new tool
   */
  registerTool(tool: MCPTool): void {
    if (this.tools.has(tool.name)) {
      throw new APIForgeError(
        `Tool '${tool.name}' is already registered`,
        'TOOL_ALREADY_REGISTERED'
      );
    }

    // Validate tool structure
    this.validateTool(tool);

    this.tools.set(tool.name, tool);
    this.logger.info(`Registered tool: ${tool.name}`);
  }

  /**
   * Execute a tool by name
   */
  async executeTool(name: string, args: any): Promise<any> {
    const tool = this.tools.get(name);
    if (!tool) {
      throw new APIForgeError(
        `Tool '${name}' not found`,
        'TOOL_NOT_FOUND',
        404
      );
    }

    try {
      // Validate input arguments
      const validatedArgs = tool.inputSchema.parse(args);
      
      // Execute tool handler
      const result = await tool.handler(validatedArgs);
      
      this.logger.debug(`Tool '${name}' executed successfully`);
      return result;
      
    } catch (error) {
      if (error instanceof z.ZodError) {
        throw new APIForgeError(
          `Invalid arguments for tool '${name}': ${error.message}`,
          'INVALID_TOOL_ARGUMENTS',
          400,
          { zodError: error.errors }
        );
      }
      
      this.logger.error(`Tool '${name}' execution failed:`, error);
      throw error;
    }
  }

  /**
   * Get tool descriptions for MCP protocol
   */
  getToolDescriptions(): ToolDescription[] {
    return Array.from(this.tools.values()).map(tool => ({
      name: tool.name,
      description: tool.description,
      inputSchema: this.zodSchemaToJsonSchema(tool.inputSchema),
    }));
  }

  /**
   * Get number of registered tools
   */
  getToolCount(): number {
    return this.tools.size;
  }

  /**
   * Check if a tool is registered
   */
  hasTool(name: string): boolean {
    return this.tools.has(name);
  }

  /**
   * Unregister a tool
   */
  unregisterTool(name: string): boolean {
    const success = this.tools.delete(name);
    if (success) {
      this.logger.info(`Unregistered tool: ${name}`);
    }
    return success;
  }

  /**
   * Get all tool names
   */
  getToolNames(): string[] {
    return Array.from(this.tools.keys());
  }

  /**
   * Validate tool structure
   */
  private validateTool(tool: MCPTool): void {
    if (!tool.name || typeof tool.name !== 'string') {
      throw new APIForgeError(
        'Tool name must be a non-empty string',
        'INVALID_TOOL_NAME'
      );
    }

    if (!tool.description || typeof tool.description !== 'string') {
      throw new APIForgeError(
        'Tool description must be a non-empty string',
        'INVALID_TOOL_DESCRIPTION'
      );
    }

    if (!tool.inputSchema || typeof tool.inputSchema.parse !== 'function') {
      throw new APIForgeError(
        'Tool must have a valid Zod input schema',
        'INVALID_TOOL_SCHEMA'
      );
    }

    if (!tool.handler || typeof tool.handler !== 'function') {
      throw new APIForgeError(
        'Tool must have a handler function',
        'INVALID_TOOL_HANDLER'
      );
    }
  }

  /**
   * Convert Zod schema to JSON Schema for MCP protocol
   */
  private zodSchemaToJsonSchema(schema: z.ZodSchema): any {
    // This is a simplified conversion
    // In a production environment, you might want to use a library like zod-to-json-schema
    
    // Try to get the schema as a ZodObject
    try {
      if (schema instanceof z.ZodObject) {
        const properties: Record<string, any> = {};
        const required: string[] = [];
        
        // Get shape from the schema
        const shape = schema.shape;
        
        for (const [key, value] of Object.entries(shape)) {
          properties[key] = this.zodTypeToJsonSchema(value as z.ZodSchema);
          
          // Check if field is required (not optional)
          if (!(value as z.ZodSchema).isOptional()) {
            required.push(key);
          }
        }
        
        return {
          type: 'object',
          properties,
          required: required.length > 0 ? required : undefined,
        };
      }
    } catch (error) {
      // Fallback to simple type conversion
    }
    
    return this.zodTypeToJsonSchema(schema);
  }

  /**
   * Convert individual Zod type to JSON Schema type
   */
  private zodTypeToJsonSchema(schema: z.ZodSchema): any {
    // Simple type mapping - can be enhanced
    if (schema instanceof z.ZodString) {
      return { type: 'string' };
    } else if (schema instanceof z.ZodNumber) {
      return { type: 'number' };
    } else if (schema instanceof z.ZodBoolean) {
      return { type: 'boolean' };
    } else if (schema instanceof z.ZodArray) {
      return {
        type: 'array',
        items: { type: 'any' },
      };
    } else if (schema instanceof z.ZodObject) {
      return this.zodSchemaToJsonSchema(schema);
    } else if (schema instanceof z.ZodOptional) {
      return this.zodTypeToJsonSchema(schema._def.innerType);
    } else if (schema instanceof z.ZodEnum) {
      return {
        type: 'string',
        enum: schema._def.values,
      };
    } else if (schema instanceof z.ZodRecord) {
      return {
        type: 'object',
        additionalProperties: { type: 'any' },
      };
    } else {
      return { type: 'any' };
    }
  }
}