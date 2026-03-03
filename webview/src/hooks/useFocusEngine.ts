import { useCallback, useRef, useEffect } from 'react';
import type { ReactFlowInstance } from '@xyflow/react';
import type { FocusConfig } from '../types/viewMode';
import { DEFAULT_FOCUS_CONFIG } from '../types/viewMode';

/**
 * Auto-Focus Engine Hook
 * Handles viewport centering, zoom, and debouncing
 */

interface UseFocusEngineOptions {
    config?: Partial<FocusConfig>;
}

interface UseFocusEngineReturn {
    focusNode: (nodeId: string) => void;
    clearFocus: () => void;
}

export function useFocusEngine(
    reactFlowInstance: ReactFlowInstance | null,
    options: UseFocusEngineOptions = {}
): UseFocusEngineReturn {
    const config: FocusConfig = {
        ...DEFAULT_FOCUS_CONFIG,
        ...options.config,
    };

    const debounceTimer = useRef<NodeJS.Timeout | null>(null);
    const lastFocusedRef = useRef<string | null>(null);

    // Clean up debounce timer on unmount
    useEffect(() => {
        return () => {
            if (debounceTimer.current) {
                clearTimeout(debounceTimer.current);
            }
        };
    }, []);

    /**
     * Focus on a node with animation
     * Debounced to prevent rapid focus changes
     */
    const focusNode = useCallback(
        (nodeId: string) => {
            // Clear existing timer
            if (debounceTimer.current) {
                clearTimeout(debounceTimer.current);
            }

            // Debounce the focus operation
            debounceTimer.current = setTimeout(() => {
                if (!reactFlowInstance) return;

                // Center viewport with animation (Less intense zoom)
                reactFlowInstance.fitView({
                    nodes: [{ id: nodeId }],
                    duration: config.centerDuration,
                    padding: 2.5, // Much larger padding = less zoom
                });

                // Note: Opacity/highlighting is handled by graphFilter
                // We don't manipulate DOM directly here
            }, config.debounceMs);
        },
        [reactFlowInstance, config]
    );

    /**
     * Clear focus and reset viewport
     */
    const clearFocus = useCallback(() => {
        if (debounceTimer.current) {
            clearTimeout(debounceTimer.current);
        }

        lastFocusedRef.current = null;

        if (reactFlowInstance) {
            // Fit view to show all nodes
            reactFlowInstance.fitView({
                duration: config.centerDuration,
                padding: 0.2,
            });
        }
    }, [reactFlowInstance, config.centerDuration]);

    return { focusNode, clearFocus };
}

/**
 * Debounced callback hook (utility)
 */
export function useDebouncedCallback<T extends (...args: any[]) => any>(
    callback: T,
    delay: number
): (...args: Parameters<T>) => void {
    const timeoutRef = useRef<NodeJS.Timeout | null>(null);

    useEffect(() => {
        return () => {
            if (timeoutRef.current) {
                clearTimeout(timeoutRef.current);
            }
        };
    }, []);

    return useCallback(
        (...args: Parameters<T>) => {
            if (timeoutRef.current) {
                clearTimeout(timeoutRef.current);
            }

            timeoutRef.current = setTimeout(() => {
                callback(...args);
            }, delay);
        },
        [callback, delay]
    );
}
