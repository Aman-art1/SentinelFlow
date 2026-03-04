# Design Document — Sentinel Flow (v0.1.0)

## 1. Vision and Goals

Sentinel Flow transforms a static codebase into a **living, queryable graph** that developers and architects can explore interactively. The design is governed by three invariants:

1. **Zero UI-thread blocking** — every CPU-intensive operation runs inside the background Worker Thread.
2. **Advisor-only** — the extension reads code and provides insight; it never writes, modifies, or deletes source files.
3. **No native modules** — all heavy binary dependencies (SQLite, Tree-sitter parsers) are distributed as WebAssembly, ensuring the `.vsix` works on Linux, macOS, and Windows without recompilation.

---

## 2. System Architecture

```
┌────────────────────────────────────────────────────────────────────────────┐
│                        VS Code Process Space                               │
│                                                                            │
│  ┌──────────────────────────────┐     ┌───────────────────────────────┐   │
│  │       Extension Host         │     │       Webview (Chromium)       │   │
│  │  (Node.js main thread)       │     │   React 18 SPA                │   │
│  │                              │ IPC │                               │   │
│  │  extension.ts                │◄───►│  App.tsx                      │   │
│  │  sidebar-provider.ts         │     │  GraphCanvas.tsx              │   │
│  │  webview-provider.ts         │     │  InspectorPanel               │   │
│  │  codelens-provider.ts        │     │  ViewModeBar.tsx              │   │
│  │  file-watcher.ts             │     │  stores/ (Zustand)            │   │
│  │  WorkerManager               │     │  utils/ (ELK, BFS, metrics)   │   │
│  │        │                     │     └───────────────────────────────┘   │
│  │        │ worker_threads IPC  │                                          │
│  │        ▼                     │                                          │
│  │  ┌────────────────────────┐  │                                          │
│  │  │    Worker Thread       │  │                                          │
│  │  │                        │  │                                          │
│  │  │  IndexWorker           │  │                                          │
│  │  │  ├── TreeSitterParser  │  │                                          │
│  │  │  │     (WASM)          │  │                                          │
│  │  │  ├── SymbolExtractor   │  │                                          │
│  │  │  ├── StringRegistry    │  │                                          │
│  │  │  ├── CompositeIndex    │  │                                          │
│  │  │  ├── CodeIndexDatabase │  │                                          │
│  │  │  │     (sql.js WASM)   │  │                                          │
│  │  │  ├── AIOrchestrator    │  │                                          │
│  │  │  ├── InspectorService  │  │                                          │
│  │  │  └── ImpactAnalyzer    │  │                                          │
│  │  └────────────────────────┘  │                                          │
│  └──────────────────────────────┘                                          │
└────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Layered Architecture

```
┌──────────────────────────────────────────────────────────────┐
│  PRESENTATION LAYER                                          │
│  Webview SPA (React + @xyflow/react + Tailwind)              │
│  GraphCanvas • Inspector Panel • ViewModeBar • SunburstGraph │
├──────────────────────────────────────────────────────────────┤
│  INTEGRATION LAYER                                            │
│  Extension Host (TypeScript + VS Code API)                   │
│  Commands • CodeLens • File Watcher • Webview Bridge         │
├──────────────────────────────────────────────────────────────┤
│  INTELLIGENCE LAYER (Worker Thread)                          │
│  AI Orchestrator • Inspector Service • Impact Analyzer       │
│  Domain Classifier • Debt Detector                           │
├──────────────────────────────────────────────────────────────┤
│  PARSING LAYER (Worker Thread)                               │
│  Tree-sitter WASM • Symbol Extractor • StringRegistry        │
│  CompositeIndex • PendingCall/Import pipeline                │
├──────────────────────────────────────────────────────────────┤
│  PERSISTENCE LAYER (Worker Thread)                           │
│  sql.js WASM SQLite • CodeIndexDatabase • Drizzle ORM Schema │
└──────────────────────────────────────────────────────────────┘
```

---

## 4. Component Directory Map

```
sentinel-flow/
├── src/                         # Extension Host + Worker Thread (TypeScript)
│   ├── extension.ts             # Activation, command registration, orchestration
│   ├── webview-provider.ts      # GraphWebviewProvider (full panel webview)
│   ├── sidebar-provider.ts      # SidebarProvider (activity bar sidebar)
│   ├── codelens-provider.ts     # HeatCodeLensProvider + TraceCodeLensProvider
│   ├── file-watcher.ts          # FileWatcherManager — 1 s debounced batch watcher
│   ├── ai/
│   │   ├── orchestrator.ts      # AIOrchestrator — intent routing + prompt building
│   │   ├── intent-router.ts     # IntentRouter — reflex vs. strategic classification
│   │   ├── groq-client.ts       # Groq/Llama 3.1 API client
│   │   ├── gemini-client.ts     # Google Gemini 1.5 Pro API client
│   │   ├── vertex-client.ts     # Vertex AI client
│   │   ├── bedrock-client.ts    # Amazon Bedrock client (Nova 2)
│   │   ├── debt-detector.ts     # Technical debt smell detector
│   │   └── index.ts             # Re-exports
│   ├── db/
│   │   ├── database.ts          # CodeIndexDatabase (sql.js wrapper)
│   │   └── schema.ts            # Drizzle ORM table definitions
│   ├── domain/
│   │   ├── classifier.ts        # DomainClassifier — heuristic + AI classification
│   │   ├── health.ts            # computeDomainHealth() metric function
│   │   └── index.ts
│   └── worker/
│       ├── worker.ts            # IndexWorker — message handler + core operations
│       ├── worker-manager.ts    # WorkerManager — host-side lifecycle + RPC proxy
│       ├── parser.ts            # TreeSitterParser — WASM grammar bootstrap
│       ├── symbol-extractor.ts  # SymbolExtractor — AST → symbols + pending edges
│       ├── composite-index.ts   # CompositeIndex + edge resolution functions
│       ├── string-registry.ts   # StringRegistry — integer-interned string store
│       ├── inspector-service.ts # InspectorService — Inspector Panel backend logic
│       ├── impact-analyzer.ts   # ImpactAnalyzer — blast radius BFS/DFS
│       └── message-protocol.ts  # Typed union types for all IPC messages
├── webview/src/
│   ├── App.tsx                  # Root component + VS Code message bridge
│   ├── components/
│   │   ├── GraphCanvas.tsx      # Main ReactFlow canvas (60,329 bytes)
│   │   ├── DomainNode.tsx       # Domain node renderer
│   │   ├── FileNode.tsx         # File node renderer
│   │   ├── SymbolNode.tsx       # Symbol node renderer
│   │   ├── ViewModeBar.tsx      # Architecture/Codebase/Trace mode switcher
│   │   ├── ImpactSidePanel.tsx  # Blast radius panel
│   │   ├── SunburstGraph.tsx    # Sunburst chart (D3)
│   │   └── inspector/           # Inspector Panel components (10 files)
│   ├── stores/
│   │   ├── useGraphStore.ts     # Zustand graph state (data, mode, skeleton, trace)
│   │   └── useInspectorStore.ts # Zustand inspector state (selection, tabs, cache)
│   ├── utils/
│   │   ├── elk-layout.ts        # ELK hierarchical/layered layout
│   │   ├── bfs-layout.ts        # BFS layout for Trace view
│   │   ├── layout.ts            # Dagre layout
│   │   ├── hierarchy.ts         # Graph hierarchy builder
│   │   ├── graphFilter.ts       # Node/edge filtering (LOD, search, directory)
│   │   ├── metrics.ts           # Client-side metric calculations
│   │   ├── performance.ts       # PerformanceMonitor (RAF-based FPS)
│   │   ├── performance-monitor.ts
│   │   └── relationshipDetector.ts
│   ├── types/
│   │   ├── inspector.ts         # NodeType, inspection data interfaces
│   │   └── (index)
│   ├── panel/
│   │   └── dataProvider.ts      # Inspector data fetching + caching layer
│   └── types.ts                 # GraphData, VSCodeAPI, messages interfaces
└── resources/
    └── icon.svg
