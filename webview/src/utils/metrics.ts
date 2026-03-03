import Graph from 'graphology';
import type { GraphData, CouplingMetrics } from '../types';

/**
 * Calculate Coupling Between Objects (CBO) metrics for all nodes
 * CBO = in-degree + out-degree (total number of connections)
 */
export function calculateCouplingMetrics(graphData: GraphData): Map<string, CouplingMetrics> {
    const graph = new Graph({ type: 'directed' });
    const metrics = new Map<string, CouplingMetrics>();

    // Build symbol ID to key mapping
    const symbolKeyMap = new Map<number, string>();
    for (const symbol of graphData.symbols) {
        const key = `${symbol.filePath}:${symbol.name}:${symbol.range.startLine}`;
        symbolKeyMap.set(symbol.id, key);

        // Add node to graph
        if (!graph.hasNode(key)) {
            graph.addNode(key, { symbol });
        }
    }

    // Add edges to graph
    for (const edge of graphData.edges) {
        const sourceKey = edge.source;
        const targetKey = edge.target;

        if (graph.hasNode(sourceKey) && graph.hasNode(targetKey)) {
            try {
                graph.addEdge(sourceKey, targetKey, { type: edge.type });
            } catch (e) {
                // Edge might already exist, skip
            }
        }
    }

    // Calculate metrics for each node
    let maxCBO = 0;
    const cboScores: number[] = [];

    for (const nodeKey of graph.nodes()) {
        const inDegree = graph.inDegree(nodeKey);
        const outDegree = graph.outDegree(nodeKey);
        const cbo = inDegree + outDegree;

        cboScores.push(cbo);
        maxCBO = Math.max(maxCBO, cbo);

        metrics.set(nodeKey, {
            nodeId: nodeKey,
            inDegree,
            outDegree,
            cbo,
            normalizedScore: 0, // Will be calculated after we know max
            color: '#3b82f6', // Default blue
        });
    }

    // Normalize scores to 0-1 range
    for (const [nodeKey, metric] of metrics) {
        const normalizedScore = maxCBO > 0 ? metric.cbo / maxCBO : 0;
        const color = getColorFromScore(normalizedScore);

        metrics.set(nodeKey, {
            ...metric,
            normalizedScore,
            color,
        });
    }

    return metrics;
}

/**
 * Generate color from blue (low coupling) to red (high coupling)
 * @param score Normalized score from 0 to 1
 */
function getColorFromScore(score: number): string {
    // Clamp score to 0-1
    score = Math.max(0, Math.min(1, score));

    // Color gradient: Blue → Yellow → Red
    // Blue (low): #3b82f6
    // Yellow (medium): #fbbf24
    // Red (high): #ef4444

    if (score < 0.5) {
        // Blue to Yellow
        const t = score * 2; // 0 to 1
        return interpolateColor('#3b82f6', '#fbbf24', t);
    } else {
        // Yellow to Red
        const t = (score - 0.5) * 2; // 0 to 1
        return interpolateColor('#fbbf24', '#ef4444', t);
    }
}

/**
 * Interpolate between two hex colors
 */
function interpolateColor(color1: string, color2: string, t: number): string {
    const r1 = parseInt(color1.slice(1, 3), 16);
    const g1 = parseInt(color1.slice(3, 5), 16);
    const b1 = parseInt(color1.slice(5, 7), 16);

    const r2 = parseInt(color2.slice(1, 3), 16);
    const g2 = parseInt(color2.slice(3, 5), 16);
    const b2 = parseInt(color2.slice(5, 7), 16);

    const r = Math.round(r1 + (r2 - r1) * t);
    const g = Math.round(g1 + (g2 - g1) * t);
    const b = Math.round(b1 + (b2 - b1) * t);

    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

/**
 * Get coupling level description
 */
export function getCouplingLevel(normalizedScore: number): string {
    if (normalizedScore < 0.2) return 'Very Low';
    if (normalizedScore < 0.4) return 'Low';
    if (normalizedScore < 0.6) return 'Medium';
    if (normalizedScore < 0.8) return 'High';
    return 'Very High';
}
