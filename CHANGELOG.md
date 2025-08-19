# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.6] - 2025-08-19

### Fixed
- Fixed endpoint storage error recovery mechanism with improved validation
- Resolved storage error handling where operations succeed but return errors
- Fixed SSL/TLS certificate validation issues for HTTPS requests in development
- Added HTTPS agent configuration for self-signed certificates
- Fixed missing `update_workspace` MCP tool functionality
- Added comprehensive error recovery logic for both workspace and endpoint operations
- Fixed TypeScript compilation errors in error handling variable scoping
- Improved cross-platform HTTPS request handling with proper agent configuration

### Enhanced
- Enhanced error recovery with intelligent retry mechanisms
- Improved storage error detection and graceful degradation
- Better handling of Windows-specific storage initialization issues
- Added proper null checks and error context preservation in exception handlers

## [1.0.5] - 2025-08-19

### Fixed
- Fixed workspace creation failure due to schema property mismatch
- Resolved "Failed to save workspace" error on Windows systems
- Fixed configuration property inconsistency between MCP tool schema and internal schema
- Improved Windows path validation to handle drive letters and backslashes
- Enhanced error recovery mechanism to handle cases where data saves successfully but errors are reported
- Fixed variable scoping issues in workspace creation error handling

## [1.0.3] - 2025-08-19

### Fixed
- Fixed storage initialization error on Windows systems
- Improved cross-platform path handling with proper normalization
- Enhanced error handling for file write operations with detailed logging
- Fixed directory creation to ensure all required subdirectories exist
- Added better error context for storage-related failures

## [1.0.2] - 2025-08-19
- Fixed JSON Schema validation error for MCP tool registration
- Added `zod-to-json-schema` library for proper schema conversion
- Ensured JSON Schema draft 2020-12 compliance

## [1.0.1] - 2025-08-19
- Support npx for running the server without installation
- Updated README.md for better clarity
- Added Claude Code integration instructions
- Added Claude Desktop integration instructions

## [1.0.0] - 2025-08-18

### Added

- Initial release of APIForge MCP Server
- Complete MCP (Model Context Protocol) implementation
- Workspace management for API organization
- HTTP request execution with all standard methods
- Multiple authentication methods (Basic, Bearer, API Key, OAuth2)
- Environment variable management with encryption support
- OpenAPI 3.0 and Postman Collection import
- Request history tracking and analytics
- Batch execution with parallel and sequential modes
- Response validation with JSON Schema support
- Performance monitoring dashboard
- Intelligent error handling with retry and circuit breaker
- Comprehensive security features (AES-256-CBC encryption)
- Full TypeScript support
- Extensive test coverage
- Complete documentation suite

### Security

- AES-256-CBC encryption for sensitive data
- Scrypt key derivation for password security
- Input validation with Zod schemas
- Path traversal protection
- No known vulnerabilities (npm audit clean)

## [0.9.0] - 2025-08-15 (Pre-release)

### Added

- Performance optimization features
- Cache management system
- Connection pooling
- Rate limiting implementation
- Load testing capabilities

## [0.8.0] - 2025-08-10 (Pre-release)

### Added

- Response validation system
- Custom assertion library
- JSON Schema validation
- Validation profiles

## [0.7.0] - 2025-08-05 (Pre-release)

### Added

- Batch execution system
- Priority-based execution
- Progress tracking
- Parallel execution strategies

## [0.6.0] - 2025-08-01 (Pre-release)

### Added

- Request history tracking
- Performance analytics
- Anomaly detection
- Trend analysis

## [0.5.0] - 2025-07-25 (Pre-release)

### Added

- OpenAPI 3.0 import support
- Postman Collection import
- API documentation generation

## [0.4.0] - 2025-07-20 (Pre-release)

### Added

- Error recovery service
- Circuit breaker pattern
- Automatic retry logic
- Exponential backoff

## [0.3.0] - 2025-07-15 (Pre-release)

### Added

- Environment variable system
- Variable encryption
- Environment inheritance
- Secure variable replacement

## [0.2.0] - 2025-07-10 (Pre-release)

### Added

- Authentication service
- OAuth2 support
- Token management
- Multiple auth methods

## [0.1.0] - 2025-07-01 (Pre-release)

### Added

- Initial project structure
- Basic MCP server implementation
- Workspace management
- Simple HTTP request execution
- File-based storage
