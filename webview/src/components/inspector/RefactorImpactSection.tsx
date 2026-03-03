/**
 * Refactor & Impact Section Component
 *
 * Shows when AI returns a refactor patch:
 * - Summary of changes
 * - Impacted nodes count
 * - Preview / Apply / Cancel buttons
 *
 * Uses VS Code diff API for previewing
 */

import { memo, useCallback } from 'react';
import { useAIResult } from '../../stores/useInspectorStore';
import CollapsibleSection from './CollapsibleSection';
import type { VSCodeAPI } from '../../types';

interface RefactorImpactSectionProps {
    vscode: VSCodeAPI;
}

const RefactorImpactSection = memo(({ vscode }: RefactorImpactSectionProps) => {
    const aiResult = useAIResult();

    // Only show if there's a patch from a refactor action
    const patch = aiResult?.patch;
    const hasRefactorResult = aiResult?.action === 'refactor' && patch;

    const handlePreview = useCallback(() => {
        if (!patch) return;
        vscode.postMessage({
            type: 'preview-refactor',
            diff: patch.diff,
        });
    }, [vscode, patch]);

    const handleApply = useCallback(() => {
        if (!patch) return;
        vscode.postMessage({
            type: 'apply-refactor',
            diff: patch.diff,
        });
    }, [vscode, patch]);

    const handleCancel = useCallback(() => {
        // This would clear the refactor state
        vscode.postMessage({
            type: 'cancel-refactor',
        });
    }, [vscode]);

    if (!hasRefactorResult) {
        return null; // Don't render section if no refactor patch
    }

    return (
        <CollapsibleSection id="refactor-impact" title="Refactor & Impact" icon="⚡" loading={false}>
            <div className="refactor-impact-container">
                {/* Summary */}
                <div className="refactor-summary">
                    <div className="refactor-summary-header">📝 Summary</div>
                    <p className="refactor-summary-text">{patch.summary}</p>
                </div>

                {/* Impact Stats */}
                <div className="refactor-impact-stats">
                    <div className="impact-stat">
                        <span className="impact-stat-value">{patch.impactedNodeCount}</span>
                        <span className="impact-stat-label">Nodes Affected</span>
                    </div>
                </div>

                {/* Action Buttons */}
                <div className="refactor-actions">
                    <button
                        className="refactor-btn preview"
                        onClick={handlePreview}
                        title="Preview changes in diff view"
                    >
                        👁 Preview
                    </button>
                    <button
                        className="refactor-btn apply"
                        onClick={handleApply}
                        title="Apply changes to files"
                    >
                        ✅ Apply
                    </button>
                    <button
                        className="refactor-btn cancel"
                        onClick={handleCancel}
                        title="Cancel refactor"
                    >
                        ❌ Cancel
                    </button>
                </div>

                {/* Warning for high impact */}
                {patch.impactedNodeCount > 10 && (
                    <div className="refactor-warning">
                        ⚠️ This refactor affects many nodes. Review carefully before applying.
                    </div>
                )}
            </div>
        </CollapsibleSection>
    );
});

RefactorImpactSection.displayName = 'RefactorImpactSection';

export default RefactorImpactSection;
