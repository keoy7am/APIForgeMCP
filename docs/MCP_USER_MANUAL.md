# APIForge MCP Server User Manual

## 📚 Table of Contents

1. [Introduction](#introduction)
2. [Quick Start](#quick-start)
3. [MCP Tools Reference](#mcp-tools-reference)
4. [Usage Examples](#usage-examples)
5. [Best Practices](#best-practices)
6. [FAQ](#faq)
7. [API Reference](#api-reference)

---

## Introduction

APIForge MCP Server is a powerful API testing and management tool that provides complete API development workflow support through the Model Context Protocol (MCP).

### Core Features

- 🚀 **HTTP Request Execution** - Supports all HTTP methods and custom configurations
- 🔒 **Multiple Authentication Methods** - Basic, Bearer, API Key, OAuth2
- 🌍 **Environment Management** - Variable management, encryption support, environment switching
- 📦 **Collection Management** - API endpoint organization, folder structure, batch operations
- 📊 **History Tracking** - Request/response tracking, performance analysis
- 🔄 **API Import** - OpenAPI 3.0, Postman Collection support
- ⚡ **Smart Error Handling** - Auto-retry, circuit breaker, error recovery

### System Architecture

```
┌─────────────────────────────────────┐
│         MCP Client (Claude)          │
├─────────────────────────────────────┤
│          MCP Protocol Layer          │
├─────────────────────────────────────┤
│        APIForge MCP Server          │
├────────────┬────────────┬───────────┤
│  Services  │  Storage   │   Tools   │
├────────────┼────────────┼───────────┤
│   HTTP     │    File    │  Execute  │
│   Auth     │    JSON    │  Manage   │
│   Env      │  Encrypt   │  Import   │
│   Error    │  History   │  Export   │
└────────────┴────────────┴───────────┘
```

---

## Quick Start

### Installation

```bash
# Clone the project
git clone https://github.com/keoy7am/APIForgeMCP.git
cd APIForgeMCP

# Install dependencies
npm install

# Compile TypeScript
npm run build

# Start MCP Server
npm start
```

### Claude Desktop Configuration

Add to Claude Desktop configuration file:

```json
{
  "mcpServers": {
    "apiforge": {
      "command": "node",
      "args": ["./dist/index.js"],
      "cwd": "A:/fast-git/APIForgeMCP"
    }
  }
}
```

### First Request

```typescript
// Using MCP tools in Claude
await use_mcp_tool("apiforge", "workspace_create", {
  name: "My API Project",
  description: "Test Project"
});

await use_mcp_tool("apiforge", "request_execute", {
  workspaceId: "workspace-id",
  method: "GET",
  url: "https://api.example.com/users"
});
```

---

## MCP Tools Reference

### 1. Workspace Management Tools

#### workspace_create
Create a new workspace to organize API endpoints.

**Parameters:**
- `name` (required): Workspace name
- `description` (optional): Workspace description
- `projectPath` (optional): Project path

**Example:**
```javascript
{
  "name": "E-Commerce API",
  "description": "E-commerce platform API testing",
  "projectPath": "/projects/ecommerce"
}
```

#### workspace_list
List all workspaces.

**Returns:**
```javascript
[
  {
    "id": "ws-123",
    "name": "E-Commerce API",
    "endpointCount": 25,
    "createdAt": "2025-01-01T00:00:00Z"
  }
]
```

### 2. HTTP Request Tools

#### request_execute
Execute HTTP requests, supports all standard methods.

**Parameters:**
- `workspaceId` (required): Workspace ID
- `method` (required): HTTP method (GET, POST, PUT, DELETE, PATCH, HEAD, OPTIONS)
- `url` (required): Request URL
- `headers` (optional): Request headers
- `body` (optional): Request body
- `queryParams` (optional): Query parameters
- `authentication` (optional): Authentication configuration
- `environmentId` (optional): Environment ID

**Authentication Types:**

1. **Basic Authentication**
```javascript
{
  "authentication": {
    "type": "basic",
    "credentials": {
      "username": "user",
      "password": "pass"
    }
  }
}
```

2. **Bearer Token**
```javascript
{
  "authentication": {
    "type": "bearer",
    "credentials": {
      "token": "eyJhbGciOiJIUzI1NiIs..."
    }
  }
}
```

3. **API Key**
```javascript
{
  "authentication": {
    "type": "apikey",
    "credentials": {
      "key": "X-API-Key",
      "value": "your-api-key",
      "location": "header" // 或 "query"
    }
  }
}
```

4. **OAuth 2.0**
```javascript
{
  "authentication": {
    "type": "oauth2",
    "credentials": {
      "accessToken": "access-token",
      "refreshToken": "refresh-token",
      "tokenType": "Bearer",
      "expiresAt": "2025-12-31T23:59:59Z"
    }
  }
}
```

### 3. Environment Variable Tools

#### environment_create
Create environment configuration with variable management and encryption support.

**Parameters:**
- `workspaceId` (required): Workspace ID
- `name` (required): Environment name
- `variables` (required): Variables object
- `parentEnvironmentId` (optional): Parent environment ID (for inheritance)

**Example:**
```javascript
{
  "workspaceId": "ws-123",
  "name": "Production",
  "variables": {
    "BASE_URL": "https://api.production.com",
    "API_KEY": "{{encrypted:aGVsbG8=}}",
    "TIMEOUT": "30000"
  }
}
```

#### environment_variable_set
Set or update environment variables.

**Parameters:**
- `environmentId` (required): Environment ID
- `name` (required): Variable name
- `value` (required): Variable value
- `encrypted` (optional): Whether to encrypt storage

### 4. Collection Management Tools

#### collection_create
Create API endpoint collection.

**Parameters:**
- `name` (required): Collection name
- `description` (optional): Collection description
- `folders` (optional): Folder structure

#### collection_import
Import external API definitions.

**Supported formats:**
- OpenAPI 3.0 Specification
- Postman Collection v2.1

**Parameters:**
- `format` (required): "openapi" or "postman"
- `data` (required): API definition content (JSON or YAML)
- `workspaceId` (optional): Target workspace

**Example:**
```javascript
{
  "format": "openapi",
  "data": {
    "openapi": "3.0.0",
    "info": {
      "title": "Sample API",
      "version": "1.0.0"
    },
    "paths": {
      "/users": {
        "get": {
          "summary": "Get all users",
          "responses": {
            "200": {
              "description": "Success"
            }
          }
        }
      }
    }
  }
}
```

### 5. History and Analysis Tools

#### history_list
View request history.

**Parameters:**
- `workspaceId` (optional): Filter specific workspace
- `limit` (optional): Return quantity limit
- `startDate` (optional): Start date
- `endDate` (optional): End date
- `status` (optional): Filter status ('success' | 'error' | 'timeout')
- `minDuration` (optional): Minimum duration (milliseconds)
- `maxDuration` (optional): Maximum duration (milliseconds)

**Return format:**
```javascript
[
  {
    "id": "hist-123",
    "timestamp": "2025-01-01T12:00:00Z",
    "method": "GET",
    "url": "https://api.example.com/users",
    "status": 200,
    "duration": 245,
    "size": 1024,
    "errorDetails": null
  }
]
```

#### history_analyze
Analyze historical request data to identify performance patterns and anomalies.

**Parameters:**
- `workspaceId` (required): Workspace ID
- `timeRange` (optional): Time range ('1h' | '24h' | '7d' | '30d')
- `metrics` (optional): Array of metrics to calculate
- `groupBy` (optional): Group by ('endpoint' | 'status' | 'hour')

**Example:**
```javascript
{
  "workspaceId": "ws-123",
  "timeRange": "24h",
  "metrics": ["p95Duration", "errorRate", "requestCount"],
  "groupBy": "endpoint"
}
```

**Return format:**
```javascript
{
  "summary": {
    "totalRequests": 1500,
    "successRate": 0.98,
    "averageDuration": 245,
    "p50Duration": 200,
    "p95Duration": 450,
    "p99Duration": 800
  },
  "trends": [
    {
      "timestamp": "2025-01-01T00:00:00Z",
      "requestCount": 120,
      "averageDuration": 230,
      "errorRate": 0.02
    }
  ],
  "anomalies": [
    {
      "timestamp": "2025-01-01T14:30:00Z",
      "type": "latency_spike",
      "severity": "high",
      "duration": 2500,
      "expectedDuration": 250,
      "endpoint": "/api/users"
    }
  ]
}
```

#### history_detect_anomalies
Automatically detect anomalous patterns in request history.

**Parameters:**
- `workspaceId` (required): Workspace ID
- `sensitivity` (optional): Sensitivity ('low' | 'medium' | 'high')
- `lookbackPeriod` (optional): Lookback period (hours)

**Example:**
```javascript
{
  "workspaceId": "ws-123",
  "sensitivity": "medium",
  "lookbackPeriod": 48
}
```

### 6. Batch Execution Tools

#### batch_execute
Execute multiple API requests in batch, supports parallel and sequential execution modes.

**Parameters:**
- `workspaceId` (required): Workspace ID
- `endpoints` (required): Array of endpoint IDs or endpoint configurations
- `mode` (optional): Execution mode ('parallel' | 'sequential' | 'priority')
- `concurrency` (optional): Concurrency count (parallel mode)
- `stopOnError` (optional): Stop on error
- `delayBetweenRequests` (optional): Delay between requests (milliseconds)

**Example:**
```javascript
{
  "workspaceId": "ws-123",
  "endpoints": ["endpoint-1", "endpoint-2", "endpoint-3"],
  "mode": "parallel",
  "concurrency": 3,
  "stopOnError": false,
  "delayBetweenRequests": 100
}
```

**Advanced batch configuration:**
```javascript
{
  "workspaceId": "ws-123",
  "endpoints": [
    {
      "id": "endpoint-1",
      "priority": 1,
      "retryOnError": true
    },
    {
      "id": "endpoint-2",
      "priority": 2,
      "dependsOn": ["endpoint-1"]
    }
  ],
  "mode": "priority"
}
```

**Return format:**
```javascript
{
  "batchId": "batch-123",
  "status": "completed",
  "summary": {
    "total": 3,
    "successful": 2,
    "failed": 1,
    "averageDuration": 245,
    "totalDuration": 735
  },
  "results": [
    {
      "endpointId": "endpoint-1",
      "status": "success",
      "duration": 200,
      "response": { ... }
    }
  ]
}
```

### 7. Response Validation Tools

#### validation_profile_create
Create response validation profile.

**Parameters:**
- `workspaceId` (required): Workspace ID
- `name` (required): Profile name
- `rules` (required): Array of validation rules
- `description` (optional): Profile description

**Validation rule types:**

1. **Status Code Validation**
```javascript
{
  "type": "status",
  "expectedStatus": [200, 201],
  "severity": "error"
}
```

2. **JSON Schema Validation**
```javascript
{
  "type": "schema",
  "schema": {
    "type": "object",
    "properties": {
      "id": { "type": "number" },
      "name": { "type": "string" }
    },
    "required": ["id", "name"]
  },
  "severity": "error"
}
```

3. **Custom Assertions**
```javascript
{
  "type": "custom",
  "assertion": "response.body.count > 0",
  "message": "Count must be greater than 0",
  "severity": "warning"
}
```

#### validation_execute
Execute validation on response.

**Parameters:**
- `response` (required): Response object to validate
- `profileId` (optional): Validation profile ID to use
- `customRules` (optional): Temporary validation rules

**Example:**
```javascript
{
  "response": {
    "status": 200,
    "body": { "id": 1, "name": "Test" }
  },
  "profileId": "profile-123"
}
```

### 8. Performance Monitoring Tools

#### performance_dashboard_get
Get performance monitoring dashboard data.

**Parameters:**
- `workspaceId` (required): Workspace ID
- `timeRange` (optional): Time range ('1h' | '24h' | '7d')
- `metrics` (optional): Metrics to include

**Return format:**
```javascript
{
  "overview": {
    "totalRequests": 5000,
    "averageLatency": 245,
    "errorRate": 0.02,
    "throughput": 83.3
  },
  "topEndpoints": [
    {
      "endpoint": "/api/users",
      "requestCount": 1200,
      "averageLatency": 180,
      "p95Latency": 320
    }
  ],
  "performanceTrends": [
    {
      "timestamp": "2025-01-01T00:00:00Z",
      "latency": 230,
      "throughput": 80,
      "errorRate": 0.01
    }
  ],
  "alerts": [
    {
      "type": "high_latency",
      "endpoint": "/api/search",
      "threshold": 1000,
      "actual": 1500,
      "timestamp": "2025-01-01T14:30:00Z"
    }
  ]
}
```

#### performance_optimize
Automatically optimize performance configuration.

**Parameters:**
- `workspaceId` (required): Workspace ID
- `target` (optional): Optimization target ('latency' | 'throughput' | 'reliability')
- `autoApply` (optional): Automatically apply recommendations

**Example:**
```javascript
{
  "workspaceId": "ws-123",
  "target": "latency",
  "autoApply": false
}
```

**Return format:**
```javascript
{
  "recommendations": [
    {
      "type": "cache_configuration",
      "current": { "enabled": false },
      "suggested": { 
        "enabled": true,
        "ttl": 300,
        "maxSize": 100
      },
      "expectedImprovement": "30% latency reduction"
    },
    {
      "type": "connection_pool",
      "current": { "maxConnections": 10 },
      "suggested": { "maxConnections": 50 },
      "expectedImprovement": "50% throughput increase"
    }
  ]
}
```

---

## Usage Examples

### Example 1: Complete API Testing Workflow

```javascript
// 1. Create workspace
const workspace = await use_mcp_tool("apiforge", "workspace_create", {
  name: "API Testing",
  description: "Complete testing workflow demo"
});

// 2. Create environment
const environment = await use_mcp_tool("apiforge", "environment_create", {
  workspaceId: workspace.id,
  name: "Development",
  variables: {
    BASE_URL: "https://dev.api.com",
    API_KEY: "dev-key-123",
    USER_ID: "test-user"
  }
});

// 3. Create endpoint
const endpoint = await use_mcp_tool("apiforge", "endpoint_create", {
  workspaceId: workspace.id,
  name: "Get User Profile",
  method: "GET",
  url: "{{BASE_URL}}/users/{{USER_ID}}",
  headers: {
    "X-API-Key": "{{API_KEY}}"
  }
});

// 4. Execute request
const response = await use_mcp_tool("apiforge", "request_execute", {
  endpointId: endpoint.id,
  environmentId: environment.id
});

console.log(`Status: ${response.status}`);
console.log(`Response: ${JSON.stringify(response.body)}`);
```

### Example 2: Batch Request Execution

```javascript
// Execute multiple endpoints in batch
const endpoints = [
  { method: "GET", url: "/users" },
  { method: "GET", url: "/products" },
  { method: "GET", url: "/orders" }
];

const results = await Promise.all(
  endpoints.map(ep => 
    use_mcp_tool("apiforge", "request_execute", {
      workspaceId: "ws-123",
      method: ep.method,
      url: `{{BASE_URL}}${ep.url}`,
      environmentId: "env-123"
    })
  )
);

// Analyze results
results.forEach((res, i) => {
  console.log(`${endpoints[i].url}: ${res.status} - ${res.duration}ms`);
});
```

### Example 3: Error Handling and Retry

```javascript
// Configure smart retry strategy
const requestWithRetry = async (config) => {
  const maxRetries = 3;
  let lastError;
  
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await use_mcp_tool("apiforge", "request_execute", {
        ...config,
        retryConfig: {
          maxAttempts: 3,
          backoffMultiplier: 2,
          baseDelay: 1000
        }
      });
    } catch (error) {
      lastError = error;
      console.log(`Attempt ${i + 1} failed: ${error.message}`);
      
      // Exponential backoff
      await new Promise(resolve => 
        setTimeout(resolve, Math.pow(2, i) * 1000)
      );
    }
  }
  
  throw lastError;
};
```

### Example 4: Environment Variable Substitution

```javascript
// Use environment variables for dynamic configuration
const environments = {
  dev: {
    BASE_URL: "https://dev.api.com",
    API_VERSION: "v1"
  },
  staging: {
    BASE_URL: "https://staging.api.com",
    API_VERSION: "v2"
  },
  prod: {
    BASE_URL: "https://api.com",
    API_VERSION: "v2"
  }
};

// Execute same request in different environments
for (const [envName, vars] of Object.entries(environments)) {
  const env = await use_mcp_tool("apiforge", "environment_create", {
    workspaceId: "ws-123",
    name: envName,
    variables: vars
  });
  
  const response = await use_mcp_tool("apiforge", "request_execute", {
    workspaceId: "ws-123",
    method: "GET",
    url: "{{BASE_URL}}/{{API_VERSION}}/status",
    environmentId: env.id
  });
  
  console.log(`${envName}: ${response.status}`);
}
```

---

## Best Practices

### 1. Workspace Organization

- **Divide by Project**: Use independent workspaces for each project
- **Naming Conventions**: Use clear, descriptive names
- **Documentation**: Add descriptions for each endpoint

### 2. Environment Management

- **Encrypt Sensitive Data**: Use encryption features to protect API keys
- **Environment Isolation**: Clearly distinguish development, testing, and production environments
- **Variable Inheritance**: Use parent environments to reduce duplicate configuration

### 3. Error Handling

- **Implement Retry Logic**: Handle temporary network errors
- **Use Circuit Breakers**: Prevent cascading failures
- **Log Detailed Errors**: Facilitate debugging and monitoring

### 4. Performance Optimization

- **Batch Operations**: Use batch APIs to reduce request count
- **Caching Strategy**: Implement caching for data that doesn't change frequently
- **Connection Pooling**: Reuse HTTP connections

### 5. Security Considerations

- **Principle of Least Privilege**: Only grant necessary API access permissions
- **Regular Key Updates**: Implement key rotation strategy
- **Audit Logs**: Record all API operations

---

## FAQ

### Q1: How to handle CORS errors?

CORS is a browser security mechanism. MCP Server runs in Node.js environment and is not subject to CORS restrictions. For browser testing, configure appropriate CORS headers or use a proxy.

### Q2: What authentication methods are supported?

Currently supported:
- Basic Authentication
- Bearer Token
- API Key (Header/Query)
- OAuth 2.0 (including auto-refresh)

### Q3: How to handle large responses?

For large responses (>10MB), recommend:
1. Use streaming processing
2. Implement pagination
3. Only request necessary fields

### Q4: What is the variable substitution syntax?

Use double bracket syntax: `{{VARIABLE_NAME}}`

Supported locations:
- URL
- Headers
- Query Parameters
- Request Body

### Q5: How to debug requests?

Enable verbose logging:
```javascript
{
  "debug": true,
  "logLevel": "verbose"
}
```

### Q6: Are there limits for batch requests?

Recommended limits:
- Concurrent requests: 10
- Batch size: 100
- Timeout: 30 seconds

---

## API Reference

### Error Codes

| Code | Description | Solution |
|------|-------------|----------|
| `WORKSPACE_NOT_FOUND` | Workspace not found | Check workspace ID |
| `ENDPOINT_NOT_FOUND` | Endpoint not found | Verify endpoint ID |
| `AUTH_FAILED` | Authentication failed | Check authentication credentials |
| `NETWORK_ERROR` | Network error | Check network connection |
| `TIMEOUT` | Request timeout | Increase timeout duration |
| `RATE_LIMIT` | Rate limit | Implement backoff strategy |
| `INVALID_CONFIG` | Invalid configuration | Check configuration format |

### Response Format

All MCP tools return unified format:

```typescript
interface MCPResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
  metadata?: {
    duration: number;
    timestamp: string;
    version: string;
  };
}
```

### Type Definitions

```typescript
// Workspace
interface Workspace {
  id: string;
  name: string;
  description?: string;
  projectPath?: string;
  createdAt: Date;
  updatedAt: Date;
}

// Endpoint
interface ApiEndpoint {
  id: string;
  workspaceId: string;
  name: string;
  method: HttpMethod;
  url: string;
  headers?: Record<string, string>;
  queryParams?: Record<string, string>;
  body?: any;
  authentication?: AuthConfig;
}

// Environment
interface Environment {
  id: string;
  name: string;
  workspaceId: string;
  variables: Record<string, any>;
  parentEnvironmentId?: string;
}

// Request History
interface RequestHistory {
  id: string;
  endpointId: string;
  timestamp: Date;
  request: RequestData;
  response: ResponseData;
  duration: number;
  status: 'success' | 'error';
}
```

---

## Advanced Features

### 1. Webhook Support

Configure Webhook to receive request results:

```javascript
{
  "webhook": {
    "url": "https://your-webhook.com/callback",
    "events": ["request.completed", "request.failed"],
    "headers": {
      "X-Webhook-Secret": "your-secret"
    }
  }
}
```

### 2. Script Execution

Execute custom scripts before and after requests:

```javascript
{
  "preRequestScript": `
    // Set dynamic timestamp
    pm.variables.set('timestamp', Date.now());
  `,
  "postResponseScript": `
    // Validate response
    pm.test('Status is 200', () => {
      pm.expect(pm.response.status).to.equal(200);
    });
  `
}
```

### 3. Data-Driven Testing

Use CSV or JSON data for batch testing:

```javascript
const testData = [
  { userId: 1, expected: "John" },
  { userId: 2, expected: "Jane" },
  { userId: 3, expected: "Bob" }
];

for (const data of testData) {
  const response = await use_mcp_tool("apiforge", "request_execute", {
    workspaceId: "ws-123",
    method: "GET",
    url: `{{BASE_URL}}/users/${data.userId}`,
    environmentId: "env-123"
  });
  
  assert(response.body.name === data.expected);
}
```

### 4. Monitoring and Alerting

Configure automatic monitoring and alerting:

```javascript
{
  "monitoring": {
    "enabled": true,
    "interval": 300, // 5 minutes
    "alerts": [
      {
        "condition": "response.status >= 500",
        "action": "email",
        "target": "ops@example.com"
      },
      {
        "condition": "response.duration > 1000",
        "action": "slack",
        "target": "#alerts"
      }
    ]
  }
}
```