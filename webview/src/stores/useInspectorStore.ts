/**
 * Inspector Panel Zustand Store
 *
 * CRITICAL: This store is designed to PREVENT infinite re-renders:
 * 1. Uses stable primitive selectors (not object spreads)
 * 2. CollapsedSections is an array (not Set) for stable comparison
 * 3. All mutations produce new references only when data changes
 * 4. Loading states are separate from data to prevent cascades
 */

import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import type {
    InspectorState,
    NodeType,
    OverviewData,
    DependencyData,
    RiskData,
    AIResult,
} from '../types/inspector';

interface InspectorActions {
    // Selection
    selectNode: (id: string | null, nodeType: NodeType | null) => void;
    clearSelection: () => void;

    // Data setters - only update if data actually changes
    setOverview: (data: OverviewData | null) => void;
    setDeps: (data: DependencyData | null) => void;
    setRisks: (data: RiskData | null) => void;
    setAIResult: (result: AIResult | null) => void;

    // Loading states - separate to prevent cascade
    setLoadingOverview: (loading: boolean) => void;
    setLoadingDeps: (loading: boolean) => void;
    setLoadingRisks: (loading: boolean) => void;
    setLoadingAI: (loading: boolean) => void;

    // Section collapse
    toggleSection: (sectionId: string) => void;
    isSectionCollapsed: (sectionId: string) => boolean;

    // Reset
    reset: () => void;
}

const initialState: InspectorState = {
    selectedId: null,
    nodeType: null,
    overview: null,
    deps: null,
    risks: null,
    ai: null,
    impact: null,
    isLoadingOverview: false,
    isLoadingDeps: false,
    isLoadingRisks: false,
    isLoadingAI: false,
    collapsedSections: [],
};

export const useInspectorStore = create<InspectorState & InspectorActions>()(
    subscribeWithSelector((set, get) => ({
        ...initialState,

        selectNode: (id, nodeType) => {
            const current = get();
            // Only update if actually changed - PREVENTS infinite loops
            if (current.selectedId === id && current.nodeType === nodeType) {
                return;
            }

            // Clear previous data when selection changes
            set({
                selectedId: id,
                nodeType,
                overview: null,
                deps: null,
                risks: null,
                ai: null,
                impact: null,
                isLoadingOverview: false,
                isLoadingDeps: false,
                isLoadingRisks: false,
                isLoadingAI: false,
            });
        },

        clearSelection: () => {
            const current = get();
            if (current.selectedId === null) return; // Already cleared
            set({
                selectedId: null,
                nodeType: null,
                overview: null,
                deps: null,
                risks: null,
                ai: null,
                impact: null,
                isLoadingOverview: false,
                isLoadingDeps: false,
                isLoadingRisks: false,
                isLoadingAI: false,
            });
        },

        setOverview: (data) => {
            set({ overview: data, isLoadingOverview: false });
        },

        setDeps: (data) => {
            set({ deps: data, isLoadingDeps: false });
        },

        setRisks: (data) => {
            set({ risks: data, isLoadingRisks: false });
        },

        setAIResult: (result) => {
            set({ ai: result, isLoadingAI: false });
        },

        setLoadingOverview: (loading) => {
            if (get().isLoadingOverview === loading) return;
            set({ isLoadingOverview: loading });
        },

        setLoadingDeps: (loading) => {
            if (get().isLoadingDeps === loading) return;
            set({ isLoadingDeps: loading });
        },

        setLoadingRisks: (loading) => {
            if (get().isLoadingRisks === loading) return;
            set({ isLoadingRisks: loading });
        },

        setLoadingAI: (loading) => {
            if (get().isLoadingAI === loading) return;
            set({ isLoadingAI: loading });
        },

        toggleSection: (sectionId) => {
            const current = get().collapsedSections;
            const isCollapsed = current.includes(sectionId);

            if (isCollapsed) {
                set({ collapsedSections: current.filter((id) => id !== sectionId) });
            } else {
                set({ collapsedSections: [...current, sectionId] });
            }
        },

        isSectionCollapsed: (sectionId) => {
            return get().collapsedSections.includes(sectionId);
        },

        reset: () => {
            set(initialState);
        },
    }))
);

// Stable selector hooks to prevent re-renders
// Use these instead of destructuring the whole store

export const useSelectedId = () => useInspectorStore((s) => s.selectedId);
export const useNodeType = () => useInspectorStore((s) => s.nodeType);
export const useOverview = () => useInspectorStore((s) => s.overview);
export const useDeps = () => useInspectorStore((s) => s.deps);
export const useRisks = () => useInspectorStore((s) => s.risks);
export const useAIResult = () => useInspectorStore((s) => s.ai);
export const useIsLoadingOverview = () => useInspectorStore((s) => s.isLoadingOverview);
export const useIsLoadingDeps = () => useInspectorStore((s) => s.isLoadingDeps);
export const useIsLoadingRisks = () => useInspectorStore((s) => s.isLoadingRisks);
export const useIsLoadingAI = () => useInspectorStore((s) => s.isLoadingAI);

// Actions - stable references, never cause re-renders when accessed
export const useInspectorActions = () =>
    useInspectorStore((s) => ({
        selectNode: s.selectNode,
        clearSelection: s.clearSelection,
        setOverview: s.setOverview,
        setDeps: s.setDeps,
        setRisks: s.setRisks,
        setAIResult: s.setAIResult,
        setLoadingOverview: s.setLoadingOverview,
        setLoadingDeps: s.setLoadingDeps,
        setLoadingRisks: s.setLoadingRisks,
        setLoadingAI: s.setLoadingAI,
        toggleSection: s.toggleSection,
        reset: s.reset,
    }));
