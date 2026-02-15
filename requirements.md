# Requirements Document: SentinelFlow

## Introduction

SentinelFlow is a VS Code extension that provides system flow visualization and architectural insight. The extension is an advisor-only tool that explains architectural risk without modifying code. It uses Tree-sitter for parsing, in-memory graph models for analysis, and React Flow for interactive visualization. SentinelFlow follows a zero-noise philosophy with no forced warnings or colored squiggles.

Phase 1 focuses on the System Flow Extractor: scanning directories, extracting symbols and relationships, calculating basic metrics, and visualizing the codebase as an interactive graph.

## Glossary

- **Extension_Host**: The main VS Code extension process responsible for orchestration and UI integration
- **Worker_Process**: Background thread handling scanning, parsing, and metric computation without blocking the Extension Host
- **System_Flow_Extractor**: Component that scans directories, parses files, extracts symbols, and builds relationship graphs
- **Webview**: React-based renderer process providing interactive visualization
- **Symbol**: A code entity such as a function, class, variable, or interface
- **Graph**: Visual representation of code structure showing relationships between entities
- **Fan_In**: Number of incoming calls or dependencies to a code entity
- **Fan_Out**: Number of outgoing calls or dependencies from a code entity
- **Tree_Sitter**: Parsing library used for extracting code structure
- **Semantic_Zoom**: Hierarchical aggregation allowing users to view code at different levels of detail
- **Coupling_Heat**: Visual indicator of coupling intensity based on Fan-In and Fan-Out
- **CodeLens**: In-editor UI element displaying contextual information above code
- **Cyclomatic_Complexity**: Metric measuring the number of independent paths through code
- **Visualization_Mode**: Display mode determining which nodes and relationships are shown (Architecture, Flow, Trace, Full)
- **SQLite_Database**: Local database storing indexed code data for persistence across sessions
- **AI_Service**: External AI provider (Vertex AI, Gemini, or Groq) for code analysis
- **Domain**: A high-level architectural grouping of related files and components
- **Blast_Radius**: Measure of potential impact when modifying a code entity
- **Risk_Score**: Calculated metric indicating code fragility based on complexity, coupling, and AI assessment
- **Technical_Debt**: Detected code smells, anti-patterns, and maintainability issues

## Requirements

### Requirement 1: Directory and File Scanning

**User Story:** As a developer, I want the extension to scan my workspace, so that I can visualize the codebase structure.

#### Acceptance Criteria

1. WHEN a workspace is opened, THE System_Flow_Extractor SHALL scan all supported file types in the workspace
2. WHEN a file is scanned, THE System_Flow_Extractor SHALL parse it using Tree_Sitter to extract symbols and relationships
3. THE System_Flow_Extractor SHALL build an in-memory graph model of the codebase
4. THE Worker_Process SHALL perform all scanning and parsing operations to prevent blocking the Extension_Host
5. THE Extension_Host SHALL communicate with the Webview using VS Code messaging protocol

### Requirement 2: Symbol Extraction

**User Story:** As a developer, I want the extension to identify functions and classes, so that I can understand code structure.

#### Acceptance Criteria

1. WHEN a file is parsed, THE System_Flow_Extractor SHALL extract all functions, classes, variables, and interfaces
2. WHEN symbols are extracted, THE System_Flow_Extractor SHALL capture their location (file path, start line, end line)
3. WHEN symbols are extracted, THE System_Flow_Extractor SHALL calculate Cyclomatic_Complexity for each function
4. THE System_Flow_Extractor SHALL store extracted symbols in an in-memory data structure

### Requirement 3: Relationship Detection

**User Story:** As a developer, I want to see how code entities relate to each other, so that I can understand dependencies.

#### Acceptance Criteria

1. WHEN parsing a file, THE System_Flow_Extractor SHALL detect function calls between symbols
2. WHEN parsing a file, THE System_Flow_Extractor SHALL detect import relationships between files
3. THE System_Flow_Extractor SHALL store relationships in an in-memory graph structure

### Requirement 4: Fan-In and Fan-Out Calculation

