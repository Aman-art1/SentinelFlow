<div align="center">

# 🛡️ Sentinel Flow

**Advanced Codebase Intelligence & Visualization for VS Code**

[![VS Code Engine](https://img.shields.io/badge/VS%20Code-%5E1.85.0-blue?logo=visualstudiocode)](https://code.visualstudio.com/)
[![Node Version](https://img.shields.io/badge/Node-%E2%89%A520.0.0-brightgreen?logo=node.js)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.3-blue?logo=typescript)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![Version](https://img.shields.io/badge/version-0.1.0-orange)](./package.json)

*Parse → Index → Visualize → Ask AI — all inside VS Code.*

</div>

---

## 📖 Description

**Sentinel Flow** is a VS Code extension that builds a living, AI-enriched graph of your entire codebase. It parses TypeScript, Python, and C source files using Tree-sitter (WebAssembly), stores all extracted symbols and call/import edges in an in-process SQLite database (sql.js/WASM), and renders an interactive code graph inside a VS Code panel. A background Worker Thread handles all CPU-intensive work to keep your editor completely responsive.

An AI Orchestrator layer routes your natural-language questions to either **Groq (Llama 3.1)** for fast sub-300ms answers or **Google Gemini 1.5 Pro** for deep architectural analysis — using your indexed codebase as structured context.

### ✨ Key Highlights

- 🧠 **AI-powered code analysis** — Explain, Audit, Refactor, or Optimize any symbol with one click
- 🕸️ **Interactive code graph** — Visualize call graphs, import trees, and architecture skeletons with ReactFlow + D3
- ⚡ **Zero UI freeze** — All indexing and AI work runs in a background worker thread
- 🔍 **Smart search** — Find symbols by name, jump to definition, filter graph by directory
- 🔄 **Incremental indexing** — File watcher re-indexes only changed files
- 📊 **"Heat" CodeLens** — See complexity scores inline in your editor
- 🏗️ **No native modules** — Fully cross-platform via WebAssembly (no native recompilation)

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| **Language** | TypeScript 5.3 |
| **Extension Host** | VS Code Extension API (^1.85.0) |
| **Code Parsing** | Tree-sitter (WebAssembly via `web-tree-sitter`) |
| **Database** | SQLite via `sql.js` (WebAssembly) + `drizzle-orm` |
| **AI — Fast Path** | Groq API / Llama 3.1-8B-Instant |
| **AI — Deep Path** | Google Gemini 1.5 Pro / Vertex AI |
| **Webview UI** | React 18, ReactFlow, D3, Zustand, TailwindCSS |
| **Graph Layout** | Dagre, ELK, D3 Force |
| **Bundler** | esbuild (extension) + Vite (webview) |

---

## 🚀 Installation

### From VSIX (Recommended)

1. Download the latest `.vsix` from [Releases](#)
2. In VS Code: `Extensions` → `···` → `Install from VSIX…`
3. Select the downloaded file

### From Source

**Prerequisites:** Node.js ≥ 20, npm, VS Code ≥ 1.85.0

```bash
# Clone the repository
git clone https://github.com/your-org/sentinel-flow.git
cd sentinel-flow

# Install dependencies and build
npm install
npm run build
```

Then press **F5** in VS Code to launch the Extension Development Host.

---

## ⚙️ Configuration

After installing, configure your AI API keys via the command palette:

```
Sentinel Flow: Configure AI Keys
```

Or manually in VS Code settings (`settings.json`):

```json
{
  "codeIndexer.groqApiKey": "gsk_...",
  "codeIndexer.geminiApiKey": "AIza...",
  "codeIndexer.vertexProject": "my-gcp-project-id"
}
```

> **Note:** Both Groq and Gemini keys are optional — the extension fully works for indexing and visualization without AI keys. AI features gracefully degrade to "not available" messages.

---

## 📋 Usage

### 1. Index Your Workspace

Open a workspace and run:
```
Ctrl+Shift+P → Sentinel Flow: Index Workspace
```

The extension will parse all `.ts/.tsx/.py/.c/.h` files and build the code graph. Only changed files are re-indexed on subsequent runs.

### 2. Visualize the Code Graph

```
Ctrl+Shift+P → Sentinel Flow: Visualize Code Graph
```

This opens the interactive graph panel. Switch between views:
- **Codebase** — Full domain → file → symbol hierarchy
- **Architecture** — High-level file-to-file dependency skeleton
- **Trace** — BFS call trace from a selected function

### 3. Ask AI About Any Symbol

1. Click any node in the graph to open the **Inspector Panel**
2. Use the **Actions** tab to: Explain, Audit, Refactor, or Optimize
3. The AI receives the symbol's source code + its dependency graph as context

### 4. CodeLens in the Editor

Supported files (`.ts`, `.tsx`, `.py`, `.c`) show inline CodeLens:
- **Heat Score** — cyclomatic complexity indicator
- **Trace** — opens a BFS call trace starting from that function

### 5. Directory Module Graph

Right-click any folder in the Explorer → **Sentinel Flow: View Module Graph**

---

## 💻 Commands

| Command | Description |
|---|---|
| `Sentinel Flow: Index Workspace` | Parse and index all supported files |
| `Sentinel Flow: Visualize Code Graph` | Open the graph visualization panel |
| `Sentinel Flow: Configure AI Keys` | Set Groq / Gemini / Vertex API keys |
| `Sentinel Flow: Refine Architecture Labels with AI` | AI-generated domain/file labels |
| `Sentinel Flow: Query Symbols` | Search for a symbol by name |
| `Sentinel Flow: Export Graph as JSON` | Save full graph to `code-graph.json` |
| `Sentinel Flow: Export Architecture Skeleton as JSON` | Save file-level skeleton to JSON |
| `Sentinel Flow: Clear Index` | Wipe the SQLite index |
| `Sentinel Flow: Toggle File Watcher` | Enable/disable incremental re-indexing |

---

## 📸 Screenshots

<!-- TODO: Add screenshots of the graph visualization, inspector panel, and CodeLens -->

| Code Graph View | Inspector Panel | Architecture View |
|---|---|---|
| *(screenshot)* | *(screenshot)* | *(screenshot)* |

---

## 📁 Folder Structure

```
sentinel-flow/
├── src/                    # Extension host source (TypeScript)
│   ├── extension.ts        # Entry point — activation & commands
│   ├── webview-provider.ts # Graph panel provider
│   ├── sidebar-provider.ts # Sidebar view provider
│   ├── codelens-provider.ts# Heat + Trace CodeLens
│   ├── file-watcher.ts     # Incremental re-index on save
│   ├── ai/                 # AI orchestration
│   │   ├── orchestrator.ts # Intent routing → model selection → cache
│   │   ├── intent-router.ts# Reflex vs Strategic classification
│   │   ├── groq-client.ts  # Llama 3.1 client
│   │   ├── gemini-client.ts# Gemini 1.5 Pro client
│   │   └── vertex-client.ts# Vertex AI client
│   ├── db/                 # Database layer
│   │   ├── database.ts     # sql.js wrapper (symbols, edges, cache)
│   │   └── schema.ts       # Drizzle ORM schema
│   └── worker/             # Background worker thread
│       ├── worker.ts       # IndexWorker (parsing + DB + AI)
│       ├── worker-manager.ts  # Host-side lifecycle + RPC
│       ├── parser.ts       # TreeSitterParser wrapper
│       ├── symbol-extractor.ts # AST → symbols + edges
│       ├── composite-index.ts  # O(1) edge resolution index
│       └── message-protocol.ts # Typed request/response unions
├── webview/                # Webview SPA (React + ReactFlow)
│   └── src/
│       ├── App.tsx         # Root component + VS Code message bridge
│       ├── components/     # GraphCanvas, InspectorPanel, nodes, edges
│       ├── stores/         # Zustand graph + inspector stores
│       └── utils/          # Layout algorithms, performance monitor
├── resources/              # Extension icon
├── test/                   # Validation scripts
├── dist/                   # Built output (git-ignored)
└── package.json            # Manifest + build scripts
```

---

## ⚡ Performance & Scaling

### 🔧 Indexing Pipeline

- **Worker Thread isolation** — parsing and DB writes never block the VS Code UI
- **O(1) edge resolution** — `CompositeIndex` (inverted index by name × path × line) resolves call/import edges without linear scans
- **String interning** — `StringRegistry` interns symbol names/paths as integer IDs to cut heap allocations in batch runs
- **Content hash dedup** — unchanged files are skipped entirely on re-index
- **Progressive batch flushing** — symbols flushed to SQLite in 500-symbol chunks to prevent memory spikes
- **Post-index optimization** — SQLite `ANALYZE` + `VACUUM` run after bulk indexing
- **AI response caching** — responses cached in SQLite by SHA hash of symbol code + query; instant on repeat
- **Memory guard** — worker auto-exits at 1 GB heap and is automatically restarted by the extension host

### 🔭 Level of Detail (LOD)

The graph uses a **3-tier LOD system** controlled by the Depth Selector:

| Depth | Visible nodes | Use case |
|---|---|---|
| **0** | Domains only | Macro overview, fastest render |
| **1** | Domains + Files | Structural map *(default)* |
| **2** | Domains + Files + Symbols | Full detail, micro view |

- Nodes below the active depth are **never instantiated** — zero memory, zero layout cost
- Each domain/file node can be **collapsed individually**, independent of the global depth
- **Edge redirection** — edges to collapsed nodes are re-routed to their parent so the graph stays connected
- **Edge deduplication** — duplicate `source → target` pairs (common at low depth) are merged into one edge
- **Edge sampling** — if edges exceed 10,000, they are uniformly sampled to keep ReactFlow performant
- **Live FPS counter** — color-coded 🟢/🟡/🔴 indicator updated via direct DOM mutation (no React overhead)

---

## 🤝 Contributing

Contributions are welcome! Please follow these guidelines:

### Branch Strategy
```
main          ← stable releases
dev           ← integration branch
feature/<x>   ← new features (branch from dev)
fix/<x>       ← bug fixes (branch from dev)
```

### Commit Messages (Conventional Commits)
```
feat(worker): add Python type annotation extractor
fix(webview): prevent duplicate click events on graph nodes
docs(readme): update installation section
chore(deps): upgrade @xyflow/react to 12.4.0
```

### Pull Request Checklist
- [ ] `npm run build` succeeds with zero TypeScript errors
- [ ] Tested in Extension Development Host (F5)
- [ ] No native module dependencies introduced
- [ ] Worker boundary respected (no direct DB calls from extension host)

### Reporting Issues

Please include:
- VS Code version, OS, Node version
- Extension version (`0.x.x`)
- Steps to reproduce
- Output panel logs (`View → Output → Sentinel Flow`)

---

## 📚 API Documentation

### Worker Message Protocol

The extension host communicates with the background worker via typed messages defined in `src/worker/message-protocol.ts`.

**Key request types:**
| Message Type | Description |
|---|---|
| `parse-batch` | Parse and index a batch of files |
| `query-symbols` | Search symbols by name |
| `export-graph` | Get full graph as JSON |
| `ai-query` | Send AI query with optional symbol context |
| `inspector-ai-action` | Trigger AI action (explain/audit/refactor/optimize) |
| `trace-function` | Get BFS call trace for a symbol |
| `get-architecture-skeleton` | Get file-level architecture graph |

### Graph Export Format

```typescript
interface GraphExport {
  symbols: Symbol[];   // All indexed symbols
  edges: Edge[];       // Call and import edges
  files: string[];     // All indexed file paths
  domains: Domain[];   // Grouped file domains
}
```

---

## 🔒 Security Notes

- AI API keys are stored in VS Code's secure settings store — never in source files.
- AI prompts include your local source code (only the selected symbol + lightweight metadata stubs for neighbors). Review your AI provider's data policies.
- The SQLite index is stored in your OS temp directory and is not encrypted.

---

## 📄 License

This project is licensed under the **MIT License** — see the [LICENSE](./LICENSE) file for details.

---

## 👤 Author

**Innovators of AI**  
Publisher ID: `innovators-of-ai`

---

<div align="center">
  <sub>Built with ❤️ using Tree-sitter, sql.js, ReactFlow, and the VS Code Extension API.</sub>
</div>
