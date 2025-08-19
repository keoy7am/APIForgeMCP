# APIForge MCP Server - 產品需求文檔 (PRD)

## 1. 產品概述

### 1.1 產品名稱
APIForge MCP Server - AI Agent專用的API測試與管理工具

### 1.2 產品願景
為AI Agent提供一個安全、高效的API測試環境，讓開發者能夠在後端開發過程中快速進行API調試，無需依賴外部HTTP客戶端工具。

### 1.3 目標用戶
- 後端開發工程師
- AI Agent開發者
- API測試工程師
- DevOps工程師

### 1.4 核心價值主張
- **工作區隔離**：每個專案擁有獨立的API端點管理空間
- **AI原生**：專為AI Agent設計的MCP協議接口
- **開發友好**：支持OpenAPI/Swagger導入，簡化API配置
- **安全可控**：嚴格的權限控制和請求隔離

## 2. 需求分析與調整

### 2.1 原始需求評估

| 需求項目 | 可行性 | 優先級 | 調整建議 |
|---------|--------|--------|----------|
| MCP協議支持 | ✅ 高 | P0 | 核心功能，必須實現 |
| 工作區隔離 | ✅ 高 | P0 | 安全關鍵，必須實現 |
| API端點CRUD | ✅ 高 | P0 | 基礎功能，必須實現 |
| OpenAPI導入 | ✅ 中 | P1 | 重要功能，第二階段實現 |
| WebUI界面 | ⚠️ 低 | P2 | 簡化為配置管理界面或延後實現 |
| 請求執行 | ✅ 高 | P0 | 核心功能，必須實現 |

### 2.2 調整後的需求範圍

**Phase 1 (MVP) - 核心功能**
- 工作區管理（創建、切換、刪除）
- API端點管理（CRUD操作）
- HTTP請求執行
- 基礎認證支持

**Phase 2 - 增強功能**
- OpenAPI/Swagger導入
- 環境變量管理
- 請求歷史記錄
- 批量測試執行

**Phase 3 - 進階功能**
- 簡單的WebUI管理界面
- 請求集合管理
- 自動化測試斷言
- 性能測試功能

## 3. 功能需求

### 3.1 工作區管理

#### 3.1.1 創建工作區
- **功能描述**：為每個專案創建獨立的工作區
- **輸入參數**：
  - `name`: 工作區名稱
  - `projectPath`: 專案路徑
  - `description`: 可選描述
- **業務規則**：
  - 工作區名稱必須唯一
  - 專案路徑必須存在
  - 自動生成唯一ID

#### 3.1.2 切換工作區
- **功能描述**：在不同工作區之間切換
- **權限控制**：Agent只能訪問當前激活的工作區

#### 3.1.3 工作區隔離
- **安全要求**：
  - 嚴格的數據隔離
  - 防止跨工作區訪問
  - 獨立的配置和環境變量

### 3.2 API端點管理

#### 3.2.1 端點CRUD操作
```typescript
interface ApiEndpoint {
  id: string;
  workspaceId: string;
  name: string;
  description?: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'HEAD' | 'OPTIONS';
  url: string;
  headers?: Record<string, string>;
  queryParams?: Record<string, string>;
  body?: any;
  authentication?: AuthConfig;
  timeout?: number;
  retryConfig?: RetryConfig;
}
```

#### 3.2.2 端點分組
- 支持按功能或模塊分組管理
- 支持標籤系統便於檢索

### 3.3 請求執行

#### 3.3.1 單個請求執行
- **功能**：執行單個API請求並返回結果
- **支持功能**：
  - 請求前置/後置腳本
  - 響應驗證
  - 變量替換

#### 3.3.2 批量執行
- **功能**：按順序或並行執行多個請求
- **應用場景**：端到端測試、工作流測試

### 3.4 OpenAPI支持

#### 3.4.1 導入功能
- 支持OpenAPI 3.0/Swagger 2.0
- 自動解析並創建端點
- 保留原始規範用於參考

#### 3.4.2 同步更新
- 檢測OpenAPI文件變更
- 智能合併更新

## 4. 技術架構

### 4.1 技術棧

| 層級 | 技術選型 | 用途 |
|------|----------|------|
| 語言 | TypeScript | 類型安全、開發效率 |
| 運行時 | Node.js v18+ | 服務器端運行環境 |
| MCP框架 | @modelcontextprotocol/sdk | MCP協議實現 |
| 驗證 | Zod | Schema驗證和類型推導 |
| HTTP客戶端 | Axios/Fetch | 執行HTTP請求 |
| 存儲 | JSON文件/SQLite | 輕量級數據持久化 |
| 測試 | Jest/Vitest | 單元和集成測試 |

### 4.2 系統架構