**User Story:** As a developer, I want to see coupling metrics, so that I can identify highly connected code.

#### Acceptance Criteria

1. WHEN symbols are extracted, THE System_Flow_Extractor SHALL calculate Fan_In for each symbol
2. WHEN symbols are extracted, THE System_Flow_Extractor SHALL calculate Fan_Out for each symbol
3. THE System_Flow_Extractor SHALL make Fan_In and Fan_Out values available for visualization

### Requirement 5: Interactive Graph Visualization

**User Story:** As a developer, I want to visualize my codebase as an interactive graph, so that I can explore code structure visually.

#### Acceptance Criteria

1. WHEN the user opens the graph view, THE Webview SHALL render an interactive graph showing Files and Symbols
2. WHEN the user clicks a node in the graph, THE Webview SHALL highlight the node and display its details
3. WHEN the user double-clicks a file or symbol node, THE Extension_Host SHALL open the corresponding file in the editor
4. THE Webview SHALL support zoom, pan, and drag operations for graph navigation
5. THE Webview SHALL use React Flow for graph rendering

### Requirement 6: Semantic Zoom via Hierarchical Aggregation

**User Story:** As a developer, I want to view code at different levels of detail, so that I can focus on relevant areas.

#### Acceptance Criteria

1. WHEN the user zooms out, THE Webview SHALL aggregate symbols into file-level nodes
2. WHEN the user zooms in, THE Webview SHALL expand file-level nodes to show individual symbols
3. THE Webview SHALL aggregate relationships when displaying higher-level views
4. THE Webview SHALL provide smooth transitions between zoom levels

### Requirement 7: Coupling Heat Indicator

**User Story:** As a developer, I want visual indicators of coupling intensity, so that I can identify architectural hotspots.

#### Acceptance Criteria

1. WHEN displaying the graph, THE Webview SHALL color-code nodes based on Fan_In and Fan_Out values
2. WHEN a node has high coupling, THE Webview SHALL display it with a warmer color
3. WHEN a node has low coupling, THE Webview SHALL display it with a cooler color
4. THE Webview SHALL provide a legend explaining the coupling heat color scheme

### Requirement 8: CodeLens Integration

**User Story:** As a developer, I want to see code metrics directly in my editor, so that I can identify complex code without switching views.

#### Acceptance Criteria

1. WHEN a file is opened in the editor, THE Extension_Host SHALL display CodeLens indicators above each function and class
2. WHEN displaying CodeLens, THE Extension_Host SHALL show Cyclomatic_Complexity value for each function
3. WHEN displaying CodeLens, THE Extension_Host SHALL show Fan_In and Fan_Out values for each symbol
4. WHEN the user clicks a Trace CodeLens action, THE Extension_Host SHALL open the Webview in Trace Mode for that symbol
5. WHEN Cyclomatic_Complexity exceeds 15, THE Extension_Host SHALL display the CodeLens indicator with warning styling
6. WHEN Fan_In exceeds 20, THE Extension_Host SHALL display the CodeLens indicator with critical styling
7. WHEN Fan_Out exceeds 15, THE Extension_Host SHALL display the CodeLens indicator with elevated styling
8. THE CodeLens SHALL remain strictly read-only with no code modification capabilities

### Requirement 9: Visualization Modes

**User Story:** As a developer, I want different visualization modes, so that I can analyze code at different levels of abstraction.

#### Acceptance Criteria

1. WHEN the user selects Architecture Mode, THE Webview SHALL display only file-level nodes with aggregated relationships
2. WHEN the user selects Flow Mode for a symbol, THE Webview SHALL display the execution path from that symbol with directional call relationships
3. WHEN the user selects Trace Mode for a symbol, THE Webview SHALL display both incoming and outgoing relationships showing full Fan_In and Fan_Out context
4. WHEN the user selects Full Mode, THE Webview SHALL display the complete graph with all file and symbol nodes
5. WHEN a visualization mode is active, THE Webview SHALL render only nodes and relationships relevant to that mode
6. THE Webview SHALL hide all unrelated elements when a specific mode is active

