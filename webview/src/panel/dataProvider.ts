/**
 * Inspector Panel Data Provider
 *
 * Centralized data fetching layer with:
 * - Single batched round-trip (inspector-batch) for overview + deps + risks
 * - Request/response correlation via requestId
 * - Timeout handling & request cancellation
 * - 5-minute in-memory cache (data is stable between re-indexes)
 * - Public peekCache() for instant cache-hit detection (used by prefetch path)
 *
 * NO database logic - all queries go through extension → worker
 */

import type { VSCodeAPI } from '../types';
import type { NodeType, OverviewData, DependencyData, RiskData, AIResult } from '../types/inspector';

interface PendingRequest<T> {
    resolve: (value: T) => void;
    reject: (error: Error) => void;
    timeout: ReturnType<typeof setTimeout>;
    requestType: string;
}

interface CacheEntry<T> {
    data: T;
    timestamp: number;
}

export interface BatchData {
    overview: OverviewData;
    deps: DependencyData;
    risks: RiskData;
}

class InspectorDataProvider {
    private vscode: VSCodeAPI;
    private pendingRequests = new Map<string, PendingRequest<unknown>>();
    private cache = new Map<string, CacheEntry<unknown>>();

    // 5 minutes — index data is stable between re-index runs.
    // Invalidated explicitly when the user triggers a re-index.
    private readonly cacheTTL = 300_000;
    private readonly defaultTimeout = 10_000; // 10 seconds
    private messageHandlerBound = false;

    constructor(vscode: VSCodeAPI) {
        this.vscode = vscode;
        this.setupMessageHandler();
    }

    private setupMessageHandler(): void {
        if (this.messageHandlerBound) return;
        this.messageHandlerBound = true;

        window.addEventListener('message', (event) => {
            const message = event.data;

            // Only handle messages with requestId that we're tracking
            if (!message.requestId) return;

            const pending = this.pendingRequests.get(message.requestId);
            if (!pending) return;

            // Clear timeout and remove from pending
            clearTimeout(pending.timeout);
            this.pendingRequests.delete(message.requestId);

            // Resolve or reject based on response
            if (message.error) {
                pending.reject(new Error(message.error));
            } else if (message.data && (message.data as any).error) {
                pending.reject(new Error((message.data as any).error));
            } else {
                pending.resolve(message.data);
            }
        });
    }

