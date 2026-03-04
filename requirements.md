# Requirements Document — Sentinel Flow (v0.1.0)

## 1. Overview

**Sentinel Flow** is a production VS Code extension (`innovators-of-ai.sentinel-flow-extension`) that provides **codebase intelligence and visualization** for TypeScript/Python/C projects. It follows a strict **advisor-only, zero-noise philosophy**: the extension never modifies source code automatically, never displays unsolicited warnings, and never blocks the VS Code UI thread.

The system is architected around three runtime boundaries:

| Boundary | Process | Responsibility |
|---|---|---|
| **Extension Host** | VS Code main thread | Command dispatch, UI events, CodeLens, file watching |
| **Worker Thread** | Node.js `worker_threads` | Parsing, DB writes, AI orchestration, metric computation |
| **Webview SPA** | Chrome renderer | Interactive graph, Inspector Panel, ViewMode bar |

---

## 2. Glossary

| Term | Definition |
|---|---|
| `Extension_Host` | VS Code main extension process; never performs CPU-heavy operations |
| `Worker_Thread` | Isolated Node.js worker spawned on activation; hosts all indexing and AI logic |
| `WorkerManager` | Host-side proxy managing worker lifecycle, request queuing, and IPC timeouts |
| `IndexWorker` | Worker-side class that owns the DB, parser, extractor, AI orchestrator, and Inspector |
| `CodeIndexDatabase` | sql.js WASM SQLite wrapper; holds symbols, edges, file hashes, AI cache, debt, domains |
| `TreeSitterParser` | web-tree-sitter WASM parser bootstrapped with grammar WASMs per language |
| `SymbolExtractor` | AST visitor that extracts symbols and defers edge resolution via `PendingCall`/`PendingImport` |
| `StringRegistry` | Integer-interned string store; eliminates duplicate allocations in batch parse runs |
| `CompositeIndex` | O(1) inverted index keyed on (nameId × pathId × line); used for call/import edge resolution |
| `AIOrchestrator` | Dual-path AI router: Groq reflex path (<300 ms) and Gemini/Bedrock strategic path |
| `InspectorService` | Business logic layer for the Inspector Panel: overview, deps, risks, and AI actions |
| `ImpactAnalyzer` | BFS/DFS engine computing blast radius and transitive callers for a symbol |
| `FileWatcherManager` | VS Code file-system watcher with 1-second debounce batch for incremental re-indexing |
| `GraphWebviewProvider` | Full-panel webview hosting the React graph SPA |
| `SidebarProvider` | Activity-bar sidebar webview; exposes AI provider controls and status |
| `Symbol` | Extracted code entity: function, class, variable, interface, type, arrow-function, method |
| `Edge` | Directed relationship between symbols: `call`, `import`, `inherit`, `implement` |
| `Domain` | AI-or-heuristic-classified functional grouping of files (e.g. `auth`, `api`, `ui`) |
| `ArchitectureSkeleton` | File-level dependency graph used for the Architecture view |
| `FunctionTrace` | BFS call-path from a selected symbol used for the Trace view |
| `ViewMode` | Active visualization mode: `architecture`, `codebase`, or `trace` |
| `Inspector Panel` | Side panel showing Overview, Dependencies, Risks, and AI Actions for a selected node |
| `Complexity` | Cyclomatic complexity score extracted by the AST visitor on every function/method |
| `risk_score` | 0–100 score combining complexity, coupling (fan-in), fragility, and AI assessment |
| `Technical_Debt` | Persisted code-smell items: `long_method`, `god_object`, `feature_envy`, `high_fan_out` |
| `Blast_Radius` | Transitive set of symbols impacted by a change to a given node |
| `cAST` | Contextual AST — the AI prompt payload: target symbol source code + dependency stubs |
| `Reflex_Path` | Fast AI route via Groq/Llama 3.1 (<300 ms) for on-demand Inspector actions |
| `Strategic_Path` | Deep AI route via Google Gemini 1.5 Pro or Amazon Bedrock (up to 180 s) |
| `LSP` | Language Server Protocol; optional VS Code-based type resolution for TS/JS |
| `WASM` | WebAssembly — used by both Tree-sitter parsers and sql.js; enables cross-platform runs |

