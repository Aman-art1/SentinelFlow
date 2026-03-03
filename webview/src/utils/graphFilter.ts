import { useMemo } from 'react';
import { type Node, type Edge, MarkerType } from '@xyflow/react';
import type {
    FilterContext,
    NodeVisibilityState,
} from '../types/viewMode';

import type { DomainNodeData, SymbolNodeData } from '../types';

/**
 * Graph Filtering Engine
 * Central filtering system for all view modes
 */

const DOMAIN_COLORS: Record<string, string> = {
    auth: '#3b82f6',         // Blue
    payment: '#10b981',      // Emerald
    api: '#8b5cf6',          // Violet
    database: '#f59e0b',     // Amber
    notification: '#ec4899', // Pink
    core: '#6366f1',         // Indigo
    ui: '#f43f5e',           // Rose
    util: '#14b8a6',         // Teal
    test: '#84cc16',         // Lime
    config: '#71717a',       // Zinc
    unknown: '#94a3b8',      // Slate
};

const getDomainColor = (domain?: string) => {
    if (!domain) return DOMAIN_COLORS.unknown;
    return DOMAIN_COLORS[domain.toLowerCase()] || DOMAIN_COLORS.unknown;
};

const DEFAULT_EDGE_STYLE = (targetDomain?: string) => ({
    type: 'straight',
    animated: false,
    style: {
        stroke: getDomainColor(targetDomain),
        strokeWidth: 1,
        opacity: 0.4,
        strokeDasharray: '5,5',
    },
    markerEnd: {
        type: MarkerType.ArrowClosed,
        width: 15,
        height: 15,
        color: getDomainColor(targetDomain),
    },
});

interface FilteredGraph {
    visibleNodes: Node[];
    visibleEdges: Edge[];
}

/**
 * Apply view mode filtering to the entire graph
 * This is the main entry point for filtering
 */
export function applyViewMode(
    allNodes: Node[],
    allEdges: Edge[],
    context: FilterContext
): FilteredGraph {
    // 1. First, apply base filtering based on the current view mode
    let result: FilteredGraph;
    switch (context.mode) {
        case 'architecture':
        case 'codebase':
            result = filterArchitectureMode(allNodes, allEdges, context);
            break;
        case 'trace':
            result = filterTraceMode(allNodes, allEdges, context);
            break;
        default:
            result = { visibleNodes: allNodes, visibleEdges: allEdges };
    }

    // 2. If a search query is active, further filter the results
    if (context.searchQuery && context.searchQuery.length > 2) {
        return filterBySearch(result.visibleNodes, result.visibleEdges, context.searchQuery);
    }

    return result;
}

/**
 * Trace Mode: Show only nodes in the active function trace
 */
function filterTraceMode(
    allNodes: Node[],
    allEdges: Edge[],
    _context: FilterContext
): FilteredGraph {
    // In trace mode, the trace nodes are usually the only ones passed in
    // or we identify them by the symbols present.
    // However, to be safe, we filter for nodes that are NOT domains/files
    // unless they are specifically part of the trace (which they shouldn't be in micro view)
    const visibleNodes = allNodes.filter(n => n.type === 'symbolNode').map(node => ({
        ...node,
        data: {
            ...node.data,
            opacity: 1.0,
            isHighlighted: false,
        }
    }));

    const visibleNodeIds = new Set(visibleNodes.map(n => n.id));
    const visibleEdges = allEdges.filter(e => visibleNodeIds.has(e.source) && visibleNodeIds.has(e.target));

    return { visibleNodes, visibleEdges };
}

/**
 * Semantic Search Refinement: Filter existing results by query
 * Physically removes non-matches to prevent layout congestion
 */