    private generateRequestId(): string {
        return `inspector-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    }

    private getCacheKey(type: string, id: string): string {
        return `${type}:${id}`;
    }

    private getFromCache<T>(key: string): T | null {
        const cached = this.cache.get(key);
        if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
            return cached.data as T;
        }
        if (cached) this.cache.delete(key); // evict expired
        return null;
    }

    private setCache<T>(key: string, data: T): void {
        this.cache.set(key, { data, timestamp: Date.now() });
    }

    /**
     * Public cache peek — returns cached batch data without making any requests.
     * Used by prefetch logic to determine if data is already ready (0ms display).
     */
    peekCache(id: string): BatchData | null {
        return this.getFromCache<BatchData>(this.getCacheKey('batch', id));
    }

    /**
     * Send request to extension and wait for response
     */
    private request<T>(
        type: string,
        payload: Record<string, unknown>,
        timeoutMs = this.defaultTimeout
    ): Promise<T> {
        const requestId = this.generateRequestId();

        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                this.pendingRequests.delete(requestId);
                reject(new Error(`Request timeout: ${type}`));
            }, timeoutMs);

            this.pendingRequests.set(requestId, {
                resolve: resolve as (value: unknown) => void,
                reject,
                timeout,
                requestType: type,
            });

            this.vscode.postMessage({
                type,
                requestId,
                ...payload,
            });
        });
    }

    /**
     * ⚡ FAST PATH: Fetch overview + deps + risks in a SINGLE round-trip.
     * Falls back to individual requests if batch fails.
     * Always populates individual caches too so getOverview/getDeps/getRisks hit cache.
     */
    async getAll(id: string, nodeType: NodeType): Promise<BatchData> {
        const batchKey = this.getCacheKey('batch', id);
        const cached = this.getFromCache<BatchData>(batchKey);
        if (cached) return cached;

        const data = await this.request<BatchData>('inspector-batch', {
            nodeId: id,
            nodeType,
        });

        // Populate batch cache
        this.setCache(batchKey, data);

        // Also populate individual caches so calls to getOverview/getDeps/getRisks
        // (e.g. from legacy code) also get instant hits
        this.setCache(this.getCacheKey('overview', id), data.overview);
        this.setCache(this.getCacheKey('deps', id), data.deps);
        this.setCache(this.getCacheKey('risks', id), data.risks);

        return data;
    }

    /**
     * Get overview data for a node
     */
    async getOverview(id: string, nodeType: NodeType): Promise<OverviewData> {
        const cacheKey = this.getCacheKey('overview', id);
        const cached = this.getFromCache<OverviewData>(cacheKey);
        if (cached) return cached;

        // If a batch is in flight or cached, use that
        const batchCached = this.getFromCache<BatchData>(this.getCacheKey('batch', id));
        if (batchCached) return batchCached.overview;

        const data = await this.request<OverviewData>('inspector-overview', {
            nodeId: id,
            nodeType,
        });

        this.setCache(cacheKey, data);
        return data;
    }

    /**
     * Get dependencies for a node
     */
    async getDependencies(id: string, nodeType: NodeType): Promise<DependencyData> {
        const cacheKey = this.getCacheKey('deps', id);
        const cached = this.getFromCache<DependencyData>(cacheKey);
        if (cached) return cached;

        const batchCached = this.getFromCache<BatchData>(this.getCacheKey('batch', id));
        if (batchCached) return batchCached.deps;

        const data = await this.request<DependencyData>('inspector-dependencies', {
            nodeId: id,
            nodeType,
        });

        this.setCache(cacheKey, data);
        return data;
    }

    /**
     * Get risk data for a node
     */
    async getRisks(id: string, nodeType: NodeType): Promise<RiskData> {
        const cacheKey = this.getCacheKey('risks', id);
        const cached = this.getFromCache<RiskData>(cacheKey);
        if (cached) return cached;

        const batchCached = this.getFromCache<BatchData>(this.getCacheKey('batch', id));
        if (batchCached) return batchCached.risks;

        const data = await this.request<RiskData>('inspector-risks', {
            nodeId: id,
            nodeType,
        });

        this.setCache(cacheKey, data);
        return data;
    }

    /**
     * Execute an AI action (explain, audit, refactor, etc.)
     * Longer timeout since AI can take a while
     */
    async executeAIAction(
        id: string,
        action: 'explain' | 'audit' | 'refactor' | 'optimize'
    ): Promise<AIResult> {
        const cacheKey = this.getCacheKey(`ai-${action}`, id);
        const cached = this.getFromCache<AIResult>(cacheKey);
        if (cached) {
            return { ...cached, cached: true };
        }

        const result = await this.request<AIResult>(
            'inspector-ai-action',
            { nodeId: id, action },
            200_000 // 200s — Gemini can take 120-173s for complex symbols
        );

        this.setCache(cacheKey, result);
        return result;
    }

    /**
     * Ask AI to explain a specific risk metric
     */
    async explainRisk(id: string, metric: string): Promise<string> {
        return this.request<string>('inspector-ai-why', { nodeId: id, metric }, 15_000);
    }

    /**
     * Cancel only data-fetch requests (overview / deps / risks / batch).
     * AI action requests are intentionally LEFT running — they are expensive
     * and the user expects a result even if they click elsewhere on the graph.
     */
    cancelDataRequests(): void {
        const AI_TYPES = new Set(['inspector-ai-action', 'inspector-ai-why']);
        for (const [requestId, pending] of this.pendingRequests) {
            if (!AI_TYPES.has(pending.requestType)) {
                clearTimeout(pending.timeout);
                pending.reject(new Error('Request cancelled'));
                this.pendingRequests.delete(requestId);
            }
        }
    }

    /**
     * Cancel ALL pending requests (use only on panel teardown / hard reset)
     */
    cancelPendingRequests(): void {
        for (const [, pending] of this.pendingRequests) {
            clearTimeout(pending.timeout);
            pending.reject(new Error('Request cancelled'));
        }
        this.pendingRequests.clear();
    }

    /**
     * Invalidate all cached inspector data (call after re-index completes).
     * AI results are preserved since they depend on code structure, not index state.
     */
    invalidateCache(): void {
        const AI_PREFIX_RE = /^ai-/;
        for (const key of this.cache.keys()) {
            const type = key.split(':')[0];
            if (!AI_PREFIX_RE.test(type)) {
                this.cache.delete(key);
            }
        }
    }

    /**
     * Clear the entire cache including AI results
     */
    clearCache(): void {
        this.cache.clear();
    }

    /** Get pending request count (for debugging) */
    getPendingCount(): number {
        return this.pendingRequests.size;
    }
}

// Singleton instance
let providerInstance: InspectorDataProvider | null = null;

/**
 * Get the singleton data provider instance
 */
export function getDataProvider(vscode: VSCodeAPI): InspectorDataProvider {
    if (!providerInstance) {
        providerInstance = new InspectorDataProvider(vscode);
    }
    return providerInstance;
}

/**
 * Reset the provider (useful for testing / hard resets)
 */
export function resetDataProvider(): void {
    if (providerInstance) {
        providerInstance.cancelPendingRequests();
        providerInstance.clearCache();
    }
    providerInstance = null;
}