---

## 3. Functional Requirements

### FR-01 — Extension Activation and Initialization

**User Story:** As a developer, when I open a workspace I want the extension to boot silently and prepare its indexing engine without any prompts.

#### Acceptance Criteria

1. On `onStartupFinished`, the Extension_Host SHALL spawn the Worker_Thread and wait for the `initialize-complete` handshake with **no arbitrary timeout** — WASM hydration can take >5 seconds on cold start.
2. The Worker_Thread SHALL initialize in this order: start memory monitor → open SQLite DB → bootstrap TreeSitterParser WASM → construct AIOrchestrator → send `ready` signal.
3. If the Worker_Thread crashes during initialization, WorkerManager SHALL reject the ready-promise and the Extension_Host SHALL show a single error message with no automatic retry loop.
4. On first activation in a workspace (`!hasIndexedWorkspace`), the Extension_Host SHALL trigger auto-indexing after a 5-second delay to allow VS Code to finish its own startup.
5. On subsequent activations, auto-indexing SHALL NOT re-run unless workspace folders changed.
6. All workspace state flags SHALL be persisted via `context.workspaceState`, not global state.

---

### FR-02 — File Discovery and Language Detection

**User Story:** As a developer, I want the indexer to automatically discover all supported source files while excluding build artifacts.

#### Acceptance Criteria

1. The Extension_Host SHALL discover files matching `**/*.{ts,tsx,py,c,h}` using VS Code's `findFiles` API.
2. The following directories SHALL always be excluded from discovery: `node_modules`, `venv`, `.venv`, `.git`, `dist`, `build`, `out`, `.cache`, `.vscode`, `__pycache__`, `.pytest_cache`.
3. The Extension_Host SHALL map file extensions to languages: `.ts/.tsx → typescript`, `.py → python`, `.c/.h → c`.
4. Files with extensions not in the supported set SHALL be silently ignored.
5. File discovery SHALL complete before any parsing begins; total file count SHALL be reported to the progress notification.

---

### FR-03 — Incremental Indexing with Content-Hash Deduplication

**User Story:** As a developer, I want re-indexing to only process files that actually changed so that large workspaces index quickly.

#### Acceptance Criteria

1. For every file to be indexed, the Extension_Host SHALL compute a SHA-256 hash of the raw file content **before** sending content to the worker.
2. The Extension_Host SHALL call `check-file-hash-batch` with all hashes in a batch; the Worker_Thread SHALL compare against stored hashes in SQLite and return only paths that changed.
3. The Extension_Host SHALL only read file content to memory for files identified as changed (Pass 3). Unchanged files SHALL never be loaded into RAM.
4. Files SHALL be processed in batches of 100 to maintain UI responsiveness during large workspace indexing.
5. Every 50 files during a bulk batch, the Worker_Thread SHALL flush the SQLite in-memory DB to disk to prevent data loss.
6. On completion, the Extension_Host SHALL post a `cache-invalidate` message to the Webview so the Inspector Panel cache is cleared.
7. The progress notification SHALL display `Processing N/M files...` with incremental percentage.

---

### FR-04 — AST Parsing and Symbol Extraction

**User Story:** As a developer, I want the extension to extract a complete symbol graph from my source files including all functions, classes, and their relationships.

#### Acceptance Criteria

1. The Worker_Thread SHALL parse files via `TreeSitterParser` using language-specific WASM grammars bundled with the extension.
2. `SymbolExtractor` SHALL extract the following node types per language:

   | Language | Extracted Types |
   |---|---|
   | TypeScript/TSX | `function`, `class`, `variable`, `interface`, `type`, `arrow_function`, `method` |
   | Python | `function`, `class`, `variable` |
   | C/H | `function`, `variable` |

