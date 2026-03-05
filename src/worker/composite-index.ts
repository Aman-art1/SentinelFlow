// Purpose: O(1) symbol lookup index for the binary indexing pipeline.
// Replaces Map<string, number> globalSymbolMap with BigInt-keyed composite lookups
// and pre-built secondary indexes for name-only and path-only searches.

/**
 * A lightweight symbol record stored in the index.
 * Uses integer IDs throughout — no strings in the hot path.
 */
export interface IndexedSymbol {
    /** Globally unique database row ID for this symbol. */
    dbId: number;
    /** Interned ID for the symbol name string. */
    nameId: number;
    /** Interned ID for the file path string. */
    pathId: number;
    /** Source line (1-indexed). */
    line: number;
    /** Symbol type ("function", "class", etc.) — stored as interned ID. */
    typeId: number;
}

/**
 * CompositeIndex
 *
 * Provides three lookup strategies, all O(1) or O(k):
 *
 *  1. Exact (path + name)     → O(1) via BigInt composite key
 *  2. By name across all files → O(1) via nameId → dbId[]
 *  3. By path (all in a file)  → O(1) via pathId → dbId[]
 *
 * Construction is O(N) — iterate once and build all three indexes simultaneously.
 */
export class CompositeIndex {
    /**
     * Primary index: composite(pathId, nameId) → dbId
     * Key = BigInt(pathId) << 32n | BigInt(nameId)
     */
    private composite: Map<bigint, number> = new Map();

    /**
     * Secondary index: nameId → dbId[]
     * Used for global-fallback resolution when we only know the callee name.
     */
    private byName: Map<number, number[]> = new Map();

    /**
     * Secondary index: pathId → dbId[]
     * Used for same-file resolution: all symbols in a given file.
     */
    private byPath: Map<number, number[]> = new Map();

    /**
     * All registered symbols. Indexed by dbId for fast retrieval.
     */
    private symbols: Map<number, IndexedSymbol> = new Map();

    // ─── Composite key helper ─────────────────────────────────────────────

    private static makeKey(pathId: number, nameId: number): bigint {
        return (BigInt(pathId) << 32n) | BigInt(nameId);
    }

    // ─── Insertion ────────────────────────────────────────────────────────

    /**
     * Register a symbol into all three indexes.
     * Call once per symbol immediately after the DB insert returns the dbId.
     */
    register(sym: IndexedSymbol): void {
        const key = CompositeIndex.makeKey(sym.pathId, sym.nameId);

        // Primary index — most-specific resolution wins. First writer wins.
        if (!this.composite.has(key)) {
            this.composite.set(key, sym.dbId);
        }

        // By-name secondary
        let byNameList = this.byName.get(sym.nameId);
        if (!byNameList) {
            byNameList = [];
            this.byName.set(sym.nameId, byNameList);
        }
        byNameList.push(sym.dbId);

        // By-path secondary
        let byPathList = this.byPath.get(sym.pathId);
        if (!byPathList) {
            byPathList = [];
            this.byPath.set(sym.pathId, byPathList);
        }
        byPathList.push(sym.dbId);

        this.symbols.set(sym.dbId, sym);
    }

    // ─── Lookup ───────────────────────────────────────────────────────────

    /**
     * O(1) exact lookup by (pathId, nameId).
     * Returns the dbId, or undefined if not found.
     */
    lookupExact(pathId: number, nameId: number): number | undefined {
        return this.composite.get(CompositeIndex.makeKey(pathId, nameId));
    }

    /**
     * O(1) lookup all symbols with a given nameId across all files.
     * Returns a (possibly empty) array of dbIds.
     */
    lookupByName(nameId: number): ReadonlyArray<number> {
        return this.byName.get(nameId) ?? [];
    }

    /**
     * O(1) lookup all symbols in a given file (by pathId).
     * Returns a (possibly empty) array of dbIds.
     */
    lookupByPath(pathId: number): ReadonlyArray<number> {
        return this.byPath.get(pathId) ?? [];
    }

    /**
     * Retrieve the full IndexedSymbol record for a given dbId.
     * Returns undefined if not registered.
     */
    getSymbol(dbId: number): IndexedSymbol | undefined {
        return this.symbols.get(dbId);
    }

    // ─── Resolution helpers (mirrors old createCallEdges strategies) ──────

    /**
     * STRATEGY 1: Same-file resolution.
     * Find the first symbol in the same file that has a matching nameId.
     * O(k) where k = number of symbols in the file (typically small).
     */
    resolveInFile(callerPathId: number, calleeNameId: number, excludeDbId?: number): number | undefined {
        const inFile = this.byPath.get(callerPathId);
        if (!inFile) return undefined;

        for (const dbId of inFile) {
            if (dbId !== excludeDbId) {
                const sym = this.symbols.get(dbId);
                if (sym && sym.nameId === calleeNameId) {
                    return dbId;
                }
            }
        }
        return undefined;
    }

