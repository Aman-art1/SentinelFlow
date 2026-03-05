/**
 * Overview Section Component
 *
 * Shows contextual metrics based on node type:
 * - Domain: Health %, File count, Function count, Coupling
 * - File: Symbols, Imports/Exports, Avg complexity
 * - Symbol: Lines, Complexity, Fan-in/Fan-out
 */

import { memo, useMemo } from 'react';
import { useNodeType, useOverview, useIsLoadingOverview } from '../../stores/useInspectorStore';
import CollapsibleSection from './CollapsibleSection';

// Metric display component
interface MetricProps {
    label: string;
    value: string | number;
    color?: string;
}

const Metric = memo(({ label, value, color }: MetricProps) => (
    <div className="inspector-metric">
        <span className="metric-label">{label}</span>
        <span className="metric-value" style={color ? { color } : undefined}>
            {value}
        </span>
    </div>
));

Metric.displayName = 'Metric';

const OverviewSection = memo(() => {
    const nodeType = useNodeType();
    const overview = useOverview();
    const isLoading = useIsLoadingOverview();

    const metrics = useMemo(() => {
        if (!overview || !nodeType) return [];

        switch (nodeType) {
            case 'domain':
                return [
                    {
                        label: 'Health',
                        value: overview.healthPercent !== undefined
                            ? `${overview.healthPercent}%`
                            : 'N/A',
                        color: getHealthColor(overview.healthPercent),
                    },
                    { label: 'Files', value: overview.fileCount ?? 0 },
                    { label: 'Functions', value: overview.functionCount ?? 0 },
                    {
                        label: 'Coupling',
                        value: overview.coupling !== undefined
                            ? `${Math.round(overview.coupling * 100)}%`
                            : 'N/A',
                        color: getCouplingColor(overview.coupling),
                    },
                ];

            case 'file':
                return [
                    { label: 'Symbols', value: overview.symbolCount ?? 0 },
                    { label: 'Imports', value: overview.importCount ?? 0 },
                    { label: 'Exports', value: overview.exportCount ?? 0 },
                    {
                        label: 'Avg Complexity',
                        value: overview.avgComplexity?.toFixed(1) ?? 'N/A',
                        color: getComplexityColor(overview.avgComplexity),
                    },
                ];

            case 'symbol':
                return [
                    { label: 'Lines', value: overview.lines ?? 0 },
                    {
                        label: 'Complexity',
                        value: overview.complexity ?? 0,
                        color: getComplexityColor(overview.complexity),
                    },
                    { label: 'Fan-In', value: overview.fanIn ?? 0 },
                    { label: 'Fan-Out', value: overview.fanOut ?? 0 },
                ];

            default:
                return [];
        }
    }, [overview, nodeType]);

    return (
        <CollapsibleSection id="overview" title="Overview" icon="📊" loading={isLoading}>
            {metrics.length > 0 ? (
                <div className="inspector-metrics-grid">
                    {metrics.map((metric) => (
                        <Metric
                            key={metric.label}
                            label={metric.label}
                            value={metric.value}
                            color={metric.color}
                        />
                    ))}
                </div>
            ) : (
                <div className="inspector-empty-section">No metrics available</div>
            )}
        </CollapsibleSection>
    );
});

// Color helper functions
function getHealthColor(health: number | undefined): string | undefined {
    if (health === undefined) return undefined;
    if (health >= 80) return '#10b981'; // Green
    if (health >= 60) return '#fbbf24'; // Yellow
    return '#ef4444'; // Red
}

function getCouplingColor(coupling: number | undefined): string | undefined {
    if (coupling === undefined) return undefined;
    if (coupling <= 0.3) return '#10b981';
    if (coupling <= 0.6) return '#fbbf24';
    return '#ef4444';
}

function getComplexityColor(complexity: number | undefined): string | undefined {
    if (complexity === undefined) return undefined;
    if (complexity <= 5) return '#10b981';
    if (complexity <= 10) return '#fbbf24';
    return '#ef4444';
}

OverviewSection.displayName = 'OverviewSection';

export default OverviewSection;
