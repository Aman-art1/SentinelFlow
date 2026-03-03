/**
 * Inspector Panel - Main Container Component
 *
 * PERFORMANCE OPTIMIZATIONS:
 * - getAll(): single batched round-trip (overview + deps + risks in one message)
 * - peekCache(): instant 0ms render when data is already prefetched/cached
 * - 150ms debounce only fires on true cache-miss; cached nodes feel instant
 * - Generation counter discards stale in-flight responses on rapid node switching
 * - All child components are memoized
 */

import { memo, useEffect, useCallback, useRef } from 'react';
import {
    useSelectedId,
    useNodeType,
    useInspectorActions,
} from '../../stores/useInspectorStore';
import { getDataProvider } from '../../panel/dataProvider';
import SelectionHeader from './SelectionHeader';
import OverviewSection from './OverviewSection';
import DependenciesSection from './DependenciesSection';
import RisksHealthSection from './RisksHealthSection';
import AIActionsSection from './AIActionsSection';
import type { VSCodeAPI } from '../../types';
import './InspectorPanel.css';

interface InspectorPanelProps {
    vscode: VSCodeAPI;
    onClose: () => void;
    onFocusNode: (nodeId: string) => void;
}

const InspectorPanel = memo(({ vscode, onClose, onFocusNode }: InspectorPanelProps) => {
    // Use individual stable selectors
    const selectedId = useSelectedId();
    const nodeType = useNodeType();
    const {
        setOverview,
        setDeps,
        setRisks,
        setLoadingOverview,
        setLoadingDeps,
        setLoadingRisks,
    } = useInspectorActions();

    // Ref for debounce timer - NOT state to avoid re-renders
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    // Generation counter: incremented on every selection change.
    // Async callbacks compare against this to discard stale results.
    const requestGenRef = useRef<number>(0);

    // Fetch data when selection changes
    useEffect(() => {
        // Clear any pending debounce timer from a previous selection
        if (debounceRef.current) {
            clearTimeout(debounceRef.current);
            debounceRef.current = null;
        }

        if (!selectedId || !nodeType) {
            return;
        }

        const gen = ++requestGenRef.current;
        const provider = getDataProvider(vscode);

        // ⚡ INSTANT PATH: If the data is already in cache (e.g. prefetched on hover),
        // render immediately — no debounce, no spinner, no round-trip.
        const cached = provider.peekCache(selectedId);
        if (cached) {
            setOverview(cached.overview as any);
            setDeps(cached.deps as any);
            setRisks(cached.risks as any);
            return;
        }

        // DEBOUNCED PATH: data not in cache — show loading state and fire batch request
        const doFetch = (isRetry: boolean) => {
            debounceRef.current = setTimeout(async () => {
                // Cancel any previous in-flight data requests (not AI)
                if (!isRetry) provider.cancelDataRequests();

                // Set loading states BEFORE fetch
                setLoadingOverview(true);
                setLoadingDeps(true);
                setLoadingRisks(true);

                try {
                    // ⚡ Single batch round-trip: 1 message instead of 3
                    const batch = await provider.getAll(selectedId, nodeType as any);

                    // Stale-response guard: discard if user moved to a different node
                    if (requestGenRef.current !== gen) return;

                    setOverview(batch.overview as any);
                    setDeps(batch.deps as any);
                    setRisks(batch.risks as any);

                } catch (error) {
                    if (requestGenRef.current !== gen) return;
                    console.warn('[Inspector] Batch request failed, retrying individually...', error);

                    // Retry once using individual requests as fallback
                    if (!isRetry) {
                        try {
                            const [overview, deps, risks] = await Promise.allSettled([
                                provider.getOverview(selectedId, nodeType as any),
                                provider.getDependencies(selectedId, nodeType as any),
                                provider.getRisks(selectedId, nodeType as any),
                            ]);

                            if (requestGenRef.current !== gen) return;

                            if (overview.status === 'fulfilled') setOverview(overview.value as any);
                            else setLoadingOverview(false);

                            if (deps.status === 'fulfilled') setDeps(deps.value as any);
                            else setLoadingDeps(false);

                            if (risks.status === 'fulfilled') setRisks(risks.value as any);
                            else setLoadingRisks(false);

                        } catch (retryError) {
                            if (requestGenRef.current !== gen) return;
                            console.error('[Inspector] Retry also failed:', retryError);
                            setLoadingOverview(false);
                            setLoadingDeps(false);
                            setLoadingRisks(false);
                        }
                    } else {
                        setLoadingOverview(false);
                        setLoadingDeps(false);
                        setLoadingRisks(false);
                    }
                }
            }, isRetry ? 300 : 150); // 150ms debounce on first try, 300ms on retry
        };

        doFetch(false);

        return () => {
            if (debounceRef.current) {
                clearTimeout(debounceRef.current);
                debounceRef.current = null;
            }
        };
    }, [selectedId, nodeType, vscode, setOverview, setDeps, setRisks, setLoadingOverview, setLoadingDeps, setLoadingRisks]);


    // Handle dependency click - focus node in graph
    const handleDependencyClick = useCallback(
        (depId: string) => {
            onFocusNode(depId);
        },
        [onFocusNode]
    );

    // Empty state when no selection
    if (!selectedId) {
        return (
            <div className="inspector-panel inspector-empty">
                <div className="inspector-header">
                    <h2>Inspector</h2>
                    <button
                        className="inspector-close-btn"
                        onClick={onClose}
                        title="Close Inspector"
                    >
                        ×
                    </button>
                </div>
                <div className="inspector-empty-state">
                    <span className="inspector-empty-icon">📋</span>
                    <p>Select a node in the graph to inspect</p>
                </div>
            </div>
        );
    }

    return (
        <div className="inspector-panel">
            {/* Header */}
            <div className="inspector-header">
                <h2>Inspector</h2>
                <button
                    className="inspector-close-btn"
                    onClick={onClose}
                    title="Close Inspector"
                >
                    ×
                </button>
            </div>

            {/* Scrollable Content */}
            <div className="inspector-content">
                <SelectionHeader />
                {nodeType === 'symbol' && (
                    <div style={{ padding: '0 16px 16px' }}>
                        <button
                            className="vscode-button"
                            onClick={() => {
                                if (selectedId) {
                                    vscode.postMessage({ type: 'request-function-trace', nodeId: selectedId });
                                }
                            }}
                            style={{
                                width: '100%',
                                padding: '6px',
                                backgroundColor: 'var(--vscode-button-background)',
                                color: 'var(--vscode-button-foreground)',
                                border: 'none',
                                borderRadius: '2px',
                                cursor: 'pointer'
                            }}
                        >
                            Trace Function (Micro View)
                        </button>
                    </div>
                )}
                <OverviewSection />
                <DependenciesSection onDependencyClick={handleDependencyClick} />
                <RisksHealthSection vscode={vscode} />
                <AIActionsSection vscode={vscode} />
            </div>
        </div>
    );
});

InspectorPanel.displayName = 'InspectorPanel';

export default InspectorPanel;