### Requirement 10: Advanced Filtering System

**User Story:** As a developer working with large codebases, I want advanced filtering capabilities, so that I can focus on specific areas of interest.

#### Acceptance Criteria

1. WHEN the user applies a risk level filter, THE Webview SHALL show only nodes matching the selected risk threshold (Low, Medium, High)
2. WHEN the user applies a node type filter, THE Webview SHALL show only nodes of the selected type (File, Symbol)
3. WHEN the user applies a directory scope filter, THE Webview SHALL show only nodes within the selected directory
4. WHEN the user enters a name search filter, THE Webview SHALL show only nodes matching the search query
5. WHEN multiple filters are active, THE Webview SHALL apply logical AND semantics (node visible only if it satisfies all filters)
6. THE Webview SHALL display the count of visible nodes relative to total nodes (e.g., "Showing 42 of 317 nodes")
7. THE displayed visible node count SHALL exactly match the number of rendered nodes

### Requirement 11: Custom Editor Provider for .sflow Files

**User Story:** As a developer, I want to save and load graph views, so that I can preserve my analysis work.

#### Acceptance Criteria

1. THE Extension_Host SHALL register a custom editor provider for .sflow file extension
2. WHEN a .sflow file is opened, THE Extension_Host SHALL load the saved graph state
3. WHEN the user saves a graph view, THE Extension_Host SHALL serialize the graph state to a .sflow file
4. THE .sflow file SHALL contain graph data in a readable format

### Requirement 12: Search and Filtering

**User Story:** As a developer working with large codebases, I want to search and filter the graph, so that I can focus on relevant code areas.

#### Acceptance Criteria

1. WHEN the user enters a search query, THE Webview SHALL filter graph nodes matching the query by name
2. WHEN search results are displayed, THE Webview SHALL highlight matching nodes and dim non-matching nodes
3. WHEN the user applies a directory filter, THE Webview SHALL show only nodes within the selected directory scope
4. THE Webview SHALL display the count of visible nodes after filtering

### Requirement 13: Node Selection and Navigation

**User Story:** As a developer, I want to select nodes and navigate to code, so that I can quickly jump to relevant files.

#### Acceptance Criteria

1. WHEN the user clicks a node, THE Webview SHALL select the node and display its properties
2. WHEN the user double-clicks a file node, THE Extension_Host SHALL open the file in the editor
3. WHEN the user double-clicks a symbol node, THE Extension_Host SHALL open the file and navigate to the symbol location
4. THE Webview SHALL maintain selection state during graph interactions

### Requirement 14: Worker Process Management

**User Story:** As a user of the extension, I want stable performance during scanning, so that my editor remains responsive.

#### Acceptance Criteria

1. THE Extension_Host SHALL spawn the Worker_Process in a separate thread on activation
2. THE Worker_Process SHALL perform all directory scanning, parsing, symbol extraction, and metric calculation
3. THE Extension_Host SHALL communicate with the Worker_Process using message passing
4. WHEN the Worker_Process is busy, THE Extension_Host SHALL queue incoming requests
5. THE Worker_Process SHALL maintain all graph data in memory with no database persistence
6. WHEN the Worker_Process memory usage exceeds 512MB, THE Extension_Host SHALL restart the Worker_Process and resume operations
7. WHEN the Worker_Process crashes, THE Extension_Host SHALL restart it automatically and resume operations
8. THE Extension_Host SHALL display Worker_Process status in the VS Code status bar

### Requirement 15: SQLite Persistent Database

**User Story:** As a developer, I want my indexed data persisted efficiently, so that I don't need to re-index on every workspace open.

#### Acceptance Criteria

1. THE Worker_Process SHALL create a SQLite_Database file in the workspace .vscode directory
2. WHEN the workspace is opened, THE Worker_Process SHALL load existing index data from the SQLite_Database
3. WHEN index data is stale, THE Worker_Process SHALL perform incremental re-indexing of changed files only
4. THE Worker_Process SHALL use Drizzle ORM for all database operations
5. WHEN the database schema changes, THE Worker_Process SHALL migrate existing data to the new schema
6. THE Extension_Host SHALL provide a command to clear and rebuild the entire index
7. THE SQLite_Database SHALL store symbols, relationships, metrics, and risk scores