    /**
     * STRATEGY 2: Exact cross-file resolution (import bridge).
     * O(1) — use pathId of the source module and nameId of the imported symbol.
     */
    resolveImport(sourcePathId: number, importedNameId: number): number | undefined {
        return this.lookupExact(sourcePathId, importedNameId);
    }

    /**
     * STRATEGY 3: Global name fallback.
     * Returns all dbIds matching the name, excluding the caller itself.
     * O(1) — returns byName list.
     */
    resolveFallback(calleeNameId: number, excludeDbId?: number): ReadonlyArray<number> {
        const matches = this.byName.get(calleeNameId) ?? [];
        if (excludeDbId === undefined) return matches;
        return matches.filter(id => id !== excludeDbId);
    }

    // ─── Stats ────────────────────────────────────────────────────────────

    get symbolCount(): number {
        return this.symbols.size;
    }

    get uniqueNames(): number {
        return this.byName.size;
    }

    get uniquePaths(): number {
        return this.byPath.size;
    }
}

// ─── Pending resolution records ────────────────────────────────────────────

/**
 * A call relationship recorded during extraction.
 * All fields use integer IDs — no strings.
 */
export interface PendingCall {
    /** dbId of the calling symbol. */
    callerDbId: number;
    /** Interned ID of the callee name. */
    calleeNameId: number;
    /** Interned ID of the file where the call was made. */
    callerPathId: number;
    /** If the callee is known to be imported, the source file pathId. */
    importSourcePathId?: number;
    /** If imported, the original (pre-alias) name ID. */
    importedOriginalNameId?: number;
}

/**
 * An import relationship recorded during extraction.
 * All fields use integer IDs — no strings.
 */
export interface PendingImport {
    /** Interned ID of the importing file path. */
    importerPathId: number;
    /** Interned ID of the source module path. */
    sourcePathId: number;
    /** Interned ID of the imported symbol name. */
    importedNameId: number;
    /** Interned ID of the local alias name (may equal importedNameId). */
    localNameId: number;
}

/**
 * Resolve all pending calls using the CompositeIndex.
 * Returns an array of (callerDbId, calleeDbId) pairs.
 *
 * Replaces the old O(N²) `createCallEdges` loop with three O(1) strategies.
 */
export function resolvePendingCalls(
    pending: PendingCall[],
    index: CompositeIndex
): Array<{ sourceId: number; targetId: number }> {
    const edges: Array<{ sourceId: number; targetId: number }> = [];
    const addedEdges = new Set<bigint>(); // dedup: BigInt(source) << 32n | BigInt(target)

    const addEdge = (sourceId: number, targetId: number) => {
        const key = (BigInt(sourceId) << 32n) | BigInt(targetId);
        if (!addedEdges.has(key) && sourceId !== targetId) {
            addedEdges.add(key);
            edges.push({ sourceId, targetId });
        }
    };

    for (const call of pending) {
        let resolved = false;

        // STRATEGY 1: Import bridge — exact O(1) cross-file lookup
        if (call.importSourcePathId !== undefined) {
            const nameId = call.importedOriginalNameId ?? call.calleeNameId;
            const targetDbId = index.resolveImport(call.importSourcePathId, nameId);
            if (targetDbId !== undefined) {
                addEdge(call.callerDbId, targetDbId);
                resolved = true;
            }
        }

        // STRATEGY 2: Same-file resolution — O(k) where k is file size
        if (!resolved) {
            const targetDbId = index.resolveInFile(call.callerPathId, call.calleeNameId, call.callerDbId);
            if (targetDbId !== undefined) {
                addEdge(call.callerDbId, targetDbId);
                resolved = true;
            }
        }

        // STRATEGY 3: Global name fallback — O(1) then take first
        if (!resolved) {
            const candidates = index.resolveFallback(call.calleeNameId, call.callerDbId);
            if (candidates.length > 0) {
                addEdge(call.callerDbId, candidates[0]);
            }
        }
    }

    return edges;
}

/**
 * Resolve all pending imports using the CompositeIndex.
 * Returns an array of import edge (sourceId → targetId) pairs.
 */
export function resolvePendingImports(
    pending: PendingImport[],
    index: CompositeIndex
): Array<{ sourceId: number; targetId: number }> {
    const edges: Array<{ sourceId: number; targetId: number }> = [];

    for (const imp of pending) {
        // Look up the importing file's first symbol as the "importer" proxy
        const importerSymbols = index.lookupByPath(imp.importerPathId);
        if (importerSymbols.length === 0) continue;

        // Find the specific imported symbol in the source module
        const targetDbId = index.resolveImport(imp.sourcePathId, imp.importedNameId);
        if (targetDbId === undefined) continue;

        // Use the first symbol in the importer file as the edge source
        const importerId = importerSymbols[0];
        if (importerId !== targetDbId) {
            edges.push({ sourceId: importerId, targetId: targetDbId });
        }
    }

    return edges;
}