function filterBySearch(
    visibleNodes: Node[],
    visibleEdges: Edge[],
    query: string
): FilteredGraph {
    const q = query.toLowerCase();

    // 1. Identify direct matching nodes
    const matchingNodeIds = new Set<string>();
    visibleNodes.forEach(node => {
        const data = node.data as any;
        const name = data.name || data.label || '';
        const filePath = data.filePath || '';
        const domain = data.domainName || data.domain || '';
        const tags = data.searchTags || [];

        const matches =
            name.toLowerCase().includes(q) ||
            filePath.toLowerCase().includes(q) ||
            domain.toLowerCase().includes(q) ||
            tags.some((tag: string) => tag.toLowerCase().includes(q));

        if (matches) {
            matchingNodeIds.add(node.id);
        }
    });

    // 2. Collect matching nodes AND their parents to preserve hierarchy structure
    // This prevents React Flow children from "floating" or stacking at the origin.
    const nodesToKeep = new Set<string>();
    const nodeLookup = new Map(visibleNodes.map(n => [n.id, n]));

    matchingNodeIds.forEach(id => {
        let currentId: string | undefined = id;
        while (currentId) {
            nodesToKeep.add(currentId);
            const node = nodeLookup.get(currentId);
            currentId = node?.parentId;
        }
    });

    // 3. Finalize node list with highlight styles
    const finalNodes = visibleNodes
        .filter(node => nodesToKeep.has(node.id))
        .map(node => {
            const isDirectMatch = matchingNodeIds.has(node.id);
            return {
                ...node,
                data: {
                    ...node.data,
                    opacity: 1.0,
                    isHighlighted: isDirectMatch,
                    disableHeatmap: true,
                },
                style: {
                    ...node.style,
                    border: isDirectMatch ? '2px solid var(--vscode-focusBorder)' : node.style?.border,
                    boxShadow: isDirectMatch ? '0 0 12px rgba(56, 189, 248, 0.4)' : node.style?.boxShadow,
                }
            };
        });

    // 4. Update edges to only connect preserved nodes
    const finalNodeIds = new Set(finalNodes.map(n => n.id));
    const finalEdges = visibleEdges.filter(edge =>
        finalNodeIds.has(edge.source) && finalNodeIds.has(edge.target)
    );

    return { visibleNodes: finalNodes, visibleEdges: finalEdges };
}

/**
 * Architecture Mode: Show domains and files only
 * Purpose: Learn system structure
 */
function filterArchitectureMode(
    allNodes: Node[],
    allEdges: Edge[],
    context: FilterContext
): FilteredGraph {
    // Filter: Only domain and file nodes
    const visibleNodes = allNodes
        .filter((node) => context.mode === 'codebase'
            ? true  // Codebase shows all node types including symbols
            : (node.type === 'domainNode' || node.type === 'fileNode'))
        .map((node) => {
            const currentOpacity = (node.data as any)?.opacity;
            const currentDisableHeatmap = (node.data as any)?.disableHeatmap;
            const currentHighlight = (node.data as any)?.isHighlighted;

            // Only skip cloning if ALL properties exist and match target state
            if (currentOpacity === 1.0 &&
                currentDisableHeatmap === true &&
                currentHighlight === false) {
                return node;
            }

            return {
                ...node,
                data: {
                    ...node.data,
                    opacity: 1.0,
                    isHighlighted: false,
                    glowColor: undefined,
                    disableHeatmap: true,
                },
            };
        });

    // Filter edges: Only between visible nodes
    const visibleNodeIds = new Set(visibleNodes.map((n) => n.id));
    const nodeMap = new Map(allNodes.map(n => [n.id, n]));

    const visibleEdges = allEdges
        .filter((edge) => visibleNodeIds.has(edge.source) && visibleNodeIds.has(edge.target))
        .map(edge => {
            const targetNode = nodeMap.get(edge.target);
            const targetDomain = (targetNode?.data as any)?.domain;
            const baseStyle = DEFAULT_EDGE_STYLE(targetDomain);

            return {
                ...edge,
                ...baseStyle,
            };
        });

    return { visibleNodes, visibleEdges };
}




/**
 * Hook: Memoized graph filtering
 */
export function useFilteredGraph(
    allNodes: Node[],
    allEdges: Edge[],
    context: FilterContext
): FilteredGraph {
    return useMemo(() => {
        return applyViewMode(allNodes, allEdges, context);
    }, [allNodes, allEdges, context]);
}

/**
 * Get node visibility state
 */
export function getNodeVisibilityState(
    node: Node,
    context: FilterContext
): NodeVisibilityState {
    switch (context.mode) {
        case 'architecture':
        case 'codebase':
            return {
                isVisible: context.mode === 'codebase' ? true : node.type !== 'symbolNode',
                opacity: 1.0,
                isHighlighted: false,
            };

        default:
            return {
                isVisible: true,
                opacity: 1.0,
                isHighlighted: false,
            };
    }
}