3. For every symbol, the extractor SHALL capture: file path, start line, start column, end line, end column, and cyclomatic complexity.
4. Cyclomatic complexity SHALL be computed by counting control-flow branches (`if`, `else if`, `for`, `while`, `case`, `catch`, `&&`, `||`, `?`) plus a base of 1.
5. The extractor SHALL emit `PendingCall` and `PendingImport` records using provisional caller IDs (negative local-index-based) that are rebased to global IDs during the batch flush.
6. Import source paths SHALL be resolved from relative to absolute using `StringRegistry` snapshot + `globalPathIndex` (O(1) lookup via suffix match).
7. Call edges SHALL be resolved via `CompositeIndex` keyed on (nameId × pathId × line) providing O(1) resolution per call.
8. `StringRegistry` SHALL intern all symbol names and file paths as sequential integer IDs to eliminate duplicate heap allocations during batch runs.

---

### FR-05 — Persistent SQLite Database

**User Story:** As a developer, I want my indexed data persisted so I don't have to re-index every time I open VS Code.

#### Acceptance Criteria

1. The Worker_Thread SHALL create the SQLite database at `<workspaceStorageUri>/index.db` using `sql.js` (WebAssembly SQLite — no native modules).
2. The database SHALL contain the following tables:

   | Table | Purpose |
   |---|---|
   | `symbols` | All extracted symbols with type, location, complexity, domain, AI fields |
   | `edges` | Call, import, inherit, implement relationships between symbols |
   | `files` | File tracking: path, content hash, last indexed timestamp |
   | `meta` | Key-value store for workspace metadata and last index time |
   | `ai_cache` | SHA-256 keyed AI response cache to avoid redundant API calls |
   | `domain_metadata` | Per-domain health score, complexity, coupling, symbol count |
   | `domain_cache` | Per-symbol AI domain classification with confidence score |
   | `technical_debt` | Detected code smells per symbol: type, severity, description |

3. The `symbols` table SHALL include AI-enrichment columns: `domain`, `purpose`, `impact_depth`, `search_tags`, `fragility`, `risk_score`, `risk_reason`.
4. The `edges` table SHALL cascade-delete children when a symbol is deleted (`ON DELETE CASCADE`).
5. The Worker_Thread SHALL call `ANALYZE` and `VACUUM` after every bulk indexing operation.
6. The Worker_Thread SHALL flush the in-memory sql.js DB to disk on every `saveToDisk()` call.
7. The Extension_Host SHALL provide a `Clear Index` command that wipes all tables and resets in-memory maps.

---

### FR-06 — Memory Management and Worker Auto-Restart

**User Story:** As a developer working with large monorepos, I need the extension to manage memory safely without crashing VS Code.

#### Acceptance Criteria

1. The Worker_Thread SHALL monitor heap usage every 5 seconds.
2. WHEN heap exceeds 1000 MB, the Worker_Thread SHALL send an `error` message to the host and exit with code 137 (OOM).
3. The WorkerManager SHALL detect non-zero exit codes and automatically spawn a replacement worker.
4. WHEN the worker restarts, the WorkerManager SHALL create a fresh ready-promise, re-send `initialize`, and re-apply the AI configuration via `updateWorkerConfig`.
5. The Extension_Host SHALL notify the user with a warning message: "Sentinel Flow Indexer restarted due to high memory usage."
6. Requests that arrived before the new worker is ready SHALL be queued in `preReadyQueue` and drained once `initialize-complete` is received.
7. The `parse-batch` timeout SHALL be 600,000 ms (10 minutes) to support large initial indexing runs.
8. AI action timeouts: `inspector-ai-action` and `inspector-ai-why` SHALL use a 200,000 ms timeout; all other requests use 30,000 ms.

---

### FR-07 — Incremental File Watcher

**User Story:** As a developer, I want the extension to automatically re-index files when I save them so my graph stays up-to-date without manual intervention.

#### Acceptance Criteria

1. `FileWatcherManager` SHALL use VS Code's `createFileSystemWatcher` to monitor `**/*.{ts,tsx,py,c,h}`.
2. File change and create events SHALL be debounced with a 1-second batch window before processing.
3. The file watcher SHALL use the same 3-pass hash-dedup pipeline as the full indexer (hash → check-batch → read-only-changed → parse-batch).
4. File delete events SHALL immediately trigger `delete-file-symbols` to remove stale data.
5. The file watcher SHALL exclude: `node_modules`, `.git`, `venv`, `.venv`, `dist`, `build`, `out`, `.vscode`, `__pycache__`, `.cache`, `.pytest_cache`, `.next`, `.svelte-kit`.
6. After successful re-indexing, the watcher SHALL execute `sentinel-flow.invalidate-cache` to refresh the Webview's Inspector cache.
7. The user MAY toggle the file watcher on/off via the `Toggle File Watcher` command.

---

### FR-08 — Graph Visualization — Three View Modes

**User Story:** As a developer, I want to visualize my codebase at different levels of abstraction using an interactive graph panel.

#### Acceptance Criteria

1. The Webview SHALL support three visualization modes selectable via the `ViewModeBar`:

   | Mode | Data Source | Layout Engine | Use Case |
   |---|---|---|---|
   | `architecture` | `ArchitectureSkeleton` (file/folder nodes) | ELK hierarchical | High-level file-to-file dependencies |
   | `codebase` | `GraphData` (domains → files → symbols) | ELK layered/radial | Domain-clustered symbol graph |
   | `trace` | `FunctionTrace` (BFS call paths) | BFS layout | Call-path tracing from a selected symbol |

2. In **architecture** mode, the Webview SHALL display folder nodes and file nodes with directional import edges.
3. In **codebase** mode, the Webview SHALL group symbols by domain and support a 3-tier LOD system:
   - Depth 0: Domain nodes only
   - Depth 1: Domain + File nodes (default)
   - Depth 2: Domain + File + Symbol nodes
4. In **trace** mode, the Webview SHALL render a BFS call path starting from the selected symbol, showing directional call relationships.
5. Each view mode MAY have individually collapsed domain/file nodes, independent of the global LOD depth setting.
6. Nodes below the active LOD depth SHALL never be instantiated in the React tree (zero memory, zero layout cost).

---

### FR-09 — Interactive Graph Canvas

**User Story:** As a developer, I want to interactively explore the code graph with panning, zooming, and node selection.

#### Acceptance Criteria

1. The GraphCanvas SHALL use `@xyflow/react` (ReactFlow) for rendering.
2. Users SHALL be able to zoom, pan, and drag nodes freely.
3. Clicking a node SHALL select it and open the Inspector Panel with that node's data.
4. Double-clicking a file or symbol node SHALL post a `navigate-to-file` message instructing the Extension_Host to open the file in the editor at the correct line.
5. A live FPS counter SHALL be displayed in the toolbar, updated via direct DOM mutation (`ref`) — never via React state — to avoid re-render overhead.
6. The Webview SHALL display a status bar showing: `N domains · M symbols · P edges` from the current graph data.
7. Graph search SHALL accept text input with a minimum of 3 characters; matching nodes SHALL be highlighted and non-matching nodes SHALL be dimmed.
8. The Webview SHALL display proper loading, timeout (8 s), empty-state, and error states.

---

### FR-10 — Edge Optimization

**User Story:** As a developer browsing large codebases, I need the graph to remain performant even with thousands of edges.

#### Acceptance Criteria

1. When an upstream node is collapsed, all edges pointing to its children SHALL be re-routed to the collapsed parent node.
2. Duplicate `source → target` pairs (after rerouting) SHALL be deduplicated to a single edge.
3. WHEN total visible edges exceed 10,000, the Webview SHALL uniformly sample them to keep ReactFlow performant.
4. The LOD system SHALL ensure edges to nodes below the active depth are excluded from the rendered edge set.

---

### FR-11 — Inspector Panel

**User Story:** As a developer, I want to select any node in the graph and immediately see its metrics, dependencies, and risk assessment in a side panel.

#### Acceptance Criteria

1. The Inspector Panel SHALL display three tabs: **Overview**, **Dependencies**, and **Risks + AI**.
2. The Inspector Panel SHALL support three node types: `domain`, `file`, and `symbol`.
3. **Overview tab** content per node type:

   | Node Type | Fields |
   |---|---|
   | Domain | Name, file count, function count, health %, coupling % |
   | File | Name, path, symbol count, avg complexity, import count, export count |
   | Symbol | Name, path:line, line count, complexity, fan-in, fan-out |

4. **Dependencies tab** SHALL show: Calls / Called-By for symbols; Imports / Used-By for files; file list for domains.
5. **Risks tab** SHALL show: risk level (low/medium/high), heat score (0–100), and a warnings list. Sources: AI `riskScore/riskReason` fields from the Architect Pass, static complexity threshold (>15), fan-in threshold (>20), AI `fragility` flag, and persisted `technical_debt` items.
6. **AI Actions** (symbol nodes only) SHALL include: Explain, Audit (security), Refactor, Optimize. All actions SHALL use the Reflex Path (Groq) for speed.
7. The Inspector SHALL debounce node selection changes to avoid race conditions when rapidly clicking between nodes.
8. Inspector data SHALL be fetched via the `inspector-batch` IPC message (overview + deps + risks in a single round-trip).
9. Inspector results SHALL be cached in the Webview's in-memory store; the cache SHALL be invalidated on `cache-invalidate` messages.

---

### FR-12 — CodeLens Integration

**User Story:** As a developer, I want to see complexity and coupling metrics inline in my editor without opening the graph.

#### Acceptance Criteria

1. The Extension_Host SHALL register `HeatCodeLensProvider` and `TraceCodeLensProvider` for `typescript`, `typescriptreact`, `python`, and `c` files.
2. `HeatCodeLensProvider` SHALL display a CodeLens above every indexed function/class showing its complexity score.
3. WHEN complexity > 15, the CodeLens label SHALL include a ⚠️ warning indicator.
4. WHEN fan-in > 20, the CodeLens label SHALL include a 🔴 critical indicator.
5. WHEN fan-out > 15, the CodeLens label SHALL include a 🟡 elevated indicator.
6. `TraceCodeLensProvider` SHALL display a "Trace" action CodeLens above every function; clicking it SHALL trigger `architect.traceFunction` with the symbol's ID and open the Trace view.
7. CodeLens providers SHALL be read-only; they SHALL never modify source code.

---

### FR-13 — AI Orchestrator — Dual-Path Routing

**User Story:** As a developer, I want AI-powered code explanations, audits, refactoring suggestions, and performance analysis triggered on demand.

#### Acceptance Criteria

1. All AI queries SHALL be routed by `AIOrchestrator.processQuery()`:
   - **Reflex Path** (Groq / Llama 3.1-8B-Instant): used for Inspector Panel actions (`forceReflex=true`) and queries classified as `reflex` intent. Target latency <300 ms.
   - **Strategic Path** (Gemini 1.5 Pro or Amazon Bedrock Nova 2): used for deep architectural analysis queries classified as `strategic` intent.
2. `IntentRouter.classify()` SHALL classify queries as `reflex` or `strategic` based on keyword pattern matching.
3. The AI prompt SHALL use the **cAST** structure:
   - Block 1: Target symbol source code (read from disk, single file read)
   - Block 2: Dependency graph JSON stubs (from SQLite edges — zero neighbor file reads)
   - Block 3: Chain-of-Architectural-Thought instruction
   - Block 4: The actual user question or action prompt
4. AI responses SHALL be cached in the `ai_cache` SQLite table, keyed by `SHA-256(query + targetCode + outgoingIds + incomingIds + analysisType)`.
5. WHEN the Strategic Path (Gemini/Bedrock) fails, the system SHALL automatically fall back to the Reflex Path (Groq) and prepend a ⚠️ fallback warning to the response.
6. WHEN Groq is not configured, AI features SHALL degrade gracefully with a clear "Groq key missing" message.
7. The active AI provider (Gemini or Bedrock) SHALL be user-configurable via `sentinelFlow.aiProvider` setting.

---

### FR-14 — AI Provider Configuration

**User Story:** As a developer, I want to configure which AI providers I use without modifying source files.

#### Acceptance Criteria

