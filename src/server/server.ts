import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import * as fs from 'fs';
import * as path from 'path';

import { ToolRegistry } from './tool-registry';
import { WorkspaceManager } from '../services/workspace.service';
import { EndpointRegistry } from '../services/endpoint.service';
import { RequestExecutor } from '../services/request.service';
import { FileStorage } from '../storage/file-storage';
import { Logger } from '../utils/logger';

// Import all tool implementations
import '../tools/workspace.tools';
import '../tools/endpoint.tools';
import '../tools/request.tools';

/**
 * APIForge MCP Server
 * 
 * Main server class that provides API testing and management capabilities
 * for AI Agents through the Model Context Protocol (MCP).
 */
export class APIForgeMCPServer {
  private server: Server;
  private toolRegistry: ToolRegistry;
  private workspaceManager: WorkspaceManager;
  private endpointRegistry: EndpointRegistry;
  private requestExecutor: RequestExecutor;
  private storage: FileStorage;
  private logger: Logger;
  private packageInfo: { name: string; version: string };

  constructor() {
    this.logger = new Logger('APIForgeMCPServer');
    
    // Load package.json for metadata
    this.packageInfo = this.loadPackageInfo();
    
    // Initialize storage
    this.storage = new FileStorage();
    
    // Initialize services
    this.toolRegistry = new ToolRegistry();
    this.workspaceManager = new WorkspaceManager(this.storage);
    this.endpointRegistry = new EndpointRegistry(this.storage, this.workspaceManager);
    this.requestExecutor = new RequestExecutor(this.endpointRegistry);
    
    // Create MCP server with dynamic version from package.json
    this.server = new Server(
      {
        name: this.packageInfo.name || 'APIForgeMCP',
        version: this.packageInfo.version,
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupHandlers();
    this.registerTools();
  }

  /**
   * Start the MCP server
   */
  async start(): Promise<void> {
    try {
      // Connect to stdio transport
      const transport = new StdioServerTransport();
      await this.server.connect(transport);
      
      this.logger.info('APIForge MCP Server started successfully');
    } catch (error) {
      this.logger.error('Failed to start server:', error);
      throw error;
    }
  }

  /**
   * Stop the MCP server
   */
  async stop(): Promise<void> {
    try {
      await this.server.close();
      this.logger.info('APIForge MCP Server stopped');
    } catch (error) {
      this.logger.error('Error stopping server:', error);
      throw error;
    }
  }

  /**
   * Get services for tool implementations
   */
  getServices() {
    return {
      workspaceManager: this.workspaceManager,
      endpointRegistry: this.endpointRegistry,
      requestExecutor: this.requestExecutor,
      storage: this.storage,
    };
  }

  /**
   * Load package.json to get metadata like version
   */
  private loadPackageInfo(): { name: string; version: string } {
    try {
      // Navigate up from src/server to project root
      const packageJsonPath = path.resolve(__dirname, '../../package.json');
      const packageJsonContent = fs.readFileSync(packageJsonPath, 'utf-8');
      const packageJson = JSON.parse(packageJsonContent);
      
      this.logger.info(`Loaded package info: ${packageJson.name} v${packageJson.version}`);
      
      return {
        name: packageJson.name || 'APIForgeMCP',
        version: packageJson.version || '1.0.0'
      };
    } catch (error) {
      this.logger.warn('Failed to load package.json, using defaults:', error);
      // Fallback to defaults if package.json cannot be read
      return {
        name: 'APIForgeMCP',
        version: '1.0.0'
      };
    }
  }

  /**
   * Setup MCP protocol handlers
   */
  private setupHandlers(): void {
    // Handle tool listing
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      const tools = this.toolRegistry.getToolDescriptions();
      return { tools };
    });

    // Handle tool execution
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;
      
      try {
        const result = await this.toolRegistry.executeTool(name, args);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        return {
          content: [
            {
              type: 'text',
              text: `Error: ${errorMessage}`,
            },
          ],
          isError: true,
        };
      }
    });
  }

  /**
   * Register all available tools
   */
  private registerTools(): void {
    const services = this.getServices();
    
    // Register workspace management tools
    this.registerWorkspaceTools(services);
    
    // Register endpoint management tools
    this.registerEndpointTools(services);
    
    // Register request execution tools
    this.registerRequestTools(services);
    
    this.logger.info(`Registered ${this.toolRegistry.getToolCount()} tools`);
  }

  /**
   * Register workspace management tools
   */
  private registerWorkspaceTools(services: ReturnType<typeof this.getServices>): void {
    this.toolRegistry.registerTool({
      name: 'create_workspace',
      description: 'Create a new workspace for API endpoint management',
      inputSchema: require('../tools/schemas/workspace.schemas').CreateWorkspaceSchema,
      handler: async (input) => {
        return await services.workspaceManager.createWorkspace(input);
      },
    });

    this.toolRegistry.registerTool({
      name: 'list_workspaces',
      description: 'List all available workspaces',
      inputSchema: require('../tools/schemas/workspace.schemas').ListWorkspacesSchema,
      handler: async () => {
        return await services.workspaceManager.listWorkspaces();
      },
    });

    this.toolRegistry.registerTool({
      name: 'switch_workspace',
      description: 'Switch to a different workspace',
      inputSchema: require('../tools/schemas/workspace.schemas').SwitchWorkspaceSchema,
      handler: async (input) => {
        await services.workspaceManager.switchWorkspace(input.workspaceId);
        return { success: true, message: `Switched to workspace: ${input.workspaceId}` };
      },
    });

    this.toolRegistry.registerTool({
      name: 'get_current_workspace',
      description: 'Get information about the current workspace',
      inputSchema: require('../tools/schemas/workspace.schemas').GetCurrentWorkspaceSchema,
      handler: async () => {
        return services.workspaceManager.getCurrentWorkspace();
      },
    });

    this.toolRegistry.registerTool({
      name: 'update_workspace',
      description: 'Update workspace configuration and settings',
      inputSchema: require('../tools/schemas/workspace.schemas').UpdateWorkspaceSchema,
      handler: async (input) => {
        const updatedWorkspace = await services.workspaceManager.updateWorkspace(input.workspaceId, input.updates);
        return updatedWorkspace;
      },
    });

    this.toolRegistry.registerTool({
      name: 'delete_workspace',
      description: 'Delete a workspace and all its endpoints',
      inputSchema: require('../tools/schemas/workspace.schemas').DeleteWorkspaceSchema,
      handler: async (input) => {
        await services.workspaceManager.deleteWorkspace(input.workspaceId);
        return { success: true, message: `Workspace deleted: ${input.workspaceId}` };
      },
    });
  }

  /**
   * Register endpoint management tools
   */
  private registerEndpointTools(services: ReturnType<typeof this.getServices>): void {
    this.toolRegistry.registerTool({
      name: 'add_endpoint',
      description: 'Add a new API endpoint to the current workspace',
      inputSchema: require('../tools/schemas/endpoint.schemas').AddEndpointSchema,
      handler: async (input) => {
        return await services.endpointRegistry.addEndpoint(input);
      },
    });

    this.toolRegistry.registerTool({
      name: 'list_endpoints',
      description: 'List all endpoints in the current workspace',
      inputSchema: require('../tools/schemas/endpoint.schemas').ListEndpointsSchema,
      handler: async (input) => {
        return await services.endpointRegistry.listEndpoints(input.workspaceId, input.tags);
      },
    });

    this.toolRegistry.registerTool({
      name: 'get_endpoint',
      description: 'Get details of a specific endpoint',
      inputSchema: require('../tools/schemas/endpoint.schemas').GetEndpointSchema,
      handler: async (input) => {
        return await services.endpointRegistry.getEndpoint(input.endpointId);
      },
    });

    this.toolRegistry.registerTool({
      name: 'update_endpoint',
      description: 'Update an existing endpoint',
      inputSchema: require('../tools/schemas/endpoint.schemas').UpdateEndpointSchema,
      handler: async (input) => {
        return await services.endpointRegistry.updateEndpoint(input.endpointId, input.updates);
      },
    });

    this.toolRegistry.registerTool({
      name: 'delete_endpoint',
      description: 'Delete an endpoint from the workspace',
      inputSchema: require('../tools/schemas/endpoint.schemas').DeleteEndpointSchema,
      handler: async (input) => {
        await services.endpointRegistry.deleteEndpoint(input.endpointId);
        return { success: true, message: `Endpoint deleted: ${input.endpointId}` };
      },
    });

    this.toolRegistry.registerTool({
      name: 'search_endpoints',
      description: 'Search endpoints by name, URL, or tags',
      inputSchema: require('../tools/schemas/endpoint.schemas').SearchEndpointsSchema,
      handler: async (input) => {
        return await services.endpointRegistry.searchEndpoints(input.query, input.workspaceId);
      },
    });
  }

  /**
   * Register request execution tools
   */
  private registerRequestTools(services: ReturnType<typeof this.getServices>): void {
    this.toolRegistry.registerTool({
      name: 'execute_request',
      description: 'Execute an HTTP request using endpoint configuration',
      inputSchema: require('../tools/schemas/request.schemas').ExecuteRequestSchema,
      handler: async (input) => {
        return await services.requestExecutor.execute(input.endpoint, input.variables);
      },
    });

    this.toolRegistry.registerTool({
      name: 'execute_request_by_id',
      description: 'Execute an HTTP request using endpoint ID',
      inputSchema: require('../tools/schemas/request.schemas').ExecuteRequestByIdSchema,
      handler: async (input) => {
        return await services.requestExecutor.executeById(input.endpointId, input.variables);
      },
    });

    this.toolRegistry.registerTool({
      name: 'execute_collection',
      description: 'Execute multiple requests (batch execution)',
      inputSchema: require('../tools/schemas/request.schemas').ExecuteCollectionSchema,
      handler: async (input) => {
        return await services.requestExecutor.executeCollection(input.endpoints, input.options);
      },
    });

    this.toolRegistry.registerTool({
      name: 'validate_response',
      description: 'Validate response against expected criteria',
      inputSchema: require('../tools/schemas/request.schemas').ValidateResponseSchema,
      handler: async (input) => {
        return services.requestExecutor.validateResponse(
          input.response,
          input.expectedStatus,
          input.expectedBody
        );
      },
    });
  }
}