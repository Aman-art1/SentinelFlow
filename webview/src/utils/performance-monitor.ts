/**
 * Performance Monitoring Utility
 * Tracks render performance and identifies bottlenecks
 */

interface PerformanceMetrics {
    filterTime: number;
    layoutTime: number;
    renderTime: number;
    totalTime: number;
    nodeCount: number;
    edgeCount: number;
}

class PerformanceMonitor {
    private metrics: PerformanceMetrics[] = [];
    private timers: Map<string, number> = new Map();
    private enabled: boolean = false;

    enable() {
        this.enabled = true;
        console.log('🔍 Performance monitoring enabled');
    }

    disable() {
        this.enabled = false;
    }

    startTimer(label: string) {
        if (!this.enabled) return;
        this.timers.set(label, performance.now());
    }

    endTimer(label: string): number {
        if (!this.enabled) return 0;

        const start = this.timers.get(label);
        if (!start) {
            console.warn(`Timer "${label}" was not started`);
            return 0;
        }

        const duration = performance.now() - start;
        this.timers.delete(label);

        if (duration > 16.67) { // Slower than 60 FPS
            console.warn(`⚠️ ${label} took ${duration.toFixed(2)}ms (>16.67ms)`);
        } else {
            console.log(`✓ ${label} took ${duration.toFixed(2)}ms`);
        }

        return duration;
    }

    recordMetrics(metrics: Partial<PerformanceMetrics>) {
        if (!this.enabled) return;

        const fullMetrics: PerformanceMetrics = {
            filterTime: 0,
            layoutTime: 0,
            renderTime: 0,
            totalTime: 0,
            nodeCount: 0,
            edgeCount: 0,
            ...metrics,
        };

        this.metrics.push(fullMetrics);

        // Keep only last 100 metrics
        if (this.metrics.length > 100) {
            this.metrics.shift();
        }
    }

    getAverageMetrics(): PerformanceMetrics | null {
        if (this.metrics.length === 0) return null;

        const sum = this.metrics.reduce(
            (acc, m) => ({
                filterTime: acc.filterTime + m.filterTime,
                layoutTime: acc.layoutTime + m.layoutTime,
                renderTime: acc.renderTime + m.renderTime,
                totalTime: acc.totalTime + m.totalTime,
                nodeCount: acc.nodeCount + m.nodeCount,
                edgeCount: acc.edgeCount + m.edgeCount,
            }),
            {
                filterTime: 0,
                layoutTime: 0,
                renderTime: 0,
                totalTime: 0,
                nodeCount: 0,
                edgeCount: 0,
            }
        );

        const count = this.metrics.length;
        return {
            filterTime: sum.filterTime / count,
            layoutTime: sum.layoutTime / count,
            renderTime: sum.renderTime / count,
            totalTime: sum.totalTime / count,
            nodeCount: sum.nodeCount / count,
            edgeCount: sum.edgeCount / count,
        };
    }

    printReport() {
        if (!this.enabled) {
            console.log('Performance monitoring is disabled');
            return;
        }

        const avg = this.getAverageMetrics();
        if (!avg) {
            console.log('No metrics collected yet');
            return;
        }

        console.log('📊 Performance Report (Average over last', this.metrics.length, 'renders)');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log(`Filter Time:  ${avg.filterTime.toFixed(2)}ms`);
        console.log(`Layout Time:  ${avg.layoutTime.toFixed(2)}ms`);
        console.log(`Render Time:  ${avg.renderTime.toFixed(2)}ms`);
        console.log(`Total Time:   ${avg.totalTime.toFixed(2)}ms`);
        console.log(`Nodes:        ${Math.round(avg.nodeCount)}`);
        console.log(`Edges:        ${Math.round(avg.edgeCount)}`);
        console.log(`Est. FPS:     ${(1000 / avg.totalTime).toFixed(1)}`);
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    }

    clear() {
        this.metrics = [];
        this.timers.clear();
    }
}

// Singleton instance
export const perfMonitor = new PerformanceMonitor();

// Expose to window for debugging
if (typeof window !== 'undefined') {
    (window as any).perfMonitor = perfMonitor;
}

// Usage in console:
// window.perfMonitor.enable()
// window.perfMonitor.printReport()
// window.perfMonitor.disable()
