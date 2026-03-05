import type { Node, Edge } from '@xyflow/react';
import type { RelatedNodes } from '../types/viewMode';

/**
 * Relationship Detection Engine
 * Uses BFS/DFS to find related nodes in the graph
 */

// Cache for relationship queries
const relationshipCache = new Map<string, RelatedNodes>();

/**
 * Get all nodes related to a given node
 * @param nodeId - The node to find relationships for
 * @param nodes - All nodes in the graph
 * @param edges - All edges in the graph
 * @param depth - How many hops to traverse (default: 2)
 * @returns RelatedNodes object with categorized relationships
 */
export function getRelatedNodes(
    nodeId: string,
    nodes: Node[],
    edges: Edge[],
    depth: number = 2
): RelatedNodes {
    // Check cache
    const cacheKey = `${nodeId}:${depth}`;
    const cached = relationshipCache.get(cacheKey);
    if (cached) return cached;

    const parents = new Set<string>();
    const children = new Set<string>();
    const callers = new Set<string>();
    const callees = new Set<string>();
    const sameFile = new Set<string>();

    const targetNode = nodes.find((n) => n.id === nodeId);
    if (!targetNode) {
        return { parents, children, callers, callees, sameFile, all: new Set() };
    }

    // Find parent/child relationships via React Flow hierarchy
    nodes.forEach((node) => {
        if (node.parentId === nodeId) {
            children.add(node.id);
        }
        if (node.id === targetNode.parentId) {
            parents.add(node.id);
        }
    });

    // Find same-file symbols
    const targetFilePath = (targetNode.data as any)?.filePath || targetNode.parentId;
    if (targetFilePath) {
        nodes.forEach((node) => {
            const nodeFilePath = (node.data as any)?.filePath || node.parentId;
            if (nodeFilePath === targetFilePath && node.id !== nodeId) {
                sameFile.add(node.id);
            }
        });
    }

    // Build adjacency list for O(1) neighbor lookup
    const { incoming, outgoing } = buildAdjacencyList(edges);

    // Find callers/callees via edges (with depth limit)
    const visited = new Set<string>();
    const queue: Array<{ id: string; currentDepth: number; direction: 'upstream' | 'downstream' }> = [
        { id: nodeId, currentDepth: 0, direction: 'upstream' },
        { id: nodeId, currentDepth: 0, direction: 'downstream' },
    ];

    while (queue.length > 0) {
        const { id, currentDepth, direction } = queue.shift()!;

        if (currentDepth >= depth) continue;
        if (visited.has(`${id}:${direction}`)) continue;
        visited.add(`${id}:${direction}`);

        if (direction === 'upstream') {
            const sources = incoming.get(id) || [];
            for (const source of sources) {
                callers.add(source);
                queue.push({ id: source, currentDepth: currentDepth + 1, direction });
            }
        } else {
            const targets = outgoing.get(id) || [];
            for (const target of targets) {
                callees.add(target);
                queue.push({ id: target, currentDepth: currentDepth + 1, direction });
            }
        }
    }

    // Combine all related nodes
    const all = new Set<string>([
        ...parents,
        ...children,
        ...callers,
        ...callees,
        ...sameFile,
    ]);

    const result: RelatedNodes = {
        parents,
        children,
        callers,
        callees,
        sameFile,
        all,
    };

    // Cache the result
    relationshipCache.set(cacheKey, result);

    return result;
}

/**
 * Find nodes that are N hops away from the source
 * @param nodeId - Starting node
 * @param edges - All edges
 * @param hops - Number of hops (1 = direct neighbors)
 * @param direction - 'both', 'upstream', or 'downstream'
 * @returns Set of node IDs
 */
export function getNodesAtDistance(
    nodeId: string,
    edges: Edge[],
    hops: number,
    direction: 'both' | 'upstream' | 'downstream' = 'both'
): Set<string> {
    if (hops <= 0) return new Set();

    // Build adjacency list for O(1) neighbor lookup
    const { incoming, outgoing } = buildAdjacencyList(edges);

    const result = new Set<string>();
    const visited = new Set<string>();
    const queue: Array<{ id: string; distance: number }> = [{ id: nodeId, distance: 0 }];

    while (queue.length > 0) {
        const { id, distance } = queue.shift()!;

        if (visited.has(id)) continue;
        visited.add(id);

        if (distance === hops) {
            result.add(id);
            continue;
        }

        if (distance < hops) {
            if (direction === 'upstream' || direction === 'both') {
                const sources = incoming.get(id) || [];
                for (const source of sources) {
                    queue.push({ id: source, distance: distance + 1 });
                }
            }
            if (direction === 'downstream' || direction === 'both') {
                const targets = outgoing.get(id) || [];
                for (const target of targets) {
                    queue.push({ id: target, distance: distance + 1 });
                }
            }
        }
    }

    return result;
}

/**
 * Build adjacency list for faster graph traversal
 */
export function buildAdjacencyList(edges: Edge[]): {
    incoming: Map<string, string[]>;
    outgoing: Map<string, string[]>;
} {
    const incoming = new Map<string, string[]>();
    const outgoing = new Map<string, string[]>();

    edges.forEach((edge) => {
        // Outgoing edges from source
        if (!outgoing.has(edge.source)) {
            outgoing.set(edge.source, []);
        }
        outgoing.get(edge.source)!.push(edge.target);

        // Incoming edges to target
        if (!incoming.has(edge.target)) {
            incoming.set(edge.target, []);
        }
        incoming.get(edge.target)!.push(edge.source);
    });

    return { incoming, outgoing };
}

/**
 * Clear the relationship cache
 * Call this when graph data changes
 */
export function clearRelationshipCache(): void {
    relationshipCache.clear();
}

/**
 * Get cache statistics for debugging
 */
export function getCacheStats() {
    return {
        size: relationshipCache.size,
        keys: Array.from(relationshipCache.keys()),
    };
}