1. The Extension_Host SHALL expose the following VS Code settings:

   | Setting | Type | Description |
   |---|---|---|
   | `sentinelFlow.groqApiKey` | string | Groq API key (Llama 3.1) |
   | `sentinelFlow.geminiApiKey` | string | Google Gemini API key |
   | `sentinelFlow.vertexProject` | string | Google Cloud Project ID for Vertex AI |
   | `sentinelFlow.aiProvider` | `gemini`\|`bedrock` | Strategic path provider |
   | `sentinelFlow.awsRegion` | string | AWS Region for Bedrock (default: `us-east-1`) |
   | `sentinelFlow.bedrockModelId` | string | Bedrock model ID (default: `us.amazon.nova-2-lite-v1:0`) |
   | `sentinelFlow.awsAccessKeyId` | string | AWS Access Key ID |
   | `sentinelFlow.awsSecretAccessKey` | string | AWS Secret Access Key |
   | `sentinelFlow.useLSP` | boolean | Enable VS Code LSP type resolution (default: false) |

2. The `Configure AI Keys` command SHALL open sequential input boxes for Groq, Vertex, and Gemini keys.
3. WHENEVER `sentinelFlow.*` settings change, the Extension_Host SHALL propagate the new config to the Worker_Thread via `configure-ai` IPC message.
4. The Worker_Thread SHALL rebuild the appropriate AI client (Groq/Gemini/Vertex/Bedrock) when config is updated.

---

### FR-15 — Architecture Skeleton and AI Label Refinement

**User Story:** As a software architect, I want a high-level view of file-to-file dependencies with AI-generated module labels.

#### Acceptance Criteria

1. The `get-architecture-skeleton` worker request SHALL return a tree of folder/file nodes with file-to-file import edges.
2. WHEN `refine=true` is passed, the Worker_Thread SHALL invoke the AI Strategic Path to generate human-friendly module labels for top-level folders.
3. The `Refine Architecture Labels with AI` command SHALL trigger skeleton fetch with `refine=true` and update the Webview.
4. The skeleton data format SHALL include: nested `nodes` array (with `id`, `label`, `isFolder`, `children`), flat `edges` array (`source`, `target`, `type`).
5. The architecture skeleton SHALL be cached for the current index state; a new cache-invalidate event SHALL trigger a refetch.

---

### FR-16 — Impact Analysis (Blast Radius)

**User Story:** As a developer planning a change, I want to see how many symbols would be transitively affected by modifying a given function.

#### Acceptance Criteria

1. `ImpactAnalyzer` SHALL compute blast radius via BFS/DFS over the call-edge graph from the selected symbol.
2. The analysis SHALL distinguish between direct callers (depth 1) and transitive callers (depth > 1).
3. The result SHALL include: total affected symbol count, list of directly and transitively impacted symbols, and an impact score.
4. The `ImpactSidePanel` component SHALL display the blast radius with expandable lists of affected nodes.
5. Impact analysis SHALL be triggered per-node from the Inspector Panel; it SHALL NOT run automatically.

---

### FR-17 — Domain Classification

**User Story:** As an architect, I want my codebase automatically grouped into meaningful functional domains (auth, api, ui) for high-level navigation.

#### Acceptance Criteria

1. The `DomainClassifier` SHALL assign a domain label to each file based on heuristic rules (path segment and file name matching) covering: `auth`, `api`, `db`/`database`, `ui`/`component`/`view`, `service`, `worker`, `config`, `test`, `util`/`helper`, `middleware`.
2. When heuristics are insufficient, the system MAY invoke the AI (Groq) to classify the domain using lightweight symbol metadata.
3. Domain classifications SHALL be cached in the `domain_cache` table per symbol ID with a confidence score (0–100).
4. Per-domain health metrics (health score, complexity, coupling, symbol count) SHALL be computed and stored in `domain_metadata`.
5. Domain coupling SHALL be calculated as: `crossDomainEdges / totalEdges`; values >0.6 SHALL be flagged as high coupling.

---

### FR-18 — Technical Debt Detection

**User Story:** As a technical lead, I want to identify long methods, god objects, and high coupling patterns automatically.

#### Acceptance Criteria

1. Technical debt detection SHALL identify the following smell types: `long_method`, `god_object`, `feature_envy`, `high_fan_out`.
2. Debt items SHALL include: symbol reference, smell type, severity (`high`/`medium`/`low`), description, and detection timestamp.
3. Detected debt SHALL be persisted in the `technical_debt` table.
4. The Inspector's Risk tab SHALL surface technical debt items as additional warnings alongside static and AI-based risk signals.
5. Debt detection SHALL be initiated by the AI Architect Pass or triggered by user action; it SHALL NOT run automatically on every save.

