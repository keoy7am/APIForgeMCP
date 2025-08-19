# APIForge MCP Server

**API Testing and Management Tool for AI Agents - MCP Server**

[![npm version](https://badge.fury.io/js/apiforge-mcp.svg)](https://www.npmjs.com/package/apiforge-mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Overview

APIForge MCP Server is an API testing and management tool designed specifically for AI Agents, providing secure and efficient API management and testing capabilities through the Model Context Protocol (MCP).

### Core Features

- **Workspace Isolation**: Each project has independent API endpoint management space
- **AI Native**: MCP protocol interface designed specifically for AI Agents
- **Developer Friendly**: Supports OpenAPI/Swagger import, simplifying API configuration
- **Secure and Controlled**: Strict permission control and request isolation
- **Intelligent Error Handling**: Automatic retry, circuit breaker, error recovery mechanisms
- **Multiple Authentication Methods**: Basic, Bearer, API Key, OAuth2
- **Environment Management**: Variable management, encryption support, environment switching
- **Test Framework**: Complete unit testing, integration testing, performance testing

## Quick Start

### Installation

#### Requirements

- Node.js >= 18
- Claude Desktop、Claude Code、Cursor or other MCP Client

#### Quick Start with npx (No installation required)

```bash
# Run directly with npx - no installation needed!
npx apiforge-mcp@latest

# By default, allows self-signed certificates for localhost and private networks
# Perfect for local development and testing!
```

#### Global Installation

```bash
# Install globally
npm install -g apiforge-mcp

# Run the server
APIForgeMCP
```

#### Local Development

```bash
# Clone and run locally
git clone https://github.com/keoy7am/APIForgeMCP.git
cd APIForgeMCP
npm install
npm run build
npm start
```

### Configure To Client

<details>
  <summary>Claude Code</summary>

```bash
  claude mcp add apiforge -- npx -y apiforge-mcp@latest
  claude mcp add apiforge --scope user -- npx -y apiforge-mcp@latest (set to global)
```

  **Alternative configuration for globally installed version:**

```bash
  claude mcp add apiforge APIForgeMCP
```

#### Verify Installation

```bash
  claude mcp list
```

  it should be showing `✓ Connected` in list!!

</details>

<details>
  <summary>Claude Desktop MCP Integration</summary>

  To integrate APIForge with Claude Desktop, you need to add the following configuration to your Claude Desktop MCP settings:

  **Configuration file locations:**
  Add this to your Claude Desktop claude_desktop_config.json file. See [Claude Desktop MCP](https://modelcontextprotocol.io/quickstart/user) docs for more info.

```json
  {
    "mcpServers": {
      "apiforge": {
        "command": "npx",
        "args": ["apiforge-mcp@latest"],
        "env": {
          "APIFORGE_DATA_DIR": "~/.apiforge"
          // "APIFORGE_ENABLE_LOGS": "true"  // Uncomment only for debugging
        }
      }
    }
  }
```

**Alternative configuration for globally installed version:**

```json
{
  "mcpServers": {
    "apiforge": {
      "command": "APIForgeMCP",
      "args": [],
      "env": {
        "APIFORGE_DATA_DIR": "~/.apiforge"
      }
    }
  }
}
```

#### Verify Installation

After configuration, restart Claude Desktop and verify the server is available:

1. **Restart Claude Desktop** - Close and reopen the application
2. **Check MCP Connection** - Look for the MCP indicator in the interface
3. **Test Available Tools** - Try using APIForge tools in your conversation:
   - Ask Claude to "create a new API workspace"
   - Request to "list available API endpoints"
   - The tools `workspace.create`, `endpoint.add`, etc. should be available

</details>

## Quick Test

Once configured, you can test APIForge MCP Server with these simple commands in Claude Desktop(or other client):

### Test Commands

Try these commands in your Claude conversation:

1. **Create a test workspace:**

   ```
   "Please create an API workspace called 'Test Project'"
   ```
2. **Add a test endpoint:**

   ```
   "Add a GET endpoint for https://jsonplaceholder.typicode.com/users"
   ```
3. **Execute the request:**

   ```
   "Execute the users endpoint and show me the results"
   ```

If these commands work, your APIForge MCP Server is properly configured!

## Basic Usage

### 1. Workspace Management

```typescript
// Create workspace
const workspace = await mcp.execute('workspace.create', {
  name: 'My API Project',
  projectPath: './my-project',
  description: 'My API testing project'
});

// Switch workspace
await mcp.execute('workspace.switch', {
  workspaceId: workspace.id
});

// List all workspaces
const workspaces = await mcp.execute('workspace.list', {});

// Get current workspace
const current = await mcp.execute('workspace.current', {});
```

### 2. API Endpoint Management

```typescript
// Add API endpoint
const endpoint = await mcp.execute('endpoint.add', {
  name: 'Get Users',
  method: 'GET',
  url: 'https://api.example.com/users',
  headers: {
    'Content-Type': 'application/json'
  },
  tags: ['users', 'api']
});

// List endpoints
const endpoints = await mcp.execute('endpoint.list', {});

// Get specific endpoint
const detail = await mcp.execute('endpoint.get', {
  endpointId: endpoint.id
});

// Update endpoint
const updated = await mcp.execute('endpoint.update', {
  endpointId: endpoint.id,
  updates: {
    name: 'Get All Users',
    description: 'Get all users list'
  }
});

// Delete endpoint
await mcp.execute('endpoint.delete', {
  endpointId: endpoint.id
});
```

### 3. Request Execution

```typescript
// Execute endpoint request
const result = await mcp.execute('request.execute', {
  endpointId: endpoint.id
});

// Execute direct request
const directResult = await mcp.execute('request.execute', {
  endpoint: {
    method: 'POST',
    url: 'https://api.example.com/login',
    headers: {
      'Content-Type': 'application/json'
    },
    body: {
      username: 'user',
      password: 'pass'
    }
  }
});

// Use variable substitution
const variableResult = await mcp.execute('request.execute', {
  endpointId: endpoint.id,
  variables: {
    userId: '123',
    apiKey: 'your-api-key'
  }
});
```

## MCP Tool Reference

### Workspace Tools

| Tool Name             | Description           | Parameters                            |
| --------------------- | --------------------- | ------------------------------------- |
| `workspace.create`  | Create new workspace  | `{name, projectPath, description?}` |
| `workspace.switch`  | Switch workspace      | `{workspaceId}`                     |
| `workspace.list`    | List all workspaces   | `{}`                                |
| `workspace.current` | Get current workspace | `{}`                                |
| `workspace.delete`  | Delete workspace      | `{workspaceId, confirm}`            |

### Endpoint Tools

| Tool Name           | Description          | Parameters                                                    |
| ------------------- | -------------------- | ------------------------------------------------------------- |
| `endpoint.add`    | Add API endpoint     | `{name, method, url, headers?, queryParams?, body?, tags?}` |
| `endpoint.list`   | List endpoints       | `{workspaceId?, tags?}`                                     |
| `endpoint.get`    | Get endpoint details | `{endpointId}`                                              |
| `endpoint.update` | Update endpoint      | `{endpointId, updates}`                                     |
| `endpoint.delete` | Delete endpoint      | `{endpointId}`                                              |

### Request Tools

| Tool Name           | Description          | Parameters                                                  |
| ------------------- | -------------------- | ----------------------------------------------------------- |
| `request.execute` | Execute HTTP request | `{endpointId?, endpoint?, variables?, validateResponse?}` |

## Project Structure

```
src/
├── server/          # MCP Server core
│   ├── index.ts     # Main server class
│   └── tool-registry.ts # Tool registration system
├── services/        # Business logic services
│   ├── workspace.service.ts
│   ├── endpoint.service.ts
│   └── request.service.ts
├── storage/         # Storage layer
│   └── file-storage.ts
├── models/          # Data models and Schemas
│   └── schemas.ts
├── types/           # TypeScript type definitions
│   └── index.ts
├── utils/           # Utility functions
│   ├── errors.ts
│   └── logger.ts
└── index.ts         # Entry file
```

## Development

### Development Mode

```bash
# Clone the project
git clone https://github.com/keoy7am/APIForgeMCP.git
cd APIForgeMCP

# Install dependencies
npm install

# Run in development mode
npm run dev
```

### Running Tests

```bash
# Run all tests (optimized configuration)
npm test -- --maxWorkers=2 --testTimeout=20000

# Run tests in watch mode
npm run test:watch

# Run test coverage
npm run test:coverage
```

### Code Quality

```bash
# Run ESLint
npm run lint

# Fix ESLint issues
npm run lint:fix

# Format code
npm run format

# Type checking
npm run type-check
```

### Build and Deploy

```bash
# Build project
npm run build

# Clean build files
npm run clean
```

## Configuration

### Environment Variables

#### Core Settings

- `APIFORGE_DATA_DIR`: Data storage directory (default: `./data`)
- `NODE_ENV`: Runtime environment (`development` | `production`)

#### Logging Configuration

**Important**: Logs are **DISABLED by default** to ensure smooth MCP protocol communication.

- `APIFORGE_ENABLE_LOGS`: Set to `true` to enable logging output (for debugging only)
  - Default: `false` (logs disabled)
  - All logs are sent to stderr to avoid interfering with MCP protocol on stdout
  - Only enable when troubleshooting issues
- `APIFORGE_DEBUG`: Alternative to `APIFORGE_ENABLE_LOGS` (same effect)

#### SSL/TLS Configuration

APIForge MCP provides flexible SSL certificate validation to support both development and production environments securely.

##### Default Behavior

**When installed via npm/npx (NODE_ENV not set)**:

- ✅ **Allows** self-signed certificates for `localhost` and private networks
- ✅ **Developer-friendly** mode is enabled by default
- ℹ️ Logs informational message about using developer-friendly settings
- ⚠️ For production use, explicitly set `NODE_ENV=production`

**By Environment**:

- **Development** (`NODE_ENV=development`): Allows self-signed certificates for localhost and private networks
- **Production** (`NODE_ENV=production`): Strict SSL validation enabled by default
- **Not Set** (typical npm install): Same as development mode (developer-friendly)

##### Environment Variables for SSL

- `SSL_REJECT_UNAUTHORIZED`: Control SSL certificate validation

  - `true`: Always validate certificates (recommended for production)
  - `false`: Allow self-signed certificates (development only)
  - Default: `false` in development, `true` in production
- `SSL_ALLOWED_SELF_SIGNED_HOSTS`: Comma-separated list of hostnames allowed to use self-signed certificates

  - Example: `api.dev.local,*.test.internal,staging.example.com`
  - Supports wildcard patterns (e.g., `*.dev.local`)
- `SSL_TRUSTED_FINGERPRINTS`: Comma-separated list of trusted certificate SHA256 fingerprints

  - For additional security when using self-signed certificates

##### Security Best Practices

1. **Development Environment**:

   - Self-signed certificates are automatically allowed for:
     - `localhost`, `127.0.0.1`, `::1`
     - Private networks (10.x, 192.168.x, 172.16-31.x)
     - `.local` domains
   - Clear warnings are logged when SSL validation is bypassed
2. **Production Environment**:

   - SSL validation is strictly enforced by default
   - Only explicitly whitelisted hosts can use self-signed certificates
   - Critical warnings are logged if SSL validation is disabled
3. **Security Audit**:

   - All SSL validation bypasses are logged
   - Audit reports can be generated to review security decisions
   - Use the API to access SSL audit logs and security reports

⚠️ **Warning**: Never set `SSL_REJECT_UNAUTHORIZED=false` in production unless you fully understand the security implications. This makes your application vulnerable to MITM attacks.

### Data Storage

APIForge uses a file storage system with the following data structure:

```
data/
├── workspaces.json           # Workspace list
├── endpoints/
│   └── {workspaceId}.json   # Endpoints for each workspace
├── history/
│   └── {workspaceId}.json   # Request history
└── environments/
    └── {workspaceId}.json   # Environment variables
```

## Contributing

Welcome to submit Issues and Pull Requests!

## Roadmap

- [ ] Support WEB UI for reviewing API requests and responses history

### Development Workflow

1. Fork the project
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Create a Pull Request

## Troubleshooting

### Common Issues

#### MCP Connection Errors

If you encounter errors like `SyntaxError: Unexpected token... is not valid JSON`:

1. **Logs are disabled by default** - This is normal and prevents interference with MCP protocol
2. **To enable debugging**, add to your configuration:
   ```json
   "env": {
     "APIFORGE_ENABLE_LOGS": "true"
   }
   ```
3. **View logs** (they output to stderr):
   ```bash
   # For command line debugging
   APIFORGE_ENABLE_LOGS=true npx apiforge-mcp@latest 2>debug.log
   ```

#### SSL Certificate Issues

For self-signed certificates in development:
- APIForge automatically allows localhost and private network self-signed certificates
- For production, set `NODE_ENV=production` for strict SSL validation

## Support

- GitHub Issues: [Project Issues](https://github.com/keoy7am/APIForgeMCP/issues)
- Documentation: [MCP User Manual](./docs/MCP_USER_MANUAL.md) - Complete MCP tool documentation and examples

## License

MIT License
