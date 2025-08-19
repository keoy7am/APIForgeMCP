import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
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
    // Use zod-to-json-schema library for proper conversion
    const jsonSchema = zodToJsonSchema(schema, {
      // Use JSON Schema draft 2019-09 (compatible with 2020-12)
      target: 'jsonSchema2019-09',
      // Avoid references for simpler schemas
      $refStrategy: 'none',
      // Ensure strict mode for better compatibility
      strictUnions: true,
      // Remove additional properties by default for stricter validation
      removeAdditionalStrategy: 'strict',
    }) as any;

    // Ensure the schema has proper structure for MCP
    if (typeof jsonSchema === 'object' && jsonSchema !== null) {
      // Add $schema declaration for JSON Schema 2020-12 compliance
      const result: any = {
        $schema: 'https://json-schema.org/draft/2020-12/schema',
        ...jsonSchema
      };

      // Ensure required is always an array (never undefined) for object types
      if (result.type === 'object' && result.properties) {
        if (!result.required) {
          result.required = [];
        }
        // Ensure additionalProperties is set for objects
        if (result.additionalProperties === undefined) {
          result.additionalProperties = false;
        }
      }

      return result;
    }

    return jsonSchema;
  }
}