/**
 * Risks & Health Section Component
 *
 * Shows:
 * - Risk level (Low / Medium / High)
 * - Heat score
 * - Warning reasons
 * - "❓ Why?" button for AI explanation
 */

import { memo, useCallback, useState } from 'react';
import { useRisks, useIsLoadingRisks, useSelectedId } from '../../stores/useInspectorStore';
import CollapsibleSection from './CollapsibleSection';
import { getDataProvider } from '../../panel/dataProvider';
import type { VSCodeAPI } from '../../types';

interface RisksHealthSectionProps {
    vscode: VSCodeAPI;
}

const RISK_COLORS = {
    low: '#10b981',
    medium: '#fbbf24',
    high: '#ef4444',
};

const RISK_ICONS = {
    low: '✅',
    medium: '⚠️',
    high: '🔴',
};

const RisksHealthSection = memo(({ vscode }: RisksHealthSectionProps) => {
    const risks = useRisks();
    const isLoading = useIsLoadingRisks();
    const selectedId = useSelectedId();

    // State for AI explanation
    const [explanation, setExplanation] = useState<string | null>(null);
    const [isExplaining, setIsExplaining] = useState(false);
    const [explainError, setExplainError] = useState<string | null>(null);

    const handleWhyClick = useCallback(async () => {
        if (!selectedId || !risks) return;

        setIsExplaining(true);
        setExplainError(null);

        try {
            const provider = getDataProvider(vscode);
            const result = await provider.explainRisk(selectedId, risks.level);
            setExplanation(result);
        } catch (error) {
            setExplainError(error instanceof Error ? error.message : 'Failed to get explanation');
        } finally {
            setIsExplaining(false);
        }
    }, [selectedId, risks, vscode]);

    const handleDismissExplanation = useCallback(() => {
        setExplanation(null);
        setExplainError(null);
    }, []);

    return (
        <CollapsibleSection
            id="risks"
            title="Risks & Health"
            icon="🛡️"
            loading={isLoading}
        >
            {risks && risks.level ? (
                <div className="risks-container">
                    {/* Risk Level Badge */}
                    <div className="risk-level-row">
                        <span className="risk-label">Risk Level</span>
                        <span
                            className="risk-badge"
                            style={{
                                backgroundColor: RISK_COLORS[risks.level] + '20',
                                color: RISK_COLORS[risks.level],
                                borderColor: RISK_COLORS[risks.level],
                            }}
                        >
                            {RISK_ICONS[risks.level] ?? '•'} {(risks.level ?? 'unknown').toUpperCase()}
                        </span>
                    </div>

                    {/* Heat Score */}
                    <div className="heat-score-row">
                        <span className="heat-label">Heat Score</span>
                        <div className="heat-bar-container">
                            <div
                                className="heat-bar"
                                style={{
                                    width: `${Math.min(risks.heatScore, 100)}%`,
                                    backgroundColor: getHeatColor(risks.heatScore),
                                }}
                            />
                            <span className="heat-value">{risks.heatScore}</span>
                        </div>
                    </div>

                    {/* Warnings */}
                    {risks.warnings.length > 0 && (
                        <div className="warnings-container">
                            <div className="warnings-header">⚠️ Warnings</div>
                            <ul className="warnings-list">
                                {risks.warnings.map((warning, idx) => (
                                    <li key={idx} className="warning-item">
                                        {warning}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}

                    {/* Why Button */}
                    <button
                        className="why-button"
                        onClick={handleWhyClick}
                        disabled={isExplaining}
                    >
                        {isExplaining ? '⏳ Analyzing...' : '❓ Why?'}
                    </button>

                    {/* AI Explanation */}
                    {explanation && (
                        <div className="explanation-container">
                            <div className="explanation-header">
                                <span>💡 AI Explanation</span>
                                <button
                                    className="explanation-dismiss"
                                    onClick={handleDismissExplanation}
                                >
                                    ×
                                </button>
                            </div>
                            <div className="explanation-content">{explanation}</div>
                        </div>
                    )}

                    {/* Error */}
                    {explainError && (
                        <div className="explanation-error">
                            ❌ {explainError}
                        </div>
                    )}
                </div>
            ) : (
                <div className="inspector-empty-section">No risk data available</div>
            )}
        </CollapsibleSection>
    );
});

// Calculate heat bar color
function getHeatColor(score: number): string {
    if (score <= 30) return '#10b981';
    if (score <= 60) return '#fbbf24';
    return '#ef4444';
}

RisksHealthSection.displayName = 'RisksHealthSection';

export default RisksHealthSection;