```
┌─────────────────────────────────────────────┐
│              MCP Client (AI Agent)          │
└─────────────────┬───────────────────────────┘
                  │ MCP Protocol
┌─────────────────▼───────────────────────────┐
│           MCP Server Interface              │
├─────────────────────────────────────────────┤
│                Tool Registry                │
│  ┌──────────┬──────────┬──────────────┐   │
│  │Workspace │ Endpoint │   Request     │   │
│  │  Tools   │  Tools   │   Executor    │   │
│  └──────────┴──────────┴──────────────┘   │
├─────────────────────────────────────────────┤
│             Core Services Layer             │
│  ┌──────────┬──────────┬──────────────┐   │
│  │Workspace │ Endpoint │   OpenAPI     │   │
│  │ Manager  │ Registry │   Parser      │   │
│  └──────────┴──────────┴──────────────┘   │
├─────────────────────────────────────────────┤
│            Data Persistence Layer           │
│  ┌──────────────┬──────────────────────┐  │
│  │  File Store  │   Config Manager     │  │
│  └──────────────┴──────────────────────┘  │
└─────────────────────────────────────────────┘
```

### 4.3 核心模塊設計

#### 4.3.1 WorkspaceManager
```typescript
class WorkspaceManager {
  createWorkspace(config: WorkspaceConfig): Promise<Workspace>;
  switchWorkspace(workspaceId: string): Promise<void>;
  deleteWorkspace(workspaceId: string): Promise<void>;
  listWorkspaces(): Promise<Workspace[]>;
  getCurrentWorkspace(): Workspace | null;
}
```

#### 4.3.2 EndpointRegistry
```typescript
class EndpointRegistry {
  addEndpoint(endpoint: ApiEndpoint): Promise<ApiEndpoint>;
  updateEndpoint(id: string, updates: Partial<ApiEndpoint>): Promise<ApiEndpoint>;
  deleteEndpoint(id: string): Promise<void>;
  getEndpoint(id: string): Promise<ApiEndpoint | null>;
  listEndpoints(workspaceId: string): Promise<ApiEndpoint[]>;
}
```

#### 4.3.3 RequestExecutor
```typescript
class RequestExecutor {
  execute(endpoint: ApiEndpoint, variables?: Variables): Promise<RequestResult>;
  executeCollection(endpoints: ApiEndpoint[]): Promise<RequestResult[]>;
  validateResponse(response: any, schema: any): ValidationResult;
}
```

## 5. MCP工具定義

### 5.1 工具列表

```typescript
// 工作區管理工具
const workspaceTools = {
  'workspace.create': CreateWorkspaceTool,
  'workspace.switch': SwitchWorkspaceTool,
  'workspace.delete': DeleteWorkspaceTool,
  'workspace.list': ListWorkspacesTool,
  'workspace.current': GetCurrentWorkspaceTool,
};

// 端點管理工具
const endpointTools = {
  'endpoint.add': AddEndpointTool,
  'endpoint.update': UpdateEndpointTool,
  'endpoint.delete': DeleteEndpointTool,
  'endpoint.get': GetEndpointTool,
  'endpoint.list': ListEndpointsTool,
  'endpoint.import': ImportOpenAPITool,
};

// 請求執行工具
const requestTools = {
  'request.execute': ExecuteRequestTool,
  'request.batch': BatchExecuteTool,
  'request.history': GetRequestHistoryTool,
};

// 環境管理工具
const environmentTools = {
  'env.set': SetEnvironmentVariableTool,
  'env.get': GetEnvironmentVariableTool,
  'env.list': ListEnvironmentVariablesTool,
};
```

### 5.2 工具Schema示例

```typescript
import { z } from 'zod';

// 執行請求工具的Schema
const ExecuteRequestSchema = z.object({
  endpointId: z.string().optional(),
  endpoint: z.object({
    method: z.enum(['GET', 'POST', 'PUT', 'DELETE', 'PATCH']),
    url: z.string().url(),
    headers: z.record(z.string()).optional(),
    queryParams: z.record(z.string()).optional(),
    body: z.any().optional(),
  }).optional(),
  variables: z.record(z.any()).optional(),
  validateResponse: z.boolean().optional(),
});
```

## 6. 數據模型

### 6.1 核心實體

```typescript
// 工作區
interface Workspace {
  id: string;
  name: string;
  projectPath: string;
  description?: string;
  createdAt: Date;
  updatedAt: Date;
  config: WorkspaceConfig;
}

// API端點
interface ApiEndpoint {
  id: string;
  workspaceId: string;
  name: string;
  description?: string;
  method: HttpMethod;
  url: string;
  headers?: Record<string, string>;
  queryParams?: Record<string, string>;
  body?: any;
  authentication?: AuthConfig;
  timeout?: number;
  retryConfig?: RetryConfig;
  tags?: string[];
  createdAt: Date;
  updatedAt: Date;
}

// 請求歷史
interface RequestHistory {
  id: string;
  workspaceId: string;
  endpointId: string;
  request: RequestData;
  response: ResponseData;
  duration: number;
  status: 'success' | 'failure';
  error?: string;
  timestamp: Date;
}

// 環境變量
interface Environment {
  id: string;
  workspaceId: string;
  name: string;
  variables: Record<string, any>;
  isActive: boolean;
}
```

## 7. 安全性設計

### 7.1 安全要求

