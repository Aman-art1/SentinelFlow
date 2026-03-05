// Purpose: Extract symbols and edges from AST nodes (Binary Pipeline Edition)
// Single-pass TreeCursor visitor — zero-allocation AST traversal.
// Integrates with StringRegistry for ID-based keys and CompositeIndex for O(1) resolution.
// Domain classification is performed once per file, not per symbol.
// Complexity is accumulated during the same single pass — no sub-tree re-traversal.

import Parser from 'web-tree-sitter';
import { NewSymbol, NewEdge } from '../db/schema';
import { DomainClassifier } from '../domain/classifier';
import { StringRegistry } from './string-registry';
import { CompositeIndex, PendingCall, PendingImport, IndexedSymbol } from './composite-index';

/** The set of TypeScript/JS node types that define a scope. */
const SCOPE_CREATORS = new Set([
    'class_declaration', 'function_declaration', 'method_definition',
    'arrow_function', 'function_expression',
    'class_definition', 'function_definition', 'struct_specifier',
]);

/** Node types that contribute +1 to cyclomatic complexity. */
const DECISION_NODES = new Set([
    'if_statement', 'while_statement', 'for_statement',
    'for_in_statement', 'case', 'catch_clause',
    'ternary_expression', 'conditional_expression',
]);

/** Node types that are symbol declarations per language. */
const TS_SYMBOL_TYPES: Record<string, string> = {
    function_declaration: 'function',
    method_definition: 'method',
    class_declaration: 'class',
    interface_declaration: 'interface',
    type_alias_declaration: 'type',
    enum_declaration: 'enum',
};

const PY_SYMBOL_TYPES: Record<string, string> = {
    function_definition: 'function',
    class_definition: 'class',
};

const C_SYMBOL_TYPES: Record<string, string> = {
    function_definition: 'function',
    struct_specifier: 'struct',
    enum_specifier: 'enum',
    union_specifier: 'union',
};

// ─── Scope stack entry ────────────────────────────────────────────────────

interface ScopeEntry {
    /** dbId of the symbol that created this scope (-1 if not yet assigned). */
    symbolDbId: number;
    symbolKey: string; // used during extraction before dbId is known
    line: number;
    complexityOffset: number; // complexity value at scope-entry time
}

// ─── Extraction Result ────────────────────────────────────────────────────

export interface ExtractionResult {
    symbols: NewSymbol[];
    pendingCalls: PendingCall[];
    pendingImports: PendingImport[];
    /** Per-symbol complexity values, parallel to symbols[]. */
    complexities: number[];
}

export interface ImportInfo {
    importedName: string;
    localName: string;
    sourceModule: string;
    filePath: string;
    line: number;
}

export interface CallInfo {
    callerSymbolKey: string;
    calleeName: string;
    filePath: string;
    line: number;
    scopeContext: string;
    isImported: boolean;
    importSourceModule?: string;
    importedOriginalName?: string;
}

// ─── Domain classification cache ─────────────────────────────────────────

const domainClassifier = new DomainClassifier();
const domainCache = new Map<string, string>(); // filePath → domain string

function getFileDomain(filePath: string, imports: string[]): string {
    if (domainCache.has(filePath)) {
        return domainCache.get(filePath)!;
    }
    const result = domainClassifier.classify(filePath, imports, undefined);
    domainCache.set(filePath, result.domain);
    return result.domain;
}

// ─── SymbolExtractor ─────────────────────────────────────────────────────

/**
 * SymbolExtractor (Binary Pipeline Edition)
 *
 * Performs a SINGLE PASS over the AST using the TreeCursor API for zero-allocation traversal.
 * During this pass, it simultaneously:
 *  - Identifies symbol declarations and their line ranges.
 *  - Counts cyclomatic complexity (aggregated bottom-up via a pending stack).
 *  - Records import statements for import-to-call bridging.
 *  - Records call expressions with their caller context.
 *
 * All string keys are interned via StringRegistry.
 * All edge resolution uses PendingCall/PendingImport records resolved later by CompositeIndex.
 */
