// Purpose: Detect technical debt and code smells from the indexed symbol data
// Uses static analysis heuristics on symbol/edge data — no AI calls needed
// Detects: Long Methods, God Objects, Feature Envy, High Fan-Out

import { CodeIndexDatabase } from '../db/database';

/**
 * Code smell types detected by the analyzer
 */
export type SmellType = 'long_method' | 'god_object' | 'feature_envy' | 'high_fan_out';

/**
 * Severity of a detected code smell
 */
export type SmellSeverity = 'high' | 'medium' | 'low';

/**
 * A detected code smell / technical debt item
 */
export interface DebtItem {
    symbolId: number;
    symbolName: string;
    filePath: string;
    smellType: SmellType;
    severity: SmellSeverity;
    description: string;
}

/**
 * Configurable thresholds for code smell detection
 */
export interface DebtThresholds {
    longMethodLines: number;       // Default: 50
    godObjectMethods: number;      // Default: 10
    godObjectFields: number;       // Default: 20
    featureEnvyRatio: number;      // Default: 0.6 (60%+ external refs)
    highFanOutCalls: number;       // Default: 8
}

const DEFAULT_THRESHOLDS: DebtThresholds = {
    longMethodLines: 50,
    godObjectMethods: 10,
    godObjectFields: 20,
    featureEnvyRatio: 0.6,
    highFanOutCalls: 8,
};

/**
 * Technical Debt Detector
 * 
 * Analyzes the indexed code graph to identify common code smells:
 * 
 * 1. **Long Methods**: Functions with body > N lines (default 50)
 * 2. **God Objects**: Classes with > N methods or > M fields (default 10/20)
 * 3. **Feature Envy**: Functions that reference more external symbols than internal ones
 * 4. **High Fan-Out**: Functions calling > N other functions (default 8)
 * 
 * All detection uses the existing symbol/edge data in the DB — no AI call needed.
 */
export class TechnicalDebtDetector {
    private db: CodeIndexDatabase;
    private thresholds: DebtThresholds;

    constructor(db: CodeIndexDatabase, thresholds: Partial<DebtThresholds> = {}) {
        this.db = db;
        this.thresholds = { ...DEFAULT_THRESHOLDS, ...thresholds };
    }

    /**
     * Run all code smell detectors and return a combined list of debt items
     */
    detectAll(): DebtItem[] {
        const items: DebtItem[] = [];

        items.push(...this.detectLongMethods());
        items.push(...this.detectGodObjects());
        items.push(...this.detectHighFanOut());
        items.push(...this.detectFeatureEnvy());

        // Sort by severity (high first)
        const severityOrder: Record<SmellSeverity, number> = { high: 0, medium: 1, low: 2 };
        items.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

        return items;
    }

    /**
     * Detect Long Methods: functions with body > threshold lines
     */
    detectLongMethods(): DebtItem[] {
        const items: DebtItem[] = [];
        const allSymbols = this.db.getAllSymbols();

        for (const symbol of allSymbols) {
            if (symbol.type !== 'function' && symbol.type !== 'method') continue;

            const lineCount = symbol.rangeEndLine - symbol.rangeStartLine;

            if (lineCount > this.thresholds.longMethodLines * 2) {
                items.push({
                    symbolId: symbol.id,
                    symbolName: symbol.name,
                    filePath: symbol.filePath,
                    smellType: 'long_method',
                    severity: 'high',
                    description: `${symbol.name} has ${lineCount} lines (threshold: ${this.thresholds.longMethodLines}). Consider extracting sub-functions.`,
                });
            } else if (lineCount > this.thresholds.longMethodLines) {
                items.push({
                    symbolId: symbol.id,
                    symbolName: symbol.name,
                    filePath: symbol.filePath,
                    smellType: 'long_method',
                    severity: 'medium',
                    description: `${symbol.name} has ${lineCount} lines (threshold: ${this.thresholds.longMethodLines}). Consider refactoring.`,
                });
            }
        }

        return items;
    }