| 安全項目 | 實現方式 | 優先級 |
|---------|----------|--------|
| 工作區隔離 | 嚴格的訪問控制 | P0 |
| 敏感信息保護 | 加密存儲、環境變量 | P0 |
| 請求限流 | Token bucket算法 | P1 |
| 審計日誌 | 記錄所有操作 | P1 |
| 輸入驗證 | Zod schema驗證 | P0 |
| 超時控制 | 請求超時設置 | P0 |

### 7.2 認證支持

- Basic Authentication
- Bearer Token
- API Key
- OAuth 2.0（Phase 2）
- 自定義認證（插件機制）

## 8. 性能指標

### 8.1 性能目標

| 指標 | 目標值 | 測量方法 |
|------|--------|----------|
| 請求執行延遲 | <100ms額外開銷 | 性能測試 |
| 並發請求數 | 支持100個並發 | 壓力測試 |
| 端點數量 | 單工作區1000+ | 容量測試 |
| 響應時間 | P99 <500ms | 監控指標 |
| 內存使用 | <200MB | 資源監控 |

## 9. 開發計劃

### 9.1 里程碑

**Milestone 1 - MVP (2週)**
- [x] 項目初始化和基礎架構
- [ ] 工作區管理實現
- [ ] 基礎端點CRUD
- [ ] 簡單請求執行
- [ ] MCP工具註冊

**Milestone 2 - 核心功能 (2週)**
- [ ] 完整的HTTP方法支持
- [ ] 認證機制實現
- [ ] 環境變量管理
- [ ] 錯誤處理優化

**Milestone 3 - 增強功能 (2週)**
- [ ] OpenAPI導入
- [ ] 請求歷史
- [ ] 批量執行
- [ ] 響應驗證

**Milestone 4 - 完善與優化 (1週)**
- [ ] 性能優化
- [ ] 完整測試覆蓋
- [ ] 文檔完善
- [ ] 發布準備

### 9.2 技術債務管理

- 定期代碼審查
- 持續重構
- 性能監控
- 安全審計

## 10. 測試策略

### 10.1 測試類型

| 測試類型 | 覆蓋率目標 | 工具 |
|---------|------------|------|
| 單元測試 | >80% | Jest/Vitest |
| 集成測試 | >70% | Jest + Supertest |
| E2E測試 | 核心流程 | Playwright |
| 性能測試 | 關鍵路徑 | k6/Artillery |

### 10.2 測試場景

- 工作區創建和切換
- 端點CRUD操作
- 各種HTTP方法執行
- 認證流程
- 錯誤處理
- 並發請求
- 大數據負載

## 11. 文檔需求

### 11.1 文檔類型

- **用戶指南**：安裝、配置、使用說明
- **API文檔**：MCP工具詳細說明
- **開發文檔**：架構、貢獻指南
- **範例集**：常見使用場景

### 11.2 文檔工具

- TypeDoc：自動生成API文檔
- Markdown：用戶指南和教程
- Mermaid：架構圖和流程圖

## 12. 發布與維護

### 12.1 版本策略

- 遵循語義化版本控制（Semantic Versioning）
- 維護CHANGELOG
- 提供遷移指南

### 12.2 發布渠道

- npm包發布
- GitHub releases
- Docker鏡像（可選）

### 12.3 支持計劃

- GitHub Issues：問題追蹤
- Discord/Slack：社區支持
- 定期更新和安全補丁

## 13. 成功指標

### 13.1 技術指標

- 代碼覆蓋率 >80%
- 零安全漏洞
- 性能達標率 >95%
- 可用性 >99.9%

### 13.2 用戶指標

- 安裝成功率 >95%
- 用戶滿意度 >4.0/5.0
- 活躍用戶增長率
- 社區貢獻數量

## 14. 風險評估

### 14.1 技術風險

| 風險項 | 可能性 | 影響 | 緩解措施 |
|--------|--------|------|----------|
| MCP協議變更 | 低 | 高 | 版本兼容層 |
| 性能瓶頸 | 中 | 中 | 早期性能測試 |
| 安全漏洞 | 低 | 高 | 安全審計 |
| 依賴更新 | 中 | 低 | 依賴管理策略 |

### 14.2 業務風險

- 用戶採用率低：強化文檔和範例
- 競爭產品：差異化功能
- 維護成本高：自動化測試和CI/CD

## 15. 結論

APIForge MCP Server定位為AI Agent專用的API測試工具，通過MCP協議提供安全、高效的API管理和測試能力。產品採用分階段開發策略，優先實現核心功能，逐步增加高級特性。

### 關鍵成功因素

1. **專注核心價值**：為AI Agent提供最佳的API測試體驗
2. **安全第一**：嚴格的工作區隔離和權限控制
3. **開發友好**：簡單的配置和豐富的功能
4. **可擴展性**：模塊化設計支持未來擴展

### 下一步行動

1. 確認技術選型和架構設計
2. 搭建開發環境
3. 實現MVP功能
4. 收集早期用戶反饋
5. 迭代優化

---

*文檔版本：1.0.0*
*最後更新：2025*
*作者：APIForge Team*