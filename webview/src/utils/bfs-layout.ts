import type { Node, Edge } from '@xyflow/react';

const LEVEL_HEIGHT = 200;
const NODE_HORIZONTAL_SPACING = 300; // Increased spacing to prevent overlaps
const TREE_SPACING = 500; // Spacing between different disconnected trees (e.g., domains)

/**
 * Transforms a graph into a tree-like layout using BFS traversal.
 * Handles multiple components, prevents overlaps, and ensures deterministic positioning.
 */
export function applyBFSLayout(
    nodes: Node[],
    edges: Edge[],
    rootNodeId?: string,
    direction: 'DOWN' | 'RIGHT' = 'DOWN',
    forceGrid: boolean = false
): { nodes: Node[]; edges: Edge[] } {
    if (nodes.length === 0) return { nodes, edges };

    const nodeMap = new Map(nodes.map(n => [n.id, n]));
    const adjacencyList = new Map<string, string[]>();
    const inDegrees = new Map<string, number>();

    nodes.forEach(n => inDegrees.set(n.id, 0));

    edges.forEach(edge => {
        if (!adjacencyList.has(edge.source)) {
            adjacencyList.set(edge.source, []);
        }
        adjacencyList.get(edge.source)!.push(edge.target);
        inDegrees.set(edge.target, (inDegrees.get(edge.target) || 0) + 1);
    });

    const potentialRoots = rootNodeId && nodeMap.has(rootNodeId)
        ? [rootNodeId]
        : Array.from(inDegrees.entries())
            .filter(([_, degree]) => degree === 0)
            .map(([id]) => id)
            .sort();

    const rootsToProcess = potentialRoots.length > 0 ? potentialRoots : [nodes[0].id];

    // --- GRID MODE OVERRIDE ---
    if (forceGrid) {
        const orderedIds: string[] = [];
        const visitedGrid = new Set<string>();

        // Follow BFS order to keep related nodes somewhat near each other
        rootsToProcess.forEach(rootId => {
            if (visitedGrid.has(rootId)) return;
            const queue: string[] = [rootId];
            visitedGrid.add(rootId);

            while (queue.length > 0) {
                const currentId = queue.shift()!;
                orderedIds.push(currentId);

                const neighbors = (adjacencyList.get(currentId) || [])
                    .filter(id => nodeMap.has(id))
                    .sort();

                for (const neighborId of neighbors) {
                    if (!visitedGrid.has(neighborId)) {
                        visitedGrid.add(neighborId);
                        queue.push(neighborId);
                    }
                }
            }
        });

        // Add any nodes that weren't reached by BFS (orphans/cycles)
        nodes.forEach(node => {
            if (!visitedGrid.has(node.id)) {
                orderedIds.push(node.id);
                visitedGrid.add(node.id);
            }
        });

        const COLS = 6;
        const VERTICAL_STEP = 180;
        const HORIZONTAL_STEP = 350;

        const layoutedNodes = orderedIds.map((id, index) => {
            const node = nodeMap.get(id)!;
            const row = Math.floor(index / COLS);
            const col = index % COLS;

            // Center the grid
            const gridWidth = (Math.min(orderedIds.length, COLS) - 1) * HORIZONTAL_STEP;
            const offsetX = -gridWidth / 2;

            return {
                ...node,
                position: {
                    x: offsetX + col * HORIZONTAL_STEP,
                    y: row * VERTICAL_STEP
                }
            };
        });

        return { nodes: layoutedNodes, edges };
    }
    // --- END GRID MODE OVERRIDE ---

    const visited = new Set<string>();
    const allLayoutedNodes: Node[] = [];
    let currentTreeOffsetX = 0;

    // Process each component separately
    rootsToProcess.forEach(rootId => {
        if (visited.has(rootId)) return;

        const levels = new Map<string, number>();
        const nodesByLevel: string[][] = [];
        const queue: [string, number][] = [[rootId, 0]];
        const componentVisited = new Set<string>();

        visited.add(rootId);
        componentVisited.add(rootId);

        while (queue.length > 0) {
            const [currentId, level] = queue.shift()!;

            levels.set(currentId, level);
            if (!nodesByLevel[level]) {
                nodesByLevel[level] = [];
            }
            nodesByLevel[level].push(currentId);

            const neighbors = (adjacencyList.get(currentId) || [])
                .filter(id => nodeMap.has(id))
                .sort();

            for (const neighborId of neighbors) {
                if (!visited.has(neighborId)) {
                    visited.add(neighborId);
                    componentVisited.add(neighborId);
                    queue.push([neighborId, level + 1]);
                }
            }
        }

        // Layout this component
        const MAX_NODES_PER_LEVEL = 5; // Wrap if more than 5 nodes
        let componentMaxDim = 0; // Max width or height of the component

        nodesByLevel.forEach((levelNodes, level) => {
            const numNodes = levelNodes.length;
            const rows = Math.ceil(numNodes / MAX_NODES_PER_LEVEL);
            const cols = Math.min(numNodes, MAX_NODES_PER_LEVEL);

            const levelWidth = (cols - 1) * NODE_HORIZONTAL_SPACING;
            const levelDepth = (rows - 1) * (LEVEL_HEIGHT / 2); // Sub-rows are closer

            // Track max dimension for component offset
            if (levelWidth > componentMaxDim) componentMaxDim = levelWidth;

            levelNodes.forEach((nodeId, index) => {
                const node = nodeMap.get(nodeId)!;
                const row = Math.floor(index / MAX_NODES_PER_LEVEL);
                const col = index % MAX_NODES_PER_LEVEL;

                const crossPos = (componentMaxDim / 2) - ((Math.min(levelNodes.length - row * MAX_NODES_PER_LEVEL, MAX_NODES_PER_LEVEL) - 1) * NODE_HORIZONTAL_SPACING / 2) + col * NODE_HORIZONTAL_SPACING;
                const mainPos = level * LEVEL_HEIGHT + row * (LEVEL_HEIGHT / 2);

                allLayoutedNodes.push({
                    ...node,
                    position: direction === 'DOWN'
                        ? { x: currentTreeOffsetX + crossPos, y: mainPos }
                        : { x: mainPos, y: currentTreeOffsetX + crossPos },
                });
            });
        });

        // Update offset for next tree
        currentTreeOffsetX += componentMaxDim + TREE_SPACING;
    });

    // Handle any nodes that were missed (arrange in a 5-column grid)
    const missedNodes = nodes.filter(node => !visited.has(node.id));
    if (missedNodes.length > 0) {
        const COLS = 5;
        missedNodes.forEach((node, index) => {
            const row = Math.floor(index / COLS);
            const col = index % COLS;

            allLayoutedNodes.push({
                ...node,
                position: direction === 'DOWN'
                    ? { x: col * NODE_HORIZONTAL_SPACING, y: (rootsToProcess.length + row + 2) * LEVEL_HEIGHT }
                    : { x: (rootsToProcess.length + row + 2) * LEVEL_HEIGHT, y: col * NODE_HORIZONTAL_SPACING }
            });
        });
    }

    const layoutedIds = new Set(allLayoutedNodes.map(n => n.id));
    const filteredEdges = edges.filter(e => layoutedIds.has(e.source) && layoutedIds.has(e.target));

    // Shift everything so it's centered around 0 overall?
    // Actually, React Flow handles centering with fitView.

    return { nodes: allLayoutedNodes, edges: filteredEdges };
}
