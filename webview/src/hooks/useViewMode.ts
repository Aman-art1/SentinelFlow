import { useState, useCallback, useEffect } from 'react';
import type { ViewMode, ViewState, ImpactStats } from '../types/viewMode';
import type { VSCodeAPI } from '../types';
import { useGraphStore } from '../stores/useGraphStore';

/**
 * Global View Mode Hook
 * Manages view mode state with VS Code persistence
 */

interface UseViewModeReturn {
    currentMode: ViewMode;
    switchMode: (mode: ViewMode) => void;
    focusedNodeId: string | null;
    setFocusedNodeId: (nodeId: string | null) => void;
    relatedNodeIds: Set<string>;
    setRelatedNodeIds: (ids: Set<string>) => void;
    impactStats: ImpactStats | null;
    setImpactStats: (stats: ImpactStats | null) => void;
    viewState: ViewState;
    searchQuery?: string;
}

export function useViewMode(vscode: VSCodeAPI, searchQuery?: string): UseViewModeReturn {
    // Check if viewMode is already set in store or load from vscode state
    const currentMode = useGraphStore(s => s.viewMode);
    const setViewMode = useGraphStore(s => s.setViewMode);

    // Local state for focus/impact (kept local to component usage for now?)
    // Actually, GraphCanvas uses this hook.
    const [focusedNodeId, setFocusedNodeId] = useState<string | null>(null);
    const [relatedNodeIds, setRelatedNodeIds] = useState<Set<string>>(new Set());
    const [impactStats, setImpactStats] = useState<ImpactStats | null>(null);

    // Load persisted state on mount
    useEffect(() => {
        const savedState = vscode.getState();
        // Only restore from state if we are currently in the default architecture mode
        // This prevents overwriting an explicit mode requested during initialization (like 'trace')
        if (savedState?.viewMode && useGraphStore.getState().viewMode === 'architecture') {
            setViewMode(savedState.viewMode);
        }
    }, [vscode, setViewMode]);

    // Switch view mode and persist
    const switchMode = useCallback(
        (mode: ViewMode) => {
            setViewMode(mode);
            vscode.setState({ viewMode: mode });

            // Reset focused node when switching modes
            setFocusedNodeId(null);
            setRelatedNodeIds(new Set());
            setImpactStats(null);
        },
        [vscode]
    );

    const viewState: ViewState = {
        currentMode,
        focusedNodeId,
        relatedNodeIds,
        impactStats,
    };

    return {
        currentMode,
        switchMode,
        focusedNodeId,
        setFocusedNodeId,
        relatedNodeIds,
        setRelatedNodeIds,
        impactStats,
        setImpactStats,
        viewState,
        searchQuery
    };
}