---

### FR-19 — Graph Export

**User Story:** As a developer, I want to export my code graph for use in external tools or documentation.

#### Acceptance Criteria

1. The `Export Graph as JSON` command SHALL produce a `code-graph.json` in the workspace root containing all symbols and edges.
2. The `Export Architecture Skeleton as JSON` command SHALL produce an `architecture-skeleton.json` in the workspace root.
3. After export, the Extension_Host SHALL offer to open the exported file in the editor.
4. Both export commands SHALL be available whether or not the Webview is open.

---

### FR-20 — Directory-Scoped Module Graph

**User Story:** As a developer, I want to right-click a folder in the Explorer and see only the module graph for that directory.

#### Acceptance Criteria

1. The Explorer context menu SHALL show `Sentinel Flow: View Module Graph` when right-clicking a folder.
2. Selecting this option SHALL open the graph Webview (if not already open) and post a `filter-by-directory` message with the selected path.
3. The Webview SHALL filter all visible nodes to those whose `filePath` starts with the selected directory path.

---

### FR-21 — Error Handling and Resilience

**User Story:** As a developer, I want clear, actionable error messages when things go wrong.

#### Acceptance Criteria

1. The Extension_Host SHALL log all errors to the `Sentinel Flow` output channel with full context.
2. WHEN a single file fails to parse, the indexer SHALL log the error and continue with remaining files.
3. WHEN the Webview request times out (8 seconds), the Webview SHALL display a "Request Timed Out" screen with a Retry button.
4. WHEN the Worker_Thread is not initialized, commands SHALL show a descriptive error message instead of crashing.
5. WHEN Bedrock returns `Operation not allowed` (model access not enabled), the AI SHALL fall back to Groq AND display step-by-step instructions for enabling the model in the AWS Console.
6. WHEN neither Groq nor a strategic AI client is configured, AI actions SHALL return a clear "key missing" message rather than an unhandled error.
7. WHEN database operations fail, the Worker_Thread SHALL catch the error, log it, and send an error response to the host.

---

## 4. Non-Functional Requirements

### NFR-01 — Performance

| Metric | Requirement |
|---|---|
| UI thread blocking | Zero — all parsing, DB writes, and AI calls run in Worker_Thread |
| Indexing throughput | ≥500 files/minute on typical developer hardware |
| Edge resolution | O(1) per call/import via CompositeIndex |
| Memory ceiling | Worker auto-restart at 1 GB heap |
| Reflex AI latency | <300 ms for Groq/Llama 3.1 |
| Webview FPS | Updates via direct DOM mutation; no React re-render for FPS counter |

### NFR-02 — Compatibility

| Requirement | Specification |
|---|---|
| VS Code version | ≥ 1.85.0 |
| Node.js version | ≥ 20.0.0 |
| OS compatibility | Linux, macOS, Windows (no native modules — WASM only) |
| Languages | TypeScript, TSX, Python, C, C header files |

### NFR-03 — Security

1. AI API keys SHALL be stored via VS Code's configuration API; they SHALL never be hardcoded or committed.
2. AI prompts SHALL include only the target symbol's source code and lightweight dependency metadata stubs; no bulk file dumps.
3. The SQLite database is stored in the OS workspace storage directory and is not encrypted. Users with sensitive code should review their AI provider's data retention policies.
4. The extension SHALL operate in advisor-only mode — it SHALL never automatically modify, create, or delete source files.

### NFR-04 — Cross-Platform Packaging

1. The extension SHALL bundle as a `.vsix` file containing all WASM binary assets.
2. The `sql-wasm.wasm` file SHALL be copied to `dist/worker/` via the `copy:wasm` build script.
3. Tree-sitter grammar WASMs SHALL be sourced from `tree-sitter-wasms` npm package.
4. The build SHALL use `esbuild` with `--external:web-tree-sitter --external:sql.js` to avoid double-bundling WASM loaders.
