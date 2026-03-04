<div align="center">

# 🛡️ Sentinel Flow

**Advanced Codebase Intelligence & Visualization for VS Code**

[![VS Code Engine](https://img.shields.io/badge/VS%20Code-%5E1.85.0-blue?logo=visualstudiocode)](https://code.visualstudio.com/)
[![Node Version](https://img.shields.io/badge/Node-%E2%89%A520.0.0-brightgreen?logo=node.js)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.3-blue?logo=typescript)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![Version](https://img.shields.io/badge/version-0.1.0-orange)](./package.json)
[![WASM Only](https://img.shields.io/badge/native%20modules-none%20(WASM%20only)-brightgreen)](./package.json)

*Parse → Index → Visualize → Analyze — all inside VS Code, zero UI freeze.*

</div>

---

## 📖 What is Sentinel Flow?

**Sentinel Flow** is a production VS Code extension that builds a **living, AI-enriched dependency graph** of your codebase. It parses TypeScript, Python, and C source files using Tree-sitter (WebAssembly), stores every extracted symbol and call/import edge in an embedded SQLite database (sql.js/WASM), and renders an interactive code graph inside a VS Code panel.

A background **Worker Thread** handles all CPU-intensive work (parsing, DB writes, AI calls) so your editor stays completely responsive. An **AI Orchestrator** routes questions to Groq/Llama 3.1 for fast (<300 ms) answers or Google Gemini 1.5 Pro / Amazon Bedrock for deep architectural analysis — using your indexed codebase as structured context.

### Core Design Principles

| Principle | What it means |
|---|---|
| **Zero UI freezes** | All heavy work runs in a background Worker Thread — never the VS Code main thread |
| **Advisor-only** | The extension reads and explains code; it never modifies or deletes source files |
| **No native modules** | Fully cross-platform via WebAssembly — ships as a single `.vsix` with no recompilation |
| **Incremental everything** | Only changed files (SHA-256 hash compared) are re-parsed on subsequent index runs |

---

## ✨ Feature Highlights

### 🕸️ Three-Mode Interactive Graph
- **Architecture mode** — high-level file-to-file import skeleton (ELK hierarchical layout)
- **Codebase mode** — domain → file → symbol hierarchy with 3-level LOD depth control (ELK layered)
- **Trace mode** — BFS call-path visualization from any selected function

### 🔍 Inspector Panel
Click any graph node to instantly see:
- **Overview** — file count, symbol count, complexity, health score, coupling %
- **Dependencies** — what this node calls / what calls it
- **Risks** — static metrics, AI fragility flags, and technical debt items
- **AI Actions** — Explain / Audit / Refactor / Optimize with one click

### 🧠 AI Orchestration
- **Fast path (Groq / Llama 3.1-8B-Instant)** — <300 ms for Inspector actions
- **Deep path (Gemini 1.5 Pro / Amazon Bedrock Nova 2)** — architectural analysis
- **Automatic fallback** — deep path falls back to Groq with a ⚠️ notice if unavailable
- **Response caching** — AI results cached in SQLite; instant on repeats

### 📊 CodeLens in Your Editor
- Complexity score displayed above every function
- ⚠️ warning when complexity > 15; 🔴 critical when fan-in > 20
- `⚡ Trace` action that opens the call-trace graph for any function

### ⚡ Incremental Indexing + File Watcher
- SHA-256 content hash check on every run — unchanged files skip re-parsing entirely
- File watcher re-indexes only modified files on save (1-second debounce batch)
- Memory guard: worker auto-restarts at 1 GB heap and resumes without data loss

---

## 🛠️ Technology Stack

| Layer | Technology |
|---|---|
| Language | TypeScript 5.3 |
| Extension Host | VS Code Extension API (≥ 1.85.0) |
| Code Parsing | web-tree-sitter (WASM) + tree-sitter-wasms grammars |
| Database | sql.js (WebAssembly SQLite) + Drizzle ORM |
| AI — Fast Path | Groq API / Llama 3.1-8B-Instant |
| AI — Deep Path | Google Gemini 1.5 Pro, Vertex AI, or Amazon Bedrock Nova 2 |
| Webview UI | React 18, @xyflow/react (ReactFlow), Zustand, TailwindCSS |
| Graph Layout | ELK (hierarchical/layered), Dagre, custom BFS layout |
| Bundler | esbuild (extension) + Vite (webview) |

---

## 🚀 Installation

### Option A — From VSIX (Recommended for users)

1. Download `sentinel-flow-extension-0.1.0.vsix` from the project directory (or a release)
2. In VS Code: **Extensions** → `···` → **Install from VSIX…**
3. Select the `.vsix` file

### Option B — From Source (Developers)

**Prerequisites:** Node.js ≥ 20.0.0, npm, VS Code ≥ 1.85.0

```bash
# 1. Clone the repository
git clone https://github.com/innovators-of-ai/sentinel-flow-extension.git
cd sentinel-flow-extension

# 2. Install extension dependencies
npm install

# 3. Build everything (webview SPA + extension bundles + copy WASM)
npm run build

# 4. Launch in Extension Development Host
# Press F5 in VS Code — or run:
code --extensionDevelopmentPath=$(pwd)
```

---

## ⚙️ Configuration

### Quick Setup — Command Palette

```
Ctrl+Shift+P → Sentinel Flow: Configure AI Keys
```

This opens a guided wizard to set your Groq, Gemini, and/or Vertex AI keys.

### Manual Setup — `settings.json`

```json
{
  "sentinelFlow.groqApiKey":         "gsk_...",
  "sentinelFlow.geminiApiKey":       "AIza...",
  "sentinelFlow.vertexProject":      "my-gcp-project-id",

  "sentinelFlow.aiProvider":         "gemini",

  "sentinelFlow.awsRegion":          "us-east-1",
  "sentinelFlow.bedrockModelId":     "us.amazon.nova-2-lite-v1:0",
  "sentinelFlow.awsAccessKeyId":     "AKIA...",
  "sentinelFlow.awsSecretAccessKey": "...",

  "sentinelFlow.useLSP":             false
}
```

> **No AI keys required for core functionality.** Indexing, visualization, and graph navigation all work without any API keys. AI features gracefully degrade to descriptive "key not configured" messages.

### AI Provider Selection

Switch between **Gemini** and **Amazon Bedrock** as the strategic (deep) analysis provider using the toggle in the Sentinel Flow sidebar, or via:

```json
"sentinelFlow.aiProvider": "bedrock"
```

---

## 📋 Usage Guide

### Step 1 — Index Your Workspace

```
Ctrl+Shift+P → Sentinel Flow: Index Workspace
```

The extension will:
1. Discover all `.ts`, `.tsx`, `.py`, `.c`, `.h` files
2. Compute SHA-256 hashes and skip unchanged files
3. Parse changed files with Tree-sitter in the background
4. Store symbols, edges, and file hashes in the embedded SQLite DB
5. Show a progress notification: `Processing N/M files...`

Subsequent runs only re-index what changed. Large workspaces (10,000+ files) typically complete in 2–5 minutes on first run; incremental runs are seconds.

### Step 2 — Open the Code Graph

```
Ctrl+Shift+P → Sentinel Flow: Visualize Code Graph
```

The interactive graph panel opens. Use the **View Mode Bar** to switch:

| Mode | Shortcut | What you see |
|---|---|---|
| **Architecture** | Click "Architecture" | File/folder dependency skeleton |
| **Codebase** | Click "Codebase" | Domain → File → Symbol hierarchy |
| **Trace** | Click a function CodeLens → ⚡ Trace | BFS call path from that function |

Use the **Depth slider** (0, 1, 2) in Codebase mode to control Level of Detail:
- Depth 0 → Domain nodes only (fastest)
- Depth 1 → + File nodes (default)
- Depth 2 → + Symbol nodes (full detail)

### Step 3 — Explore with the Inspector Panel

Click any node in the graph to open the **Inspector Panel** on the right:

1. **Overview tab** — name, path, file/symbol counts, health score, average complexity
2. **Dependencies tab** — what this node calls, what calls it, imports, exports
3. **Risks tab** — heat score (0–100), risk level, warnings from static analysis + AI flags + technical debt
4. **AI Actions** (symbol nodes) — click **Explain**, **Audit**, **Refactor**, or **Optimize**

### Step 4 — Use CodeLens in the Editor

Open any `.ts`, `.py`, or `.c` file. You'll see CodeLens above each function:

```typescript
// [Heat: 7]  [⚡ Trace]
async function processPayment(order: Order): Promise<Receipt> {
```

Click `⚡ Trace` to open the call-trace graph starting from that function.

### Step 5 — Directory Module Graph

Right-click any folder in the Explorer → **Sentinel Flow: View Module Graph**

This filters the graph to show only nodes within that directory.

---

## 💻 Commands Reference

| Command | Description |
|---|---|
| `Sentinel Flow: Index Workspace` | Parse and index all supported files in the workspace |
| `Sentinel Flow: Visualize Code Graph` | Open the interactive graph visualization panel |
| `Sentinel Flow: Configure AI Keys` | Set Groq / Gemini / Vertex API keys via input boxes |
| `Sentinel Flow: Refine Architecture Labels with AI` | AI-generated labels for architecture view nodes |
| `Sentinel Flow: Refine Graph with AI (Architect Pass)` | Run full AI pass: purpose inference, risk scoring, implicit links |
| `Sentinel Flow: Query Symbols` | Search for any symbol by name (Quick Pick with jump-to-definition) |
| `Sentinel Flow: Export Graph as JSON` | Save full symbol + edge graph to `code-graph.json` |
| `Sentinel Flow: Export Architecture Skeleton as JSON` | Save file-level skeleton to `architecture-skeleton.json` |
| `Sentinel Flow: Clear Index` | Wipe the SQLite index completely |
| `Sentinel Flow: Toggle File Watcher` | Enable / disable incremental re-indexing on file save |
| `Sentinel Flow: View Module Graph` *(context menu)* | Filter graph to a specific directory |

---

## 📁 Project Structure

```
sentinel-flow/
├── src/                          # Extension Host + Worker Thread (TypeScript)
│   ├── extension.ts              # Activation, command registration, orchestration (798 lines)
│   ├── webview-provider.ts       # GraphWebviewProvider — full panel webview
│   ├── sidebar-provider.ts       # SidebarProvider — activity-bar sidebar
│   ├── codelens-provider.ts      # HeatCodeLensProvider + TraceCodeLensProvider
│   ├── file-watcher.ts           # FileWatcherManager — 1 s debounce batch watcher
│   ├── ai/
│   │   ├── orchestrator.ts       # AIOrchestrator — dual-path routing + cAST prompt building
│   │   ├── intent-router.ts      # Reflex vs. strategic query classification
│   │   ├── groq-client.ts        # Groq / Llama 3.1 API client
│   │   ├── gemini-client.ts      # Google Gemini 1.5 Pro client
│   │   ├── vertex-client.ts      # Vertex AI client
│   │   ├── bedrock-client.ts     # Amazon Bedrock Nova 2 client
│   │   └── debt-detector.ts      # Technical debt smell detector
│   ├── db/
│   │   ├── database.ts           # CodeIndexDatabase — sql.js WASM wrapper (59 KB)
│   │   └── schema.ts             # Drizzle ORM table definitions (8 tables)
│   ├── domain/
│   │   ├── classifier.ts         # Heuristic + AI domain classification
│   │   └── health.ts             # Domain health score computation
│   └── worker/
│       ├── worker.ts             # IndexWorker — all core operations (1,160 lines)
│       ├── worker-manager.ts     # WorkerManager — lifecycle + typed RPC proxy (560 lines)
│       ├── parser.ts             # TreeSitterParser WASM bootstrap
│       ├── symbol-extractor.ts   # AST → symbols + pending edges (27 KB)
│       ├── composite-index.ts    # O(1) CompositeIndex + edge resolution
│       ├── string-registry.ts    # Integer-interned string store
│       ├── inspector-service.ts  # Inspector Panel business logic (580 lines)
│       ├── impact-analyzer.ts    # Blast radius BFS/DFS
│       └── message-protocol.ts   # Typed IPC message unions
├── webview/src/
│   ├── App.tsx                   # Root component + VS Code message bridge (449 lines)
│   ├── components/
│   │   ├── GraphCanvas.tsx       # Main ReactFlow canvas (60 KB — core render loop)
│   │   ├── DomainNode.tsx        # Domain node renderer
│   │   ├── FileNode.tsx          # File node renderer
│   │   ├── SymbolNode.tsx        # Symbol node renderer
│   │   ├── ViewModeBar.tsx       # Architecture/Codebase/Trace mode bar
│   │   ├── ImpactSidePanel.tsx   # Blast radius visualization panel
│   │   ├── SunburstGraph.tsx     # D3 sunburst chart
│   │   └── inspector/            # 10-file Inspector Panel component suite
│   ├── stores/
│   │   ├── useGraphStore.ts      # Zustand: graph data, view mode, skeleton, trace
│   │   └── useInspectorStore.ts  # Zustand: node selection, tab data, cache
│   ├── utils/
│   │   ├── elk-layout.ts         # ELK hierarchical + layered layout (14 KB)
│   │   ├── bfs-layout.ts         # BFS layout for Trace view (7 KB)
│   │   ├── graphFilter.ts        # LOD filter, search filter, directory scope filter
│   │   ├── metrics.ts            # Fan-in/out, complexity calculations
│   │   └── performance.ts        # RAF-based FPS monitor
│   └── panel/
│       └── dataProvider.ts       # Inspector data fetch + Zustand cache layer
├── resources/icon.svg
├── test/
├── drizzle.config.ts
├── package.json
├── requirements.md               # Functional + non-functional requirements (21 FRs)
├── design.md                     # Full technical design + architecture
└── README.md                     # This file
```

---

## ⚡ Performance Engineering

### Indexing Pipeline

The indexer is built around a **three-pass, zero-waste** architecture:

```
Pass 1 (hash only)   — Read file → SHA-256 hash → drop content from RAM
Pass 2 (diff check)  — Batch hash comparison in SQLite → get changed paths only
Pass 3 (parse only)  — Read + parse ONLY the ~1–5% of files that actually changed
```

| Optimization | Technique | Effect |
|---|---|---|
| Content-hash dedup | SHA-256 per file before any parse | Unchanged files use 0 CPU, 0 RAM |
| O(1) edge resolution | `CompositeIndex` (name × path × line inverted index) | No linear scans for call/import edges |
| String interning | `StringRegistry` integer IDs per batch | 30–60% less heap allocation in large workspaces |
| Progressive flushing | Symbols flushed to SQLite in 500-symbol chunks | Memory stays flat even for 15,000-file monorepos |
| Periodic disk saves | Every 50 files during bulk batch | Prevents total data loss on OOM crash |
| Post-index optimization | SQLite `ANALYZE` + `VACUUM` post-batch | Fast query performance maintained |
| Worker auto-restart | Exit at 1 GB heap → host spawns new worker | Automatic recovery with queued-request drain |

### Graph Rendering

| Optimization | Technique | Effect |
|---|---|---|
| LOD system | Nodes below active depth never instantiated | 0 VDOM nodes, 0 layout cost for invisible tiers |
| Edge rerouting | Collapsed subtree edges re-route to parent | Dense subgraphs reduce to 1–3 edges |
| Edge sampling | Uniform sample if edges > 10,000 | Maintains 60 FPS in huge codebases |
| FPS counter | Direct `ref.textContent` DOM mutation | Zero React re-renders for FPS updates |
| Inspector cache | Zustand Map<nodeId, data> | Instant re-display on repeated node clicks |

---

## 🗄️ Database Schema Summary

The embedded SQLite DB stores 8 tables:

| Table | Purpose |
|---|---|
| `symbols` | All extracted symbols with location, complexity, domain, and AI fields |
| `edges` | Directed relationships: `call`, `import`, `inherit`, `implement` |
| `files` | File tracking: path, SHA-256 content hash, last indexed timestamp |
| `meta` | Key-value store (last index time, workspace root, etc.) |
| `ai_cache` | SHA-256-keyed AI response cache — instant cache hits |
| `domain_metadata` | Health score, complexity, coupling, symbol count per domain |
| `domain_cache` | Per-symbol AI domain classification with confidence score |
| `technical_debt` | Code smells per symbol: type, severity, description |

---

## 🤖 AI Architecture

### Dual-Path Routing

```
Any AI request
    │
    ├── REFLEX PATH (always for Inspector actions)
    │     └── Groq / Llama 3.1-8B-Instant
    │         Target: <300 ms
    │
    └── STRATEGIC PATH (for deep architectural queries)
          ├── sentinelFlow.aiProvider = "gemini"
          │     └── Google Gemini 1.5 Pro (or Vertex AI)
          └── sentinelFlow.aiProvider = "bedrock"
                └── Amazon Bedrock Nova 2
          │
          └── If strategic fails → automatic fallback to Reflex + ⚠️ banner
```

### cAST Prompt Format

AI prompts are structured as **Contextual AST** (cAST) to avoid LLM "Lost in the Middle" confusion:

1. **Target symbol source** — raw code of the selected function/class (1 disk read)
2. **Dependency stubs JSON** — lightweight metadata for each caller/callee (zero neighbor file reads)
3. **Chain-of-Thought instruction** — identify architectural patterns before answering
4. **The actual question or action prompt**

### Response Caching

Every AI response is cached in SQLite keyed by `SHA-256(query + targetCode + outgoingIds + incomingIds + analysisType)`. Repeat queries on unchanged code return instantly.

---

## 📡 Worker IPC Protocol

Communication between Extension Host and Worker Thread uses typed discriminated union messages (see `src/worker/message-protocol.ts`).

**Key message types:**

| Request → Worker | Purpose |
|---|---|
| `initialize` | Boot worker, open DB, load WASM grammars |
| `parse-batch` | Parse + index a batch of files |
| `check-file-hash-batch` | Check which files need re-parsing |
| `inspector-batch` | Get overview + deps + risks in one round-trip |
| `inspector-ai-action` | Trigger explain/audit/refactor/optimize |
| `get-architecture-skeleton` | Get file-level dependency graph |
| `trace-function` | Get BFS call trace for a symbol |
| `ai-query` | General AI query with optional symbol context |
| `refine-graph` | Full AI Architect Pass (purpose, risk, implicit links) |

**Timeout policy:**

| Operation | Timeout |
|---|---|
| Bulk parse batch | 10 minutes (600,000 ms) |
| AI Architect Pass | 2 minutes (120,000 ms) |
| Inspector AI actions | 200 seconds (200,000 ms) |
| All other requests | 30 seconds (30,000 ms) |

---

## 🔒 Security Notes

- **API keys** are stored via VS Code's settings API and are never committed to source files or written to logs.
- **AI prompts** include only the selected symbol's source code and lightweight metadata stubs from SQLite. No bulk file dumps are sent to AI providers.
- **The SQLite index** is stored in the OS workspace storage directory (`~/.vscode/...`) and is not encrypted.
- **Advisor-only mode** — the extension never writes to, creates, or deletes source files.
- Review your AI provider's data and privacy policies if working with sensitive code.

---

## 🤝 Contributing

### Branch Strategy

```
main          ← stable releases
dev           ← integration branch
feature/<x>   ← new features (branch from dev)
fix/<x>       ← bug fixes (branch from dev)
```

### Conventional Commit Format

```
feat(worker): add Java Tree-sitter grammar support
fix(webview): prevent edge flicker on LOD depth change
perf(indexer): batch edge inserts to reduce SQLite roundtrips
docs(readme): add Amazon Bedrock setup section
chore(deps): upgrade @xyflow/react to 12.x
```

### Pull Request Checklist

- [ ] `npm run build` completes with zero TypeScript errors
- [ ] Tested in Extension Development Host (`F5` in VS Code)
- [ ] No native module dependencies added (WASM only)
- [ ] Worker boundary respected — no direct DB or AI calls from Extension Host
- [ ] New IPC message types added to `message-protocol.ts` union types
- [ ] Output channel logging added for new features

### Reporting Bugs

Please include:
- VS Code version + OS + Node.js version
- Extension version (`0.1.0`)
- Steps to reproduce
- Output panel logs (**View → Output → Sentinel Flow**)
- Contents of `dist/worker/` if WASM-related

---

## 📄 License

MIT License — see [LICENSE](./LICENSE) for details.

---

<div align="center">
  <sub>Built with Tree-sitter, sql.js, ReactFlow, Groq, Gemini, and the VS Code Extension API.</sub><br/>
  <sub>Publisher: <b>innovators-of-ai</b> · Extension ID: <code>innovators-of-ai.sentinel-flow-extension</code></sub>
</div>