```

---

## 5. Data Flow — Full Indexing Pipeline

```
Extension Host (main thread)
        │
        │  1. vscode.workspace.findFiles('**/*.{ts,tsx,py,c,h}', excludes)
        │
        │  2. For each 100-file chunk:
        │     a. Read file → SHA-256 hash only
        │     b. POST  check-file-hash-batch  →  Worker
        │     c. Receive list of changed paths
        │     d. Read content ONLY for changed files
        │     e. POST  parse-batch  →  Worker
        │
        ▼
Worker Thread
        │
        │  handleParseBatch():
        │  ┌──────────────────────────────────────────────────────┐
        │  │  For each file (up to BATCH_SIZE=500 per flush):     │
        │  │    a. db.deleteSymbolsByFile(filePath)               │
        │  │    b. tree = parser.parse(content, language)          │
        │  │    c. result = extractor.extract(tree, ...)           │
        │  │       → result.symbols[] (NewSymbol records)          │
        │  │       → result.pendingCalls[]  (provisional IDs)      │
        │  │       → result.pendingImports[]                       │
        │  │    d. Rebase provisional caller IDs to global offset  │
        │  │    e. Push to symbolBuffer                            │
        │  │    f. Every 500 symbols: flushSymbolBuffer()          │
        │  │       → db.insertSymbols()  → get real DB IDs         │
        │  │       → register in CompositeIndex                    │
        │  │       → update globalSymbolMap + globalPathIndex      │
        │  │    g. Every 50 files: db.saveToDisk()                 │
        │  └──────────────────────────────────────────────────────┘
        │
        │  After all files:
        │    a. Resolve provisional callerDbIds → real IDs
        │       (provisionalToDbId map, all globally indexed)
        │    b. Resolve relative imports → absolute pathIds
        │       (StringRegistry snapshot + suffix scan)
        │    c. resolvePendingCalls()   → call edge records
        │    d. resolvePendingImports() → import edge records
        │    e. db.insertEdgeBatch(callEdges, 'call')
        │    f. db.insertEdgeBatch(importEdges, 'import')
        │    g. db.postIndexOptimization() → ANALYZE + VACUUM
        │    h. db.saveToDisk()
        │    i. Send  parse-batch-complete  →  Host
        │
        ▼
Extension Host
        │
        │  graphWebviewProvider.postMessage({ type: 'cache-invalidate' })
        │
        ▼
Webview
        │  Clears Inspector cache, deselects current node
```

---

## 6. IPC Message Protocol

The Extension Host and Worker Thread communicate exclusively via Node's `worker_threads` structured-clone messaging. All messages are typed as discriminated unions in `src/worker/message-protocol.ts`.

### 6.1 Request Types (Host → Worker)

| Message Type | Payload | Response Type |
|---|---|---|
| `initialize` | `storagePath: string` | `initialize-complete` |
| `parse` | `filePath, content, language` | `parse-complete` |
| `parse-batch` | `files[]` | `parse-batch-complete` |
| `check-file-hash` | `filePath, content` | `file-hash-result` |
| `check-file-hash-batch` | `files[]{filePath, contentHash}` | `file-hash-batch-result` |
| `delete-file-symbols` | `filePath` | `delete-file-symbols-complete` |
| `query-symbols` | `query: string` | `query-result` |
| `query-file` | `filePath` | `query-result` |
| `export-graph` | — | `graph-export` |
| `clear` | — | `clear-complete` |
| `stats` | — | `stats-result` |
| `configure-ai` | `AIConfig` | `configure-ai-complete` |
| `ai-query` | `query, symbolId?, analysisType?` | `ai-response` |
| `ai-classify-intent` | `query` | `ai-intent-result` |
| `get-context` | `symbolId` | `context-result` |
| `inspector-overview` | `nodeId, nodeType, requestId` | `inspector-overview-result` |
| `inspector-dependencies` | `nodeId, nodeType, requestId` | `inspector-dependencies-result` |
| `inspector-risks` | `nodeId, nodeType, requestId` | `inspector-risks-result` |
| `inspector-batch` | `nodeId, nodeType, requestId` | `inspector-batch-result` |
| `inspector-ai-action` | `nodeId, action, requestId` | `inspector-ai-result` |
| `inspector-ai-why` | `nodeId, metric, requestId` | `inspector-ai-why-result` |
| `inspector-invalidate-cache` | — | `clear-complete` |
| `refine-graph` | — | `refine-graph-complete` |
| `analyze-impact` | `nodeId` | `analyze-impact-result` |
| `refine-incremental` | `changedFiles[]` | — |
| `get-architecture-skeleton` | `refine: boolean` | `architecture-skeleton` |
| `trace-function` | `symbolId?, nodeId?` | `function-trace` |
| `shutdown` | — | — |

### 6.2 Timeout Policy

| Operation Class | Timeout |
|---|---|
| AI action (`inspector-ai-action`, `inspector-ai-why`) | 200,000 ms |
| Architecture refine with AI | 120,000 ms |
| Bulk parse batch (`parse-batch`) | 600,000 ms |
| All other requests | 30,000 ms |

### 6.3 Pre-Ready Queue

Requests arriving before the worker sends `initialize-complete` are placed in `preReadyQueue`. When the handshake completes, `drainPreReadyQueue()` dispatches them with their remaining timeout (elapsed time is subtracted). Requests that have already timed out are rejected immediately.

---

## 7. Symbol Extraction Pipeline — CompositeIndex and StringRegistry

### 7.1 StringRegistry

```typescript
class StringRegistry {
    private strings: string[] = [];
    private map: Map<string, number> = new Map();

    intern(s: string): number { /* deduplicate → return integer ID */ }
    resolve(id: number): string | undefined { ... }
    exportSnapshot(): string[] { ... }
}
```

All symbol names and file paths are interned once per batch run. This reduces heap allocations by 30–60% for large workspaces where the same paths appear thousands of times.

### 7.2 CompositeIndex

```
CompositeIndex:
  nameIndex:  Map<nameId,   Set<IndexEntry>>
  pathIndex:  Map<pathId,   Set<IndexEntry>>
  lineIndex:  Map<number,   Set<IndexEntry>>

IndexEntry: { dbId, nameId, pathId, typeId, line }
```

`resolvePendingCalls()` maps each `PendingCall.calleeName` → `nameIndex` lookup → O(1) set of candidates. If there is only one candidate, the edge is added directly. If multiple candidates match by name, path affinity is used as a tiebreaker.

`resolvePendingImports()` maps each `PendingImport.sourcePathId` → `pathIndex` lookup → select the entry whose path matches the import module string.

### 7.3 Provisional Caller ID Scheme

During batch parsing, the `SymbolExtractor` cannot know the real DB IDs of the symbols it is currently extracting (they haven't been inserted yet). It emits `callerDbId = -(localIdx + 1)` where `localIdx` is the symbol's 0-based position in that file's symbol array.

When accumulated into the batch, the `fileOffset` (= total symbols already buffered globally) is added:

```
globalProvisionalId = -(fileOffset + localIdx + 1)
```

After `insertSymbols()` returns real IDs, `provisionalToDbId` maps each global provisional key to the real DB row ID, allowing all pending calls to be resolved in a single pass.

---

## 8. Database Schema

```sql
-- Core symbol store
CREATE TABLE symbols (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  name                TEXT    NOT NULL,
  type                TEXT    NOT NULL,   -- function|class|variable|interface|...
  file_path           TEXT    NOT NULL,
  range_start_line    INTEGER NOT NULL,
  range_start_column  INTEGER NOT NULL,
  range_end_line      INTEGER NOT NULL,
  range_end_column    INTEGER NOT NULL,
  complexity          INTEGER NOT NULL DEFAULT 0,
  domain              TEXT,               -- AI/heuristic domain label
  purpose             TEXT,               -- AI-inferred purpose
  impact_depth        INTEGER,            -- AI-inferred impact depth
  search_tags         TEXT,               -- JSON array of AI-inferred tags
  fragility           TEXT,               -- 'low'|'medium'|'high' (AI)
  risk_score          INTEGER,            -- 0–100 composite risk
  risk_reason         TEXT                -- AI explanation of risk
);

-- Edges between symbols
CREATE TABLE edges (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  source_id  INTEGER NOT NULL REFERENCES symbols(id) ON DELETE CASCADE,
  target_id  INTEGER NOT NULL REFERENCES symbols(id) ON DELETE CASCADE,
  type       TEXT    NOT NULL,            -- call|import|inherit|implement
  reason     TEXT                         -- optional AI-inferred reason
);

-- File tracking (incremental indexing)
CREATE TABLE files (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  file_path       TEXT    NOT NULL UNIQUE,
  content_hash    TEXT    NOT NULL,
  last_indexed_at TEXT    NOT NULL
);

-- Key-value metadata (last_index_time, workspace root, etc.)
CREATE TABLE meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- AI response cache
CREATE TABLE ai_cache (
  hash       TEXT PRIMARY KEY,            -- SHA-256 of (query+code+deps)
  response   TEXT NOT NULL,              -- JSON-serialised AIResponse
  created_at TEXT NOT NULL
);

-- Domain aggregate health
CREATE TABLE domain_metadata (
  domain        TEXT PRIMARY KEY,
  health_score  INTEGER NOT NULL,
  complexity    INTEGER NOT NULL,
  coupling      INTEGER NOT NULL,         -- 0–100 scale
  symbol_count  INTEGER NOT NULL,
  last_updated  TEXT    NOT NULL
);

-- Per-symbol AI domain classification cache
CREATE TABLE domain_cache (
  symbol_id   INTEGER PRIMARY KEY,
  domain      TEXT    NOT NULL,
  confidence  INTEGER NOT NULL,           -- 0–100
  cached_at   TEXT    NOT NULL
);

-- Technical debt items per symbol
CREATE TABLE technical_debt (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  symbol_id   INTEGER NOT NULL REFERENCES symbols(id) ON DELETE CASCADE,
  smell_type  TEXT    NOT NULL,           -- long_method|god_object|feature_envy|high_fan_out
  severity    TEXT    NOT NULL,           -- high|medium|low
  description TEXT    NOT NULL,
  detected_at TEXT    NOT NULL
);
```

---

## 9. AI Orchestration Architecture

### 9.1 Dual-Path Routing

```
User Action (Inspector Panel)
        │
        ▼
AIOrchestrator.processQuery(query, options)
        │
        ├── 1. IntentRouter.classify(query) → { type: 'reflex'|'strategic', confidence }
        │
        ├── 2. assembleContext(options) → SymbolContext | null
        │         └── db.getSymbolWithContext(symbolId)
        │             → { symbol, neighbors[], outgoingEdges[], incomingEdges[] }
        │
        ├── 3. buildNodeContext(context) → NodeContext
        │         ├── Read target symbol source from disk (1 file read only)
        │         └── Map edges → NodeDependencyStub[] (0 neighbor file reads)
        │
        ├── 4. buildPrompt(query, nodeContext) → string
        │         ├── Block 1: Target symbol source code
        │         ├── Block 2: Dependency graph JSON stubs
        │         ├── Block 3: Chain-of-Architectural-Thought instruction
        │         └── Block 4: The question / action
        │
        ├── 5. Check ai_cache (SHA-256 hash of query+code+deps+analysisType)
        │         └── Cache hit → return immediately (latency ≈ 0)
        │
        ├── 6a. REFLEX PATH (forceReflex=true OR intent='reflex')
        │         └── GroqClient.complete(prompt, systemPrompt)
        │             Target latency: <300 ms
        │
        └── 6b. STRATEGIC PATH (intent='strategic')
                 ├── aiProvider='bedrock'  → BedrockClient.analyzeCode()
                 ├── aiProvider='gemini'   → GeminiClient.analyzeCode()  (or VertexClient)
                 └── On any failure        → Fallback to Reflex path + ⚠️ header prepended
```

### 9.2 cAST Prompt Design

The **cAST** (Contextual AST) format was designed to prevent LLM "Lost in the Middle" syndrome:

- **Target code only** — the AI receives the raw source of exactly the selected symbol (lines `rangeStartLine` to `rangeEndLine`), read on-demand from disk.
- **Lightweight dependency stubs** — instead of dumping thousands of lines of neighbor source code, outgoing and incoming edges are serialized as JSON metadata stubs: `{ name, type, filePath, relationType }`.
- **Chain-of-Thought instruction** — the prompt explicitly asks the AI to identify architectural patterns before answering, anchoring its reasoning in the dependency graph.

### 9.3 AI Provider Matrix

| Provider | SDK | Path | Use Case |
|---|---|---|---|
| Groq / Llama 3.1-8B-Instant | `groq-sdk` | Reflex | Interactive Inspector actions, fast queries |
| Google Gemini 1.5 Pro | `@google/generative-ai` | Strategic | Deep architectural analysis |
| Vertex AI (Gemini 1.5 Pro) | `@google-cloud/vertexai` | Strategic | Enterprise GCP projects |
| Amazon Bedrock (Nova 2) | `@aws-sdk/client-bedrock-runtime` | Strategic | AWS-native environments |

When the strategic client is unavailable or fails, the system always falls back to Groq, ensuring the extension remains useful even with partial configuration.

---

## 10. Graph Visualization Architecture

### 10.1 View Modes and Data Sources

```
ViewModeBar (component)
    │
    ├── "architecture" ──► ArchitectureSkeleton (from worker)
    │                       └─► ELK hierarchical layout
    │                           DomainNode (folder) + FileNode
    │
    ├── "codebase" ──────► GraphData (from worker)
    │                       ├─► 3-tier LOD system
    │                       │    Depth 0: DomainNode only
    │                       │    Depth 1: DomainNode + FileNode
    │                       │    Depth 2: DomainNode + FileNode + SymbolNode
    │                       └─► ELK layered/radial layout
    │
    └── "trace" ──────────► FunctionTrace (BFS from selected symbol)
                             └─► BFS layout (bfs-layout.ts)
```

### 10.2 GraphCanvas — Rendering Pipeline

```
GraphStore (Zustand)
    displayedGraphData | architectureSkeleton | functionTrace
        │
        ▼
GraphCanvas.tsx
    │
    ├── buildNodes(graphData, viewMode, depth, collapsed, filterConfig)
    │     └── graphFilter.ts → LOD filter → collapsed filter → search filter
    │
    ├── buildEdges(nodes, graphData, collapsed)
    │     ├── re-route edges from collapsed children → parent node
    │     ├── deduplicate source→target pairs
    │     └── sample if total > 10,000
    │
    ├── layoutNodes(nodes, edges, viewMode)  → elk-layout.ts / bfs-layout.ts
    │
    └── <ReactFlow nodes={...} edges={...} />
          ├── nodeTypes: { domainNode, fileNode, symbolNode }
          └── edgeTypes: { default, animated }
```

### 10.3 Node ID Format Convention

| Node Type | ID Format | Example |
|---|---|---|
| Domain (codebase) | `domain:<domainName>` | `domain:auth` |
| Domain (architecture/folder) | path string | `src/auth` |
| File | `<domainName>:<absoluteFilePath>` or just `<absoluteFilePath>` | `auth:/home/.../auth.ts` |
| Symbol | `<absoluteFilePath>:<symbolName>:<startLine>` | `/home/.../auth.ts:login:42` |

### 10.4 Performance Optimisations

| Technique | Description |
|---|---|
| LOD system | Nodes below active depth are never instantiated; zero React VDOM cost |
| Edge rerouting | Collapsed subtrees get a single parent edge, not N child edges |
| Edge sampling | >10,000 edges → uniform random sample to maintain 60 FPS |
| FPS counter | Updated via direct DOM `ref.textContent` mutation — no React re-render |
| Inspector cache | WebView-side Zustand cache keyed on `nodeId`; only fetched once per selection |
| Pre-ready queue | Host-side queue prevents duplicate initialization |
| Content-hash dedup | SHA-256 prevents re-parsing unchanged files on every index run |

---

## 11. Inspector Panel Architecture

```
useInspectorStore (Zustand)
    selectedNode: { id, type }
    tabs: { overview, deps, risks, aiResults }
        │
        ▼