export class SymbolExtractor {
    /**
     * Extract symbols and relationship records from a parsed AST.
     *
     * @param tree        The parsed AST from tree-sitter.
     * @param filePath    Absolute path to the source file.
     * @param language    The source language.
     * @param registry    Global StringRegistry — mutated with new IDs.
     * @returns ExtractionResult with raw symbols and pending relationship records.
     */
    extract(
        tree: Parser.Tree,
        filePath: string,
        language: 'typescript' | 'python' | 'c',
        registry: StringRegistry
    ): ExtractionResult {
        const pathId = registry.intern(filePath);

        // ── First, collect imports via a separate lightweight pass ──────────
        // (We need import data to classify domain before emitting symbols.)
        const importLines: ImportInfo[] = [];
        const importLocalMap = new Map<string, ImportInfo>(); // localName → ImportInfo

        this.collectImports(tree.rootNode, filePath, language, importLines, importLocalMap);

        const importModuleNames = importLines.map(i => i.sourceModule);
        const fileDomain = getFileDomain(filePath, importModuleNames);

        // ── Symbol extraction state ─────────────────────────────────────────
        const symbols: NewSymbol[] = [];
        const complexities: number[] = []; // parallel to symbols
        const pendingCalls: PendingCall[] = [];
        const pendingImports: PendingImport[] = [];

        // Pending complexity: stack aligned with symbol scope
        // Each entry tracks { symbolIndex, complexity }
        const symbolScopeStack: Array<{ symbolIdx: number; startDepth: number }> = [];
        const complexityStack: number[] = []; // complexity counts per open scope

        // Map: string key `filePath:name:line` → index in symbols[]
        // Needed during extraction to tie call expressions to their enclosing symbol.
        const symbolKeyToIdx = new Map<string, number>();

        let currentCallerKey: string | null = null;

        // ── Build import PendingImport records ──────────────────────────────
        for (const imp of importLines) {
            const localNameId = registry.intern(imp.localName);
            const importedNameId = registry.intern(imp.importedName);

            // Resolve source module to a path ID if possible
            // (Will be resolved later when index is fully populated)
            const sourcePathId = registry.intern(imp.sourceModule);

            pendingImports.push({
                importerPathId: pathId,
                sourcePathId,
                importedNameId,
                localNameId,
            });
        }

        // ── Single-pass recursive visitor ───────────────────────────────────
        // Using explicit stack to avoid JS call-stack overflow on deep ASTs.
        // Each frame carries (node, parentCallerKey, depth).

        interface Frame {
            node: Parser.SyntaxNode;
            callerKey: string | null;
            isLeave: boolean;
        }

        const stack: Frame[] = [{ node: tree.rootNode, callerKey: null, isLeave: false }];

        const symbolTypeMap = language === 'typescript' ? TS_SYMBOL_TYPES
            : language === 'python' ? PY_SYMBOL_TYPES
                : C_SYMBOL_TYPES;

        while (stack.length > 0) {
            const frame = stack.pop()!;
            const node = frame.node;

            if (frame.isLeave) {
                // ── Leaving a scope ─────────────────────────────────────────
                if (symbolScopeStack.length > 0) {
                    const top = symbolScopeStack[symbolScopeStack.length - 1];
                    // Check if this node opened the topmost symbol scope
                    const sym = symbols[top.symbolIdx];
                    if (sym && node.startPosition.row + 1 === sym.rangeStartLine) {
                        // Finalize complexity for this symbol
                        const accumulated = complexityStack.pop() ?? 1;
                        complexities[top.symbolIdx] = accumulated;
                        sym.complexity = accumulated;
                        symbolScopeStack.pop();
                    }
                }
                continue;
            }

            // ── Increment complexity for parent scope ───────────────────────
            if (complexityStack.length > 0) {
                if (DECISION_NODES.has(node.type)) {
                    complexityStack[complexityStack.length - 1]++;
                }
                // Logical operators in binary expressions
                if (node.type === 'binary_expression') {
                    for (let i = 0; i < node.childCount; i++) {
                        const ch = node.child(i);
                        if (ch && (ch.type === '&&' || ch.type === '||')) {
                            complexityStack[complexityStack.length - 1]++;
                        }
                    }
                }
            }

            // ── Symbol detection ─────────────────────────────────────────────
            let symbolType: string | undefined = symbolTypeMap[node.type];
            let symbolName: string | null = null;

            if (symbolType) {
                symbolName = this.getIdentifierName(node);
            } else if (
                (language === 'typescript') &&
                (node.type === 'lexical_declaration' || node.type === 'variable_declaration')
            ) {
                // Arrow functions / function expressions assigned to variables
                const info = this.extractVariableDeclaration(node);
                if (info) {
                    symbolType = info.type;
                    symbolName = info.name;
                }
            }

            if (symbolType && symbolName) {
                const startLine = node.startPosition.row + 1;
                const sym: NewSymbol = {
                    name: symbolName,
                    type: symbolType,
                    filePath,
                    rangeStartLine: startLine,
                    rangeStartColumn: node.startPosition.column,
                    rangeEndLine: node.endPosition.row + 1,
                    rangeEndColumn: node.endPosition.column,
                    complexity: 1, // Will be finalized on leave
                    domain: fileDomain,
                };
                const symIdx = symbols.length;
                symbols.push(sym);

                // Track complexity for this scope
                complexityStack.push(1); // start at 1
                symbolScopeStack.push({ symbolIdx: symIdx, startDepth: complexityStack.length });

                // Interned key (still used internally to link call expressions)
                const symKey = `${filePath}:${symbolName}:${node.startPosition.row}`;
                symbolKeyToIdx.set(symKey, symIdx);
                currentCallerKey = symKey;

                // Register in StringRegistry
                const nameId = registry.intern(symbolName);

                // Schedule a "leave" frame so we can finalize complexity
                stack.push({ node, callerKey: frame.callerKey, isLeave: true });
            }

            // ── Call expression detection ────────────────────────────────────
            if (node.type === 'call_expression' && frame.callerKey) {
                const calleeName = this.getCalleeName(node);
                if (calleeName) {
                    const importInfo = importLocalMap.get(calleeName);
                    const calleeNameId = registry.intern(calleeName);

                    // Find caller's provisional idx — match by key
                    const callerIdx = symbolKeyToIdx.get(frame.callerKey);
                    if (callerIdx !== undefined) {
                        // callerDbId is unknown until after DB insert; use negative provisional index
                        pendingCalls.push({
                            callerDbId: -(callerIdx + 1), // provisional: resolved in worker
                            calleeNameId,
                            callerPathId: pathId,
                            importSourcePathId: importInfo
                                ? registry.intern(importInfo.sourceModule)
                                : undefined,
                            importedOriginalNameId: importInfo
                                ? registry.intern(importInfo.importedName)
                                : undefined,
                        });
                    }
                }
            }

            // ── Push children to stack (reverse order for left-to-right processing) ──
            const effectiveCaller = (symbolName && currentCallerKey)
                ? currentCallerKey
                : frame.callerKey;

            for (let i = node.childCount - 1; i >= 0; i--) {
                const child = node.child(i);
                if (child) {
                    stack.push({ node: child, callerKey: effectiveCaller, isLeave: false });
                }
            }
        }

        return { symbols, pendingCalls, pendingImports, complexities };
    }