### Requirement 16: AI Integration Layer

**User Story:** As a developer, I want AI-powered insights, so that I can understand and improve my code more effectively.

#### Acceptance Criteria

1. THE Extension_Host SHALL support configuration of Vertex AI Project ID, Gemini API Key, and Groq API Key
2. THE Extension_Host SHALL store API keys securely using VS Code's secret storage API
3. WHEN API keys are provided, THE Extension_Host SHALL validate them before storing
4. THE AI_Service SHALL provide fallback logic between providers (Groq → Vertex → Gemini)
5. WHEN AI_Service requests fail, THE Extension_Host SHALL retry up to 3 times with exponential backoff
6. WHEN AI_Service requests fail after retries, THE Extension_Host SHALL display user-friendly error messages
7. ALL AI features SHALL be user-triggered with no automatic code modifications
8. THE Extension_Host SHALL maintain the zero-noise philosophy with AI features available on-demand only

### Requirement 17: Risk Scoring and Detection

**User Story:** As a technical lead, I want to identify risky code areas, so that I can prioritize refactoring and code review efforts.

#### Acceptance Criteria

1. WHEN indexing is complete, THE System_Flow_Extractor SHALL calculate risk scores for all symbols based on complexity, coupling, and AI assessment
2. WHEN a function has Cyclomatic_Complexity greater than 15, THE System_Flow_Extractor SHALL flag it as high complexity risk
3. WHEN a function has Fan_In greater than 20, THE System_Flow_Extractor SHALL flag it as high coupling risk
4. WHEN the AI_Service identifies fragile code patterns, THE System_Flow_Extractor SHALL flag the symbol as fragile
5. THE Webview SHALL display risk indicators on graph nodes using color coding
6. WHEN the user filters by risk level, THE Webview SHALL show only nodes matching the selected risk threshold
7. THE SQLite_Database SHALL persist risk scores for all symbols

### Requirement 18: Blast Radius Analysis

**User Story:** As a developer planning changes, I want to understand the impact of modifying code, so that I can assess change risk before implementation.

#### Acceptance Criteria

1. WHEN the user selects a symbol for blast radius analysis, THE System_Flow_Extractor SHALL calculate all directly and indirectly dependent symbols
2. WHEN displaying blast radius, THE Webview SHALL show affected symbols with distance metrics from the origin
3. WHEN calculating blast radius, THE System_Flow_Extractor SHALL include both static dependencies and runtime call relationships
4. THE Webview SHALL display blast radius size as a numeric score and visual indicator
5. THE Webview SHALL highlight the blast radius path in the graph visualization

### Requirement 19: Technical Debt Detection

**User Story:** As a technical lead, I want to identify code smells and technical debt, so that I can maintain code quality over time.

#### Acceptance Criteria

1. WHEN the user requests technical debt analysis, THE AI_Service SHALL analyze code for common code smells and anti-patterns
2. WHEN technical debt is detected, THE System_Flow_Extractor SHALL store debt items with severity and location in the SQLite_Database
3. THE Webview SHALL display technical debt indicators on affected nodes in the graph
4. WHEN the user clicks a debt indicator, THE Webview SHALL show detailed explanation and suggested remediation
5. THE Extension_Host SHALL provide a technical debt summary view showing all detected issues grouped by severity
6. TECHNICAL debt detection SHALL be user-triggered with no automatic analysis

### Requirement 20: AI-Powered Refactoring Suggestions

**User Story:** As a developer maintaining legacy code, I want AI-suggested refactorings, so that I can improve code quality with confidence.

#### Acceptance Criteria