    /**
     * Detect God Objects: classes with too many methods or excessive complexity
     */
    detectGodObjects(): DebtItem[] {
        const items: DebtItem[] = [];
        const allSymbols = this.db.getAllSymbols();

        // Group symbols by file and parent class
        const classMethods = new Map<string, { classSymbol: any; methods: any[]; fields: any[] }>();

        for (const symbol of allSymbols) {
            if (symbol.type === 'class') {
                const key = `${symbol.filePath}:${symbol.name}`;
                if (!classMethods.has(key)) {
                    classMethods.set(key, { classSymbol: symbol, methods: [], fields: [] });
                }
            }
        }

        // Associate methods with their parent class (by file + line range)
        for (const symbol of allSymbols) {
            if (symbol.type === 'method' || symbol.type === 'function') {
                for (const [_key, classInfo] of classMethods) {
                    const cls = classInfo.classSymbol;
                    if (
                        symbol.filePath === cls.filePath &&
                        symbol.rangeStartLine >= cls.rangeStartLine &&
                        symbol.rangeEndLine <= cls.rangeEndLine
                    ) {
                        classInfo.methods.push(symbol);
                        break;
                    }
                }
            } else if (symbol.type === 'variable') {
                for (const [_key, classInfo] of classMethods) {
                    const cls = classInfo.classSymbol;
                    if (
                        symbol.filePath === cls.filePath &&
                        symbol.rangeStartLine >= cls.rangeStartLine &&
                        symbol.rangeEndLine <= cls.rangeEndLine
                    ) {
                        classInfo.fields.push(symbol);
                        break;
                    }
                }
            }
        }

        for (const [_key, classInfo] of classMethods) {
            const methodCount = classInfo.methods.length;
            const fieldCount = classInfo.fields.length;
            const cls = classInfo.classSymbol;

            if (methodCount > this.thresholds.godObjectMethods * 1.5 || fieldCount > this.thresholds.godObjectFields * 1.5) {
                items.push({
                    symbolId: cls.id,
                    symbolName: cls.name,
                    filePath: cls.filePath,
                    smellType: 'god_object',
                    severity: 'high',
                    description: `${cls.name} has ${methodCount} methods and ${fieldCount} fields. Consider splitting into smaller classes.`,
                });
            } else if (methodCount > this.thresholds.godObjectMethods || fieldCount > this.thresholds.godObjectFields) {
                items.push({
                    symbolId: cls.id,
                    symbolName: cls.name,
                    filePath: cls.filePath,
                    smellType: 'god_object',
                    severity: 'medium',
                    description: `${cls.name} has ${methodCount} methods and ${fieldCount} fields. Consider refactoring.`,
                });
            }
        }

        return items;
    }

    /**
     * Detect High Fan-Out: functions that call too many other functions
     */
    detectHighFanOut(): DebtItem[] {
        const items: DebtItem[] = [];
        const allSymbols = this.db.getAllSymbols();

        for (const symbol of allSymbols) {
            if (symbol.type !== 'function' && symbol.type !== 'method') continue;

            // Count outgoing call edges
            const outgoingCalls = this.db.getOutgoingEdges(symbol.id)
                .filter(e => e.type === 'call');

            if (outgoingCalls.length > this.thresholds.highFanOutCalls * 1.5) {
                items.push({
                    symbolId: symbol.id,
                    symbolName: symbol.name,
                    filePath: symbol.filePath,
                    smellType: 'high_fan_out',
                    severity: 'high',
                    description: `${symbol.name} calls ${outgoingCalls.length} functions (threshold: ${this.thresholds.highFanOutCalls}). High coupling risk.`,
                });
            } else if (outgoingCalls.length > this.thresholds.highFanOutCalls) {
                items.push({
                    symbolId: symbol.id,
                    symbolName: symbol.name,
                    filePath: symbol.filePath,
                    smellType: 'high_fan_out',
                    severity: 'medium',
                    description: `${symbol.name} calls ${outgoingCalls.length} functions (threshold: ${this.thresholds.highFanOutCalls}). Consider reducing dependencies.`,
                });
            }
        }

        return items;
    }

    /**
     * Detect Feature Envy: functions referencing more external symbols than internal
     */
    detectFeatureEnvy(): DebtItem[] {
        const items: DebtItem[] = [];
        const allSymbols = this.db.getAllSymbols();

        for (const symbol of allSymbols) {
            if (symbol.type !== 'function' && symbol.type !== 'method') continue;

            const outgoing = this.db.getOutgoingEdges(symbol.id);
            if (outgoing.length < 3) continue; // Too few references to analyze

            // Count internal vs external references
            let internalRefs = 0;
            let externalRefs = 0;

            for (const edge of outgoing) {
                const target = this.db.getSymbolById(edge.targetId);
                if (target) {
                    if (target.filePath === symbol.filePath) {
                        internalRefs++;
                    } else {
                        externalRefs++;
                    }
                }
            }

            const total = internalRefs + externalRefs;
            if (total === 0) continue;

            const externalRatio = externalRefs / total;

            if (externalRatio > this.thresholds.featureEnvyRatio) {
                const severity: SmellSeverity = externalRatio > 0.8 ? 'high' : 'medium';
                items.push({
                    symbolId: symbol.id,
                    symbolName: symbol.name,
                    filePath: symbol.filePath,
                    smellType: 'feature_envy',
                    severity,
                    description: `${symbol.name} references ${externalRefs} external symbols vs ${internalRefs} internal (${Math.round(externalRatio * 100)}% external). May belong in another module.`,
                });
            }
        }

        return items;
    }
}
