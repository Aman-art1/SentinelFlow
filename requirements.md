# Requirements Document: SentinelFlow

## Introduction

SentinelFlow is a VS Code extension that provides system flow visualization and architectural insight. The extension is an advisor-only tool that explains architectural risk without modifying code. It uses Tree-sitter for parsing, in-memory graph models for analysis, and React Flow for interactive visualization. SentinelFlow follows a zero-noise philosophy with no forced warnings or colored squiggles.

Phase 1 focuses on the System Flow Extractor: scanning directories, extracting symbols and relationships, calculating basic metrics, and visualizing the codebase as an interactive graph.

## Glossary

- **Extension_Host**: The main VS Code extension process responsible for orchestration and UI integration
- **System_Flow_Extractor**: Component that scans directories, parses files, extracts symbols, and builds relationship graphs
- **Webview**: React-based renderer process providing interactive visualization
- **Symbol**: A code entity such as a function, class, variable, or interface
- **Graph**: Visual representation of code structure showing relationships between entities
- **Fan_In**: Number of incoming calls or dependencies to a code entity
- **Fan_Out**: Number of outgoing calls or dependencies from a code entity
- **Tree_Sitter**: Parsing library used for extracting code structure
- **Semantic_Zoom**: Hierarchical aggregation allowing users to view code at different levels of detail
- **Coupling_Heat**: Visual indicator of coupling intensity based on Fan-In and Fan-Out

## Requirements

### Requirement 1: Directory and File Scanning

**User Story:** As a developer, I want the extension to scan my workspace, so that I can visualize the codebase structure.

#### Acceptance Criteria

1. WHEN a workspace is opened, THE System_Flow_Extractor SHALL scan all supported file types in the workspace
2. WHEN a file is scanned, THE System_Flow_Extractor SHALL parse it using Tree_Sitter to extract symbols and relationships
3. THE System_Flow_Extractor SHALL build an in-memory graph model of the codebase
4. THE Extension_Host SHALL communicate with the Webview using VS Code messaging protocol

### Requirement 2: Symbol Extraction

**User Story:** As a developer, I want the extension to identify functions and classes, so that I can understand code structure.

#### Acceptance Criteria

1. WHEN a file is parsed, THE System_Flow_Extractor SHALL extract all functions, classes, variables, and interfaces
2. WHEN symbols are extracted, THE System_Flow_Extractor SHALL capture their location (file path, start line, end line)
3. THE System_Flow_Extractor SHALL store extracted symbols in an in-memory data structure

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

### Requirement 8: Custom Editor Provider for .sflow Files

**User Story:** As a developer, I want to save and load graph views, so that I can preserve my analysis work.

#### Acceptance Criteria

1. THE Extension_Host SHALL register a custom editor provider for .sflow file extension
2. WHEN a .sflow file is opened, THE Extension_Host SHALL load the saved graph state
3. WHEN the user saves a graph view, THE Extension_Host SHALL serialize the graph state to a .sflow file
4. THE .sflow file SHALL contain graph data in a readable format

### Requirement 9: Search and Filtering

**User Story:** As a developer working with large codebases, I want to search and filter the graph, so that I can focus on relevant code areas.

#### Acceptance Criteria

1. WHEN the user enters a search query, THE Webview SHALL filter graph nodes matching the query by name
2. WHEN search results are displayed, THE Webview SHALL highlight matching nodes and dim non-matching nodes
3. WHEN the user applies a directory filter, THE Webview SHALL show only nodes within the selected directory scope
4. THE Webview SHALL display the count of visible nodes after filtering

### Requirement 10: Node Selection and Navigation

**User Story:** As a developer, I want to select nodes and navigate to code, so that I can quickly jump to relevant files.

#### Acceptance Criteria

1. WHEN the user clicks a node, THE Webview SHALL select the node and display its properties
2. WHEN the user double-clicks a file node, THE Extension_Host SHALL open the file in the editor
3. WHEN the user double-clicks a symbol node, THE Extension_Host SHALL open the file and navigate to the symbol location
4. THE Webview SHALL maintain selection state during graph interactions

### Requirement 11: Configuration

**User Story:** As a developer setting up the extension, I want to configure scanning behavior, so that I can customize what gets analyzed.

#### Acceptance Criteria

1. THE Extension_Host SHALL allow users to configure file exclusion patterns
2. THE Extension_Host SHALL allow users to configure supported file types
3. THE Extension_Host SHALL store configuration in VS Code settings
4. WHEN configuration changes, THE Extension_Host SHALL re-scan the workspace

### Requirement 12: Error Handling

**User Story:** As a developer, I want clear error messages, so that I can diagnose issues quickly.

#### Acceptance Criteria

1. WHEN an error occurs, THE Extension_Host SHALL log the error with context
2. WHEN parsing fails for a file, THE System_Flow_Extractor SHALL log the error and continue scanning other files
3. WHEN the Webview fails to render, THE Extension_Host SHALL display an error message with recovery options
4. THE Extension_Host SHALL provide a command to export diagnostic logs
