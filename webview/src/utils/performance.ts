/**
 * Performance monitoring and optimization utilities
 */

export class PerformanceMonitor {
    private frameCount = 0;
    private lastTime = performance.now();
    private fps = 60;
    private fpsCallback?: (fps: number) => void;
    private rafId: number | null = null;

    start(callback?: (fps: number) => void) {
        this.fpsCallback = callback;
        this.measureFPS();
    }

    stop() {
        if (this.rafId !== null) {
            cancelAnimationFrame(this.rafId);
            this.rafId = null;
        }
    }

    private measureFPS = () => {
        const now = performance.now();
        this.frameCount++;

        if (now >= this.lastTime + 1000) {
            this.fps = Math.round((this.frameCount * 1000) / (now - this.lastTime));
            this.frameCount = 0;
            this.lastTime = now;

            if (this.fpsCallback) {
                this.fpsCallback(this.fps);
            }
        }

        this.rafId = requestAnimationFrame(this.measureFPS);
    };

    getFPS(): number {
        return this.fps;
    }
}

/**
 * Throttle function calls for performance
 */
export function throttle<T extends (...args: any[]) => any>(
    func: T,
    limit: number
): (...args: Parameters<T>) => void {
    let inThrottle: boolean;
    return function (this: any, ...args: Parameters<T>) {
        if (!inThrottle) {
            func.apply(this, args);
            inThrottle = true;
            setTimeout(() => (inThrottle = false), limit);
        }
    };
}

/**
 * Debounce function calls
 */
export function debounce<T extends (...args: any[]) => any>(
    func: T,
    wait: number
): (...args: Parameters<T>) => void {
    let timeout: NodeJS.Timeout | null;
    return function (this: any, ...args: Parameters<T>) {
        if (timeout) clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), wait);
    };
}

/**
 * Optimize edges for large graphs
 * Sample edges if there are too many
 */
export function optimizeEdges<T extends { id: string }>(
    edges: T[],
    maxEdges: number = 1000
): T[] {
    if (edges.length <= maxEdges) {
        return edges;
    }

    // Sample edges evenly
    const step = edges.length / maxEdges;
    const sampledEdges: T[] = [];

    for (let i = 0; i < edges.length; i += step) {
        sampledEdges.push(edges[Math.floor(i)]);
    }

    return sampledEdges;
}

/**
 * Check if a node is in viewport
 */
export function isNodeInViewport(
    nodePosition: { x: number; y: number },
    nodeSize: { width: number; height: number },
    viewport: { x: number; y: number; zoom: number },
    viewportSize: { width: number; height: number }
): boolean {
    const { x, y } = nodePosition;
    const { width, height } = nodeSize;
    const { x: vx, y: vy, zoom } = viewport;
    const { width: vw, height: vh } = viewportSize;

    const nodeLeft = x * zoom + vx;
    const nodeRight = (x + width) * zoom + vx;
    const nodeTop = y * zoom + vy;
    const nodeBottom = (y + height) * zoom + vy;

    return (
        nodeRight >= 0 &&
        nodeLeft <= vw &&
        nodeBottom >= 0 &&
        nodeTop <= vh
    );
}
