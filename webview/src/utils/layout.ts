import dagre from 'dagre';
import type { Node, Edge } from '@xyflow/react';

export interface LayoutOptions {
    direction?: 'TB' | 'LR' | 'BT' | 'RL';
    nodeSpacing?: number;
    rankSpacing?: number;
}

/**
 * Apply dagre layout to nodes and edges
 */
export function applyDagreLayout(
    nodes: Node[],
    edges: Edge[],
    options: LayoutOptions = {}
): { nodes: Node[]; edges: Edge[] } {
    const {
        direction = 'TB',
        nodeSpacing = 50,
        rankSpacing = 100,
    } = options;

    const graph = new dagre.graphlib.Graph();
    graph.setDefaultEdgeLabel(() => ({}));
    graph.setGraph({
        rankdir: direction,
        nodesep: nodeSpacing,
        ranksep: rankSpacing,
        marginx: 20,
        marginy: 20,
    });

    // Add nodes to dagre graph
    nodes.forEach((node) => {
        const width = node.width || 200;
        const height = node.height || 100;
        graph.setNode(node.id, { width, height });
    });

    // Add edges to dagre graph
    edges.forEach((edge) => {
        graph.setEdge(edge.source, edge.target);
    });

    // Calculate layout
    dagre.layout(graph);

    // Apply positions to nodes
    const layoutedNodes = nodes.map((node) => {
        const nodeWithPosition = graph.node(node.id);
        return {
            ...node,
            position: {
                x: nodeWithPosition.x - (node.width || 200) / 2,
                y: nodeWithPosition.y - (node.height || 100) / 2,
            },
        };
    });

    return { nodes: layoutedNodes, edges };
}

/**
 * Apply hierarchical layout for file-based clustering
 * Files are parent nodes, symbols are children positioned within
 */
export function applyHierarchicalLayout(
    nodes: Node[],
    edges: Edge[],
    options: LayoutOptions = {}
): { nodes: Node[]; edges: Edge[] } {
    // Separate parent (file) and child (symbol) nodes
    const fileNodes = nodes.filter((n) => n.type === 'fileNode');
    const symbolNodes = nodes.filter((n) => n.type === 'symbolNode');

    // Group symbols by parent file
    const symbolsByFile = new Map<string, Node[]>();
    symbolNodes.forEach((node) => {
        const data = node.data as any;
        const parentId = node.parentId || data.filePath;
        if (!symbolsByFile.has(parentId)) {
            symbolsByFile.set(parentId, []);
        }
        symbolsByFile.get(parentId)!.push(node);
    });

    // Layout file nodes first
    const { nodes: layoutedFileNodes } = applyDagreLayout(fileNodes, [], {
        ...options,
        nodeSpacing: 100,
        rankSpacing: 150,
    });

    // Position symbols within their parent files
    const layoutedSymbolNodes: Node[] = [];
    layoutedFileNodes.forEach((fileNode) => {
        const symbols = symbolsByFile.get(fileNode.id) || [];

        // Grid layout for symbols within file
        const cols = Math.ceil(Math.sqrt(symbols.length));
        const symbolWidth = 150;
        const symbolHeight = 60;
        const padding = 20;
        const spacing = 10;

        symbols.forEach((symbol, index) => {
            const row = Math.floor(index / cols);
            const col = index % cols;

            layoutedSymbolNodes.push({
                ...symbol,
                position: {
                    x: fileNode.position.x + padding + col * (symbolWidth + spacing),
                    y: fileNode.position.y + padding + 40 + row * (symbolHeight + spacing),
                },
            });
        });

        // Update file node size to fit children
        const rows = Math.ceil(symbols.length / cols);
        fileNode.width = Math.max(300, padding * 2 + cols * (symbolWidth + spacing) - spacing);
        fileNode.height = Math.max(150, padding * 2 + 40 + rows * (symbolHeight + spacing) - spacing);
    });

    return {
        nodes: [...layoutedFileNodes, ...layoutedSymbolNodes],
        edges,
    };
}
