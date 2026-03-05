// Purpose: Domain health metrics calculator
// Computes health scores for domains based on complexity and coupling

import type { Symbol } from '../db/schema';

/**
 * Domain health metrics
 */
export interface DomainHealth {
    domain: string;
    symbolCount: number;
    avgComplexity: number;
    coupling: number; // Cross-domain dependency ratio
    healthScore: number; // 0-100 scale
    status: 'healthy' | 'warning' | 'critical';
}

/**
 * Compute health score for a domain
 */
export function computeDomainHealth(
    domain: string,
    symbols: Symbol[],
    crossDomainEdgeCount: number,
    totalEdgeCount: number
): DomainHealth {
    const symbolCount = symbols.length;

    // Average complexity
    const avgComplexity =
        symbolCount > 0
            ? symbols.reduce((sum, s) => sum + s.complexity, 0) / symbolCount
            : 0;

    // Coupling ratio (cross-domain edges / total edges)
    const coupling = totalEdgeCount > 0 ? crossDomainEdgeCount / totalEdgeCount : 0;

    // Health score calculation
    // - Complexity score: lower is better (normalize 0-20 complexity to 0-100 scale, inverted)
    // - Coupling score: lower is better (0-1 ratio to 0-100 scale, inverted)
    const complexityScore = Math.max(0, 100 - (avgComplexity / 20) * 100);
    const couplingScore = Math.max(0, 100 - coupling * 100);

    // Weighted average: 70% complexity, 30% coupling
    const healthScore = Math.round(complexityScore * 0.7 + couplingScore * 0.3);

    // Determine status
    let status: 'healthy' | 'warning' | 'critical';
    if (healthScore >= 80) {
        status = 'healthy';
    } else if (healthScore >= 60) {
        status = 'warning';
    } else {
        status = 'critical';
    }

    return {
        domain,
        symbolCount,
        avgComplexity: Math.round(avgComplexity * 10) / 10, // Round to 1 decimal
        coupling: Math.round(coupling * 100) / 100, // Round to 2 decimals
        healthScore,
        status,
    };
}

/**
 * Get health status emoji
 */
export function getHealthEmoji(status: 'healthy' | 'warning' | 'critical'): string {
    const emojis = {
        healthy: '✅',
        warning: '⚠️',
        critical: '❌',
    };
    return emojis[status];
}

/**
 * Get health status color
 */
export function getHealthColor(status: 'healthy' | 'warning' | 'critical'): string {
    const colors = {
        healthy: '#10b981', // green
        warning: '#fbbf24', // yellow
        critical: '#ef4444', // red
    };
    return colors[status];
}
