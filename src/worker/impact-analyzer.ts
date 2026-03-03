// Purpose: Analyze change impact for a given symbol
// Walks the dependency graph to compute the "blast radius" of a change
// Used to highlight affected nodes in the webview when user selects impact prediction

import { CodeIndexDatabase } from '../db/database';

/**
 * An affected node in the impact analysis
 */
export interface ImpactNode {
    symbolId: number;
    name: string;
    filePath: string;
    depth: number;       // Distance from the changed node (1 = direct dependent)
    impactType: 'direct' | 'transitive';
}

/**
 * Result of an impact analysis
 */
export interface ImpactResult {
    sourceId: number;
    sourceName: string;
    affected: ImpactNode[];
    totalAffected: number;
    maxDepth: number;
    riskLevel: 'low' | 'medium' | 'high';
}

/**
 * Impact Analyzer
 * 
 * Given a symbol, walks the incoming edge graph (who depends on this?)
 * to compute the full blast radius of a hypothetical change.
 * 
 * - Depth 1: Direct callers / importers
 * - Depth 2+: Transitive dependents  
 * - Max depth capped at 5 to avoid runaway traversals
 * 
 * Risk level is determined by:
 * - low:    <= 5 affected nodes
 * - medium: 6-15 affected nodes
 * - high:   > 15 affected nodes
 */
export class ImpactAnalyzer {
    private db: CodeIndexDatabase;
    private maxDepth: number;

    constructor(db: CodeIndexDatabase, maxDepth: number = 5) {
        this.db = db;
        this.maxDepth = maxDepth;
    }

    /**
     * Analyze the impact of changing a symbol
     * Walks incoming edges to find all transitively affected symbols
     */
    analyzeImpact(symbolId: number): ImpactResult {
        const sourceSymbol = this.db.getSymbolById(symbolId);
        if (!sourceSymbol) {
            return {
                sourceId: symbolId,
                sourceName: 'unknown',
                affected: [],
                totalAffected: 0,
                maxDepth: 0,
                riskLevel: 'low'
            };
        }

        const visited = new Set<number>();
        visited.add(symbolId);

        const affected: ImpactNode[] = [];
        const queue: { id: number; depth: number }[] = [];

        // Start with direct dependents (incoming edges = who depends on this symbol)
        const directEdges = this.db.getIncomingEdges(symbolId);
        for (const edge of directEdges) {
            if (!visited.has(edge.sourceId)) {
                visited.add(edge.sourceId);
                queue.push({ id: edge.sourceId, depth: 1 });
            }
        }

        // BFS through the dependency graph
        while (queue.length > 0) {
            const current = queue.shift()!;
            const symbol = this.db.getSymbolById(current.id);

            if (symbol) {
                affected.push({
                    symbolId: symbol.id,
                    name: symbol.name,
                    filePath: symbol.filePath,
                    depth: current.depth,
                    impactType: current.depth === 1 ? 'direct' : 'transitive',
                });

                // Continue traversal if within depth limit
                if (current.depth < this.maxDepth) {
                    const nextEdges = this.db.getIncomingEdges(symbol.id);
                    for (const edge of nextEdges) {
                        if (!visited.has(edge.sourceId)) {
                            visited.add(edge.sourceId);
                            queue.push({ id: edge.sourceId, depth: current.depth + 1 });
                        }
                    }
                }
            }
        }

        // Sort by depth (closest first)
        affected.sort((a, b) => a.depth - b.depth);

        // Determine risk level
        let riskLevel: 'low' | 'medium' | 'high' = 'low';
        if (affected.length > 15) riskLevel = 'high';
        else if (affected.length > 5) riskLevel = 'medium';

        const maxDepthFound = affected.reduce((max, n) => Math.max(max, n.depth), 0);

        return {
            sourceId: symbolId,
            sourceName: sourceSymbol.name,
            affected,
            totalAffected: affected.length,
            maxDepth: maxDepthFound,
            riskLevel
        };
    }

    /**
     * Get impact node IDs formatted for webview highlighting
     * Returns an array of node IDs in the format "filePath:name:line"
     */
    getImpactNodeIds(symbolId: number): { nodeId: string; depth: number; impactType: string }[] {
        const result = this.analyzeImpact(symbolId);

        return result.affected.map(node => {
            const symbol = this.db.getSymbolById(node.symbolId);
            const nodeId = symbol
                ? `${symbol.filePath}:${symbol.name}:${symbol.rangeStartLine}`
                : `unknown:${node.symbolId}`;

            return {
                nodeId,
                depth: node.depth,
                impactType: node.impactType
            };
        });
    }
}
