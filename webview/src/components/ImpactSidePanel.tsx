import { memo } from 'react';
import type { ImpactStats } from '../types/viewMode';

interface ImpactSidePanelProps {
    impactStats: ImpactStats | null;
    focusedNodeName?: string;
    onClose: () => void;
}

const ImpactSidePanel = memo(
    ({ impactStats, focusedNodeName, onClose }: ImpactSidePanelProps) => {
        if (!impactStats) return null;

        const getSeverityColor = (count: number): string => {
            if (count >= 20) return '#ef4444'; // Red - Critical
            if (count >= 10) return '#f97316'; // Orange - High
            if (count >= 5) return '#fbbf24'; // Yellow - Medium
            return '#10b981'; // Green - Low
        };

        return (
            <div
                className="impact-side-panel"
                style={{
                    position: 'absolute',
                    top: 0,
                    right: 0,
                    width: '320px',
                    height: '100%',
                    backgroundColor: 'var(--vscode-sideBar-background)',
                    borderLeft: '1px solid var(--vscode-panel-border)',
                    padding: '16px',
                    overflowY: 'auto',
                    zIndex: 100,
                    boxShadow: '-2px 0 8px rgba(0, 0, 0, 0.1)',
                }}
            >
                {/* Header */}
                <div
                    style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginBottom: '16px',
                    }}
                >
                    <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '600' }}>
                        💥 Change Impact
                    </h3>
                    <button
                        onClick={onClose}
                        style={{
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                            fontSize: '18px',
                            opacity: 0.7,
                        }}
                        title="Close"
                    >
                        ×
                    </button>
                </div>

                {/* Focused Node */}
                {focusedNodeName && (
                    <div
                        style={{
                            marginBottom: '20px',
                            padding: '12px',
                            backgroundColor: 'var(--vscode-editor-background)',
                            borderRadius: '6px',
                            fontSize: '13px',
                        }}
                    >
                        <div style={{ opacity: 0.7, marginBottom: '4px' }}>Selected:</div>
                        <div style={{ fontWeight: '600', wordBreak: 'break-all' }}>
                            {focusedNodeName}
                        </div>
                    </div>
                )}

                {/* Impact Summary */}
                <div style={{ marginBottom: '24px' }}>
                    <div
                        style={{
                            fontSize: '12px',
                            opacity: 0.7,
                            marginBottom: '12px',
                            textTransform: 'uppercase',
                            fontWeight: '600',
                        }}
                    >
                        Blast Radius
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        {/* Functions */}
                        <div
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                padding: '10px',
                                backgroundColor: 'var(--vscode-editor-background)',
                                borderRadius: '6px',
                                borderLeft: `4px solid ${getSeverityColor(impactStats.affectedFunctions)}`,
                            }}
                        >
                            <span style={{ fontSize: '13px' }}>Functions</span>
                            <span
                                style={{
                                    fontSize: '18px',
                                    fontWeight: '700',
                                    color: getSeverityColor(impactStats.affectedFunctions),
                                }}
                            >
                                {impactStats.affectedFunctions}
                            </span>
                        </div>

                        {/* Files */}
                        <div
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                padding: '10px',
                                backgroundColor: 'var(--vscode-editor-background)',
                                borderRadius: '6px',
                                borderLeft: `4px solid ${getSeverityColor(impactStats.affectedFiles * 5)}`,
                            }}
                        >
                            <span style={{ fontSize: '13px' }}>Files</span>
                            <span
                                style={{
                                    fontSize: '18px',
                                    fontWeight: '700',
                                    color: getSeverityColor(impactStats.affectedFiles * 5),
                                }}
                            >
                                {impactStats.affectedFiles}
                            </span>
                        </div>

                        {/* Domains */}
                        <div
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                padding: '10px',
                                backgroundColor: 'var(--vscode-editor-background)',
                                borderRadius: '6px',
                                borderLeft: `4px solid ${getSeverityColor(impactStats.affectedDomains * 20)}`,
                            }}
                        >
                            <span style={{ fontSize: '13px' }}>Domains</span>
                            <span
                                style={{
                                    fontSize: '18px',
                                    fontWeight: '700',
                                    color: getSeverityColor(impactStats.affectedDomains * 20),
                                }}
                            >
                                {impactStats.affectedDomains}
                            </span>
                        </div>
                    </div>
                </div>

                {/* Dependencies */}
                <div>
                    <div
                        style={{
                            fontSize: '12px',
                            opacity: 0.7,
                            marginBottom: '8px',
                            textTransform: 'uppercase',
                            fontWeight: '600',
                        }}
                    >
                        Dependencies
                    </div>

                    {/* Upstream */}
                    <div style={{ marginBottom: '16px' }}>
                        <div
                            style={{
                                fontSize: '13px',
                                fontWeight: '500',
                                marginBottom: '6px',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '4px',
                            }}
                        >
                            <span>↑</span>
                            <span>Upstream ({impactStats.upstreamDeps.length})</span>
                        </div>
                        <div
                            style={{
                                fontSize: '11px',
                                opacity: 0.6,
                                fontStyle: 'italic',
                            }}
                        >
                            {impactStats.upstreamDeps.length === 0
                                ? 'No upstream dependencies'
                                : impactStats.upstreamDeps.length === 1
                                    ? '1 function depends on this'
                                    : `${impactStats.upstreamDeps.length} functions depend on this`}
                        </div>
                    </div>

                    {/* Downstream */}
                    <div>
                        <div
                            style={{
                                fontSize: '13px',
                                fontWeight: '500',
                                marginBottom: '6px',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '4px',
                            }}
                        >
                            <span>↓</span>
                            <span>Downstream ({impactStats.downstreamDeps.length})</span>
                        </div>
                        <div
                            style={{
                                fontSize: '11px',
                                opacity: 0.6,
                                fontStyle: 'italic',
                            }}
                        >
                            {impactStats.downstreamDeps.length === 0
                                ? 'No downstream dependencies'
                                : impactStats.downstreamDeps.length === 1
                                    ? 'Depends on 1 function'
                                    : `Depends on ${impactStats.downstreamDeps.length} functions`}
                        </div>
                    </div>
                </div>

                {/* Warning */}
                {impactStats.affectedFunctions > 15 && (
                    <div
                        style={{
                            marginTop: '20px',
                            padding: '12px',
                            backgroundColor: '#7c2d1210',
                            border: '1px solid #ef4444',
                            borderRadius: '6px',
                            fontSize: '12px',
                        }}
                    >
                        <div style={{ fontWeight: '600', color: '#ef4444', marginBottom: '4px' }}>
                            ⚠️ High Impact Warning
                        </div>
                        <div style={{ opacity: 0.8 }}>
                            Changes to this component may affect a large portion of the codebase.
                            Proceed with caution.
                        </div>
                    </div>
                )}
            </div>
        );
    }
);

ImpactSidePanel.displayName = 'ImpactSidePanel';

export default ImpactSidePanel;