1. WHEN the user requests refactoring suggestions for a symbol, THE AI_Service SHALL analyze the code and propose improvements
2. WHEN generating refactoring suggestions, THE AI_Service SHALL provide before/after code diffs
3. THE Webview SHALL display refactoring suggestions with explanations of benefits and potential risks
4. WHEN the user accepts a refactoring suggestion, THE Extension_Host SHALL apply the changes to the source file
5. THE Extension_Host SHALL create an undo point before applying AI-suggested refactorings
6. REFACTORING suggestions SHALL require explicit user approval before any code modification
7. THE Extension_Host SHALL maintain the advisor-only philosophy by never automatically applying refactorings

### Requirement 21: AI-Powered Performance Optimization

**User Story:** As a developer optimizing performance, I want AI to identify bottlenecks, so that I can focus optimization efforts effectively.

#### Acceptance Criteria

1. WHEN the user requests performance analysis for a symbol, THE AI_Service SHALL identify potential performance bottlenecks
2. WHEN analyzing performance, THE AI_Service SHALL consider algorithmic complexity, memory usage, and I/O patterns
3. THE Webview SHALL display optimization suggestions with estimated performance impact
4. THE AI_Service SHALL prioritize optimization suggestions based on potential impact and implementation difficulty
5. PERFORMANCE analysis SHALL be user-triggered with no automatic analysis

### Requirement 22: Domain-Level Modeling

**User Story:** As a software architect, I want to view high-level component interactions, so that I can understand system architecture without implementation details.

#### Acceptance Criteria

1. WHEN the user activates Architecture Mode, THE Webview SHALL display only Domain-level nodes and their relationships
2. WHEN displaying Architecture Mode, THE Webview SHALL aggregate file-level and symbol-level connections into domain-level edges
3. WHEN the user clicks a Domain node, THE Webview SHALL show a summary of contained files and key symbols
4. THE AI_Service SHALL identify and label architectural patterns in Architecture Mode when requested by the user
5. THE SQLite_Database SHALL store domain groupings and relationships

### Requirement 23: AI-Powered Code Explanation

**User Story:** As a developer working with unfamiliar code, I want AI-generated explanations, so that I can understand code purpose and logic quickly.

#### Acceptance Criteria

1. WHEN the user requests explanation for a symbol, THE AI_Service SHALL generate a natural language description of its purpose and logic
2. WHEN generating explanations, THE AI_Service SHALL include context from surrounding code and dependencies
3. THE Webview SHALL display explanations in a readable format with code references
4. WHEN explanation generation fails, THE Extension_Host SHALL display an error message and allow retry
5. CODE explanations SHALL be user-triggered with no automatic analysis

### Requirement 24: Configuration

**User Story:** As a developer setting up the extension, I want to configure scanning behavior, so that I can customize what gets analyzed.

#### Acceptance Criteria

1. THE Extension_Host SHALL allow users to configure file exclusion patterns
2. THE Extension_Host SHALL allow users to configure supported file types
3. THE Extension_Host SHALL store configuration in VS Code settings
4. WHEN configuration changes, THE Extension_Host SHALL re-scan the workspace
5. THE Extension_Host SHALL prompt the user to configure AI service credentials on first activation
6. THE Extension_Host SHALL allow users to configure indexing exclusion patterns for directories and file types

### Requirement 25: Error Handling

**User Story:** As a developer, I want clear error messages, so that I can diagnose issues quickly.

#### Acceptance Criteria

1. WHEN an error occurs, THE Extension_Host SHALL log the error with context
2. WHEN parsing fails for a file, THE System_Flow_Extractor SHALL log the error and continue scanning other files
3. WHEN the Webview fails to render, THE Extension_Host SHALL display an error message with recovery options
4. THE Extension_Host SHALL provide a command to export diagnostic logs
5. WHEN the Worker_Process encounters an error, THE Extension_Host SHALL log the error and allow recovery
6. WHEN the Worker_Process crashes, THE Extension_Host SHALL log the crash reason before restarting
7. WHEN AI_Service requests fail, THE Extension_Host SHALL display user-friendly error messages with retry options
8. WHEN database operations fail, THE Worker_Process SHALL rollback transactions and log the error