InspectorPanel
    │
    ├── useEffect → getDataProvider(vscode).fetchNodeData(nodeId, nodeType)
    │     │
    │     │  DataProvider (panel/dataProvider.ts)
    │     │    ├── Check Zustand cache (Map<nodeId, InspectorData>)
    │     │    └── Miss → postMessage inspector-batch → Worker
    │     │               ← inspector-batch-result
    │     │               → cache result → update store
    │     │
    │     ▼
    ├── OverviewTab
    │     Fields: name, path, fileCount, functionCount, symbolCount,
    │             complexity, fanIn, fanOut, healthPercent, coupling
    │
    ├── DependenciesTab
    │     Symbol: calls[], calledBy[]
    │     File:   imports[], usedBy[]
    │     Domain: file list
    │
    ├── RisksTab
    │     Sources:
    │       1. symbol.riskScore / symbol.riskReason (AI Architect Pass)
    │       2. complexity > 15 (static threshold)
    │       3. fanIn > 20 (coupling threshold)
    │       4. symbol.fragility === 'high' (AI flag)
    │       5. technicalDebt[] items from DB
    │     Output: level (low|medium|high), heatScore (0–100), warnings[]
    │
    └── AIActionsTab (symbol nodes only)
          Actions: explain | audit (security) | refactor | optimize
          Route:   forceReflex=true → Groq always
          Display: markdown-rendered response
          Patch:   if refactor contains ```diff, extract patch object
```

---

## 12. Domain Classification Design

### 12.1 Heuristic Rules (classifier.ts)

The `DomainClassifier` sets a domain based on path segment and file name pattern matching. Heuristic domains (in priority order):

| Domain | Trigger patterns |
|---|---|
| `auth` | `auth`, `login`, `session`, `token`, `jwt`, `oauth` |
| `api` | `api`, `route`, `controller`, `endpoint`, `handler` |
| `db` | `db`, `database`, `repository`, `migration`, `orm`, `schema` |
| `ui` | `ui`, `component`, `view`, `page`, `screen`, `widget`, `modal` |
| `service` | `service`, `provider`, `manager`, `use-case` |
| `worker` | `worker`, `job`, `queue`, `task`, `scheduler` |
| `config` | `config`, `settings`, `env`, `constants` |
| `test` | `test`, `spec`, `__tests__` |
| `util` | `util`, `helper`, `lib`, `common`, `shared` |
| `middleware` | `middleware`, `interceptor`, `guard`, `filter` |

### 12.2 Domain Health Formula

```
coupling        = crossDomainEdges / totalEdges
complexity_norm = avg(symbol.complexity) / 20.0  (capped at 1.0)
healthScore     = max(0, 100 - coupling*40 - complexity_norm*30 - debtPenalty)
```

---

## 13. File Watcher — Batch Pipeline

```
vscode.FileSystemWatcher('**/*.{ts,tsx,py,c,h}')
    │
    onDidChange / onDidCreate
        │
        └── enqueueFile(uri)
              ├── pendingFiles.add(uri.fsPath)
              └── debounce 1000 ms
                    │
                    ▼
              processPendingBatch()
                    │
                    ├── Pass 1: hash all pending files (no content in RAM)
                    │
                    ├── Pass 2: checkFileHashBatch() → changed paths only
                    │
                    ├── Pass 3: read content ONLY for changed paths
                    │
                    └── parseBatch() → re-index
                          └── sentinel-flow.invalidate-cache

    onDidDelete
        └── deleteFileSymbols(uri.fsPath)  (immediate, no batching)
```

---

## 14. CodeLens Design

### 14.1 HeatCodeLensProvider

For every indexed function and class in the active editor:

```
[Heat: {complexity}]  ← always shown
[⚠️ High Complexity ({complexity})]  ← complexity > 15
[🔴 High Coupling (fan-in:{fanIn})]  ← fanIn > 20
[🟡 High Fan-Out ({fanOut})]         ← fanOut > 15
```

### 14.2 TraceCodeLensProvider

```
[⚡ Trace]  ← shown above every function
           └── executes: architect.traceFunction(symbolId, nodeId)
               → Worker: trace-function request
               → BFS over call graph from this symbol
               → Webview: function-trace data + setViewMode('trace')
```

---

## 15. Build System

### 15.1 Extension Build

```bash
npm run build
  = npm run build:webview
    && esbuild src/extension.ts src/worker/worker.ts \
       --bundle --outdir=dist \
       --external:vscode --external:web-tree-sitter --external:sql.js \
       --format=cjs --platform=node --target=node20 --sourcemap
    && cp node_modules/sql.js/dist/sql-wasm.wasm dist/worker/sql-wasm.wasm
```

Key esbuild flags:
- `--external:web-tree-sitter` — prevents esbuild from trying to bundle the WASM loader (it self-loads via `URL()`)
- `--external:sql.js` — same reason; sql.js loads `sql-wasm.wasm` at runtime via `fs.readFile`
- Both `extension.ts` and `worker.ts` are bundled as separate entry points so they don't share module state

### 15.2 Webview Build

```bash
cd webview && npm run build  (Vite)
```

Output goes to `webview/dist/`, which is embedded in the webview panel HTML by `GraphWebviewProvider`.

### 15.3 VSIX Packaging

```bash
vscode-vsce package
```

The `.vsix` bundles all JS, WASM files, and static assets. Native modules are explicitly absent — the only binary payloads are the `sql-wasm.wasm` and `tree-sitter-*.wasm` grammar files.

---

## 16. Security Considerations

| Area | Approach |
|---|---|
| API key storage | VS Code `configuration` API — never written to source files or logs |
| AI prompt data | Only target symbol source code + SQLite-derived stubs — no bulk file dumps |
| File write access | Extension never writes to source files (advisor-only) |
| DB storage | `<workspaceStorageUri>/index.db` — user-space, not encrypted |
| Worker isolation | Worker thread operates with no access to VS Code UI API (no `vscode` import) |
| WASM sandboxing | sql.js and Tree-sitter run inside a Node.js WASM sandbox |

---

## 17. Extension Settings Reference

| Setting Key | Type | Default | Description |
|---|---|---|---|
| `sentinelFlow.groqApiKey` | string | — | Groq API key (Llama 3.1 reflex path) |
| `sentinelFlow.geminiApiKey` | string | — | Google Gemini API key (strategic path) |
| `sentinelFlow.vertexProject` | string | — | GCP Project ID for Vertex AI |
| `sentinelFlow.aiProvider` | enum | `gemini` | Strategic path provider: `gemini` or `bedrock` |
| `sentinelFlow.awsRegion` | string | `us-east-1` | AWS region for Amazon Bedrock |
| `sentinelFlow.bedrockModelId` | string | `us.amazon.nova-2-lite-v1:0` | Bedrock model ID |
| `sentinelFlow.awsAccessKeyId` | string | — | AWS IAM Access Key ID |
| `sentinelFlow.awsSecretAccessKey` | string | — | AWS IAM Secret Access Key |
| `sentinelFlow.useLSP` | boolean | `false` | Enable VS Code LSP type resolution for TS/JS |

---

## 18. Known Limitations and Open Items

| Item | Status | Notes |
|---|---|---|
| Java, Go, Rust support | Not implemented | Requires additional Tree-sitter grammar WASMs |
| LSP type resolution | Optional flag (`useLSP`) | Not fully integrated in current build |
| `.sflow` custom editor | Designed in requirements, not implemented | Serialised graph view saves |
| AI retry with exponential backoff | Not implemented | Currently single-attempt with fallback |
| Encrypted SQLite DB | Not implemented | DB stored unencrypted in OS temp store |
| Refactoring auto-apply | Not implemented | Diff shown but not applied to source |
| Streaming AI responses | Not implemented | Full response returned as single string |