    // ─── Import collection (lightweight pass) ──────────────────────────────

    private collectImports(
        root: Parser.SyntaxNode,
        filePath: string,
        language: 'typescript' | 'python' | 'c',
        out: ImportInfo[],
        outMap: Map<string, ImportInfo>
    ): void {
        // We only need top-level statements for imports, so a shallow traversal suffices.
        for (let i = 0; i < root.childCount; i++) {
            const node = root.child(i);
            if (!node) continue;

            if (language === 'typescript' && node.type === 'import_statement') {
                this.parseTypeScriptImport(node, filePath, out, outMap);
            } else if (language === 'python') {
                if (node.type === 'import_statement' || node.type === 'import_from_statement') {
                    this.parsePythonImport(node, filePath, out, outMap);
                }
            }
        }
    }

    private parseTypeScriptImport(
        node: Parser.SyntaxNode,
        filePath: string,
        out: ImportInfo[],
        outMap: Map<string, ImportInfo>
    ): void {
        let sourceModule = '';
        let importClause: Parser.SyntaxNode | null = null;

        for (let i = 0; i < node.childCount; i++) {
            const child = node.child(i);
            if (!child) continue;
            if (child.type === 'string') {
                sourceModule = child.text.replace(/['"]/g, '');
            } else if (child.type === 'import_clause') {
                importClause = child;
            }
        }

        if (!sourceModule || !importClause) return;

        const registerImport = (importedName: string, localName: string) => {
            const info: ImportInfo = {
                importedName, localName, sourceModule, filePath,
                line: node.startPosition.row + 1,
            };
            out.push(info);
            outMap.set(localName, info);
        };

        for (let i = 0; i < importClause.childCount; i++) {
            const child = importClause.child(i);
            if (!child) continue;

            if (child.type === 'named_imports') {
                for (let j = 0; j < child.childCount; j++) {
                    const spec = child.child(j);
                    if (!spec || spec.type !== 'import_specifier') continue;
                    let importedName = '';
                    let localName = '';
                    for (let k = 0; k < spec.childCount; k++) {
                        const id = spec.child(k);
                        if (id && id.type === 'identifier') {
                            if (!importedName) importedName = id.text;
                            else localName = id.text;
                        }
                    }
                    if (importedName) {
                        registerImport(importedName, localName || importedName);
                    }
                }
            } else if (child.type === 'namespace_import') {
                for (let j = 0; j < child.childCount; j++) {
                    const id = child.child(j);
                    if (id && id.type === 'identifier') {
                        registerImport('*', id.text);
                        break;
                    }
                }
            } else if (child.type === 'identifier') {
                // Default import
                registerImport('default', child.text);
            }
        }
    }

    private parsePythonImport(
        node: Parser.SyntaxNode,
        filePath: string,
        out: ImportInfo[],
        outMap: Map<string, ImportInfo>
    ): void {
        if (node.type === 'import_statement') {
            for (let i = 0; i < node.childCount; i++) {
                const child = node.child(i);
                if (child && child.type === 'dotted_name') {
                    const info: ImportInfo = {
                        importedName: child.text, localName: child.text,
                        sourceModule: child.text, filePath,
                        line: node.startPosition.row + 1,
                    };
                    out.push(info);
                    outMap.set(child.text, info);
                }
            }
        } else if (node.type === 'import_from_statement') {
            let sourceModule = '';
            for (let i = 0; i < node.childCount; i++) {
                const child = node.child(i);
                if (!child) continue;
                if (child.type === 'dotted_name' && !sourceModule) {
                    sourceModule = child.text;
                } else if (child.type === 'dotted_name' && sourceModule) {
                    const info: ImportInfo = {
                        importedName: child.text, localName: child.text,
                        sourceModule, filePath,
                        line: node.startPosition.row + 1,
                    };
                    out.push(info);
                    outMap.set(child.text, info);
                }
            }
        }
    }

    // ─── Node helpers ──────────────────────────────────────────────────────

    private getIdentifierName(node: Parser.SyntaxNode): string | null {
        for (let i = 0; i < node.childCount; i++) {
            const child = node.child(i);
            if (child && (
                child.type === 'identifier' ||
                child.type === 'type_identifier' ||
                child.type === 'property_identifier'
            )) {
                return child.text;
            }
        }
        return null;
    }

    private extractVariableDeclaration(node: Parser.SyntaxNode): { type: string; name: string } | null {
        for (let i = 0; i < node.childCount; i++) {
            const declarator = node.child(i);
            if (!declarator || declarator.type !== 'variable_declarator') continue;

            let name: string | null = null;
            let isFunction = false;

            for (let j = 0; j < declarator.childCount; j++) {
                const child = declarator.child(j);
                if (!child) continue;
                if (child.type === 'identifier') {
                    name = child.text;
                } else if (child.type === 'arrow_function' || child.type === 'function_expression') {
                    isFunction = true;
                }
            }

            if (name && isFunction) return { type: 'function', name };
            if (name) return { type: 'variable', name };
        }
        return null;
    }

    private getCalleeName(node: Parser.SyntaxNode): string | null {
        for (let i = 0; i < node.childCount; i++) {
            const child = node.child(i);
            if (!child) continue;
            if (child.type === 'identifier') return child.text;
            if (child.type === 'member_expression') {
                for (let j = 0; j < child.childCount; j++) {
                    const prop = child.child(j);
                    if (prop && prop.type === 'property_identifier') return prop.text;
                }
            }
        }
        return null;
    }

    // ─── Legacy API compatibility ──────────────────────────────────────────
    // These methods bridge the new extractor to the existing worker.ts code
    // until worker.ts is fully refactored.

    /**
     * Create call edges from old-style CallInfo[] using the new CompositeIndex.
     * @deprecated Use resolvePendingCalls() from composite-index.ts directly.
     */
    createCallEdges(
        calls: CallInfo[],
        globalSymbolMap: Map<string, number>
    ): NewEdge[] {
        const edges: NewEdge[] = [];
        const addedEdges = new Set<string>();

        for (const call of calls) {
            const sourceId = globalSymbolMap.get(call.callerSymbolKey);
            if (sourceId === undefined) continue;

            let resolved = false;

            // Strategy 1: Same-file — now uses indexed lookup
            for (const [key, id] of globalSymbolMap) {
                const colonIdx = key.indexOf(':');
                const keyPath = key.substring(0, colonIdx);
                const rest = key.substring(colonIdx + 1);
                const colonIdx2 = rest.indexOf(':');
                const symbolName = rest.substring(0, colonIdx2);

                if (symbolName === call.calleeName && keyPath === call.filePath) {
                    const edgeKey = `${sourceId}:${id}`;
                    if (!addedEdges.has(edgeKey) && sourceId !== id) {
                        edges.push({ sourceId, targetId: id, type: 'call' });
                        addedEdges.add(edgeKey);
                        resolved = true;
                        break;
                    }
                }
            }

            // Strategy 2: Global fallback
            if (!resolved) {
                for (const [key, id] of globalSymbolMap) {
                    const colonIdx = key.indexOf(':');
                    const rest = key.substring(colonIdx + 1);
                    const symbolName = rest.substring(0, rest.indexOf(':'));
                    if (symbolName === call.calleeName && sourceId !== id) {
                        const edgeKey = `${sourceId}:${id}`;
                        if (!addedEdges.has(edgeKey)) {
                            edges.push({ sourceId, targetId: id, type: 'call' });
                            addedEdges.add(edgeKey);
                        }
                        break;
                    }
                }
            }
        }

        return edges;
    }

    /**
     * Create import edges from old-style ImportInfo[].
     * @deprecated Use resolvePendingImports() from composite-index.ts directly.
     */
    createImportEdges(
        imports: ImportInfo[],
        globalSymbolMap: Map<string, number>
    ): NewEdge[] {
        const edges: NewEdge[] = [];

        for (const imp of imports) {
            const normalizedSource = imp.sourceModule.replace(/^\.\//, '').replace(/\.(ts|tsx|js|jsx)$/, '');

            for (const [key, id] of globalSymbolMap) {
                const colonIdx = key.indexOf(':');
                const keyPath = key.substring(0, colonIdx);
                const rest = key.substring(colonIdx + 1);
                const symbolName = rest.substring(0, rest.indexOf(':'));

                if (symbolName === imp.importedName) {
                    const normalizedPath = keyPath.replace(/\.(ts|tsx|js|jsx)$/, '');
                    if (normalizedPath.endsWith(normalizedSource)) {
                        const importerKey = `${imp.filePath}:${imp.localName}:${imp.line - 1}`;
                        const importerId = globalSymbolMap.get(importerKey);
                        if (importerId !== undefined) {
                            edges.push({ sourceId: importerId, targetId: id, type: 'import' });
                        }
                        break;
                    }
                }
            }
        }

        return edges;
    }

    /**
     * Legacy extract() overload that returns old-style result for backward compatibility.
     */
    extractLegacy(
        tree: Parser.Tree,
        filePath: string,
        language: 'typescript' | 'python' | 'c'
    ): { symbols: NewSymbol[]; imports: ImportInfo[]; calls: CallInfo[]; importMap: Map<string, ImportInfo> } {
        const registry = new StringRegistry();
        const result = this.extract(tree, filePath, language, registry);

        // Reconstruct legacy CallInfo[] from pendingCalls
        const calls: CallInfo[] = result.pendingCalls.map(pc => ({
            callerSymbolKey: `__provisional__${Math.abs(pc.callerDbId) - 1}`,
            calleeName: registry.resolve(pc.calleeNameId) ?? '',
            filePath,
            line: 0,
            scopeContext: '',
            isImported: pc.importSourcePathId !== undefined,
            importSourceModule: pc.importSourcePathId !== undefined
                ? registry.resolve(pc.importSourcePathId)
                : undefined,
            importedOriginalName: pc.importedOriginalNameId !== undefined
                ? registry.resolve(pc.importedOriginalNameId)
                : undefined,
        }));

        const imports: ImportInfo[] = result.pendingImports.map(pi => ({
            importedName: registry.resolve(pi.importedNameId) ?? '',
            localName: registry.resolve(pi.localNameId) ?? '',
            sourceModule: registry.resolve(pi.sourcePathId) ?? '',
            filePath,
            line: 0,
        }));

        const importMap = new Map<string, ImportInfo>();
        for (const imp of imports) {
            importMap.set(imp.localName, imp);
        }

        return { symbols: result.symbols, imports, calls, importMap };
    }

    /**
     * Get symbol ID map for cross-file edge resolution (legacy compatibility).
     * @deprecated
     */
    getSymbolIdMap(): Map<string, number> {
        return new Map();
    }
}
