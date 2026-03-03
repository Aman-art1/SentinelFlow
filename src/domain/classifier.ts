// Purpose: Domain classification for organizing symbols into logical systems
// Classifies code into domains like Auth, Payment, API, Database, etc.
// Uses path heuristics, import analysis, and optional AI classification

/**
 * Domain types for system organization
 */
export enum DomainType {
    AUTH = 'auth',
    PAYMENT = 'payment',
    API = 'api',
    DATABASE = 'database',
    NOTIFICATION = 'notification',
    CORE = 'core',
    UI = 'ui',
    UTIL = 'util',
    TEST = 'test',
    CONFIG = 'config',
    UNKNOWN = 'unknown',
}

/**
 * Domain classification result
 */
export interface DomainClassification {
    domain: DomainType;
    confidence: number; // 0-1 scale
    reason: string; // Why this domain was chosen
}

/**
 * Domain detection patterns
 */
interface DomainPattern {
    domain: DomainType;
    paths: RegExp[];
    imports: string[];
    keywords: string[];
}

const DOMAIN_PATTERNS: DomainPattern[] = [
    {
        domain: DomainType.AUTH,
        paths: [/\/auth\//i, /\/authentication\//i, /\/login\//i, /\/signup\//i, /\/session\//i],
        imports: ['jwt', 'jsonwebtoken', 'passport', 'bcrypt', 'bcryptjs', 'auth0', 'next-auth'],
        keywords: ['login', 'logout', 'signin', 'signup', 'authenticate', 'authorize', 'token', 'session'],
    },
    {
        domain: DomainType.PAYMENT,
        paths: [/\/payment\//i, /\/billing\//i, /\/checkout\//i, /\/subscription\//i],
        imports: ['stripe', 'paypal', 'square', 'braintree', 'paddle'],
        keywords: ['payment', 'billing', 'checkout', 'subscription', 'invoice', 'charge'],
    },
    {
        domain: DomainType.DATABASE,
        paths: [/\/models\//i, /\/entities\//i, /\/schema\//i, /\/db\//i, /\/database\//i],
        imports: ['pg', 'postgres', 'mysql', 'mongodb', 'mongoose', 'typeorm', 'prisma', 'drizzle', 'sequelize', 'knex'],
        keywords: ['model', 'schema', 'entity', 'repository', 'query', 'migration'],
    },
    {
        domain: DomainType.API,
        paths: [/\/api\//i, /\/routes\//i, /\/controllers\//i, /\/endpoints\//i, /\/handlers\//i],
        imports: ['express', 'fastify', 'koa', 'hapi', 'axios', 'fetch', 'graphql', 'apollo'],
        keywords: ['route', 'controller', 'endpoint', 'handler', 'middleware', 'request', 'response'],
    },
    {
        domain: DomainType.NOTIFICATION,
        paths: [/\/notifications\//i, /\/email\//i, /\/sms\//i, /\/messaging\//i],
        imports: ['nodemailer', 'sendgrid', 'mailgun', 'twilio', 'firebase-admin', 'pusher'],
        keywords: ['notification', 'email', 'sms', 'push', 'alert', 'message'],
    },
    {
        domain: DomainType.UI,
        paths: [/\/components\//i, /\/views\//i, /\/pages\//i, /\/ui\//i, /\/frontend\//i],
        imports: ['react', 'vue', 'angular', 'svelte', 'solid-js', '@xyflow/react'],
        keywords: ['component', 'view', 'page', 'render', 'jsx', 'tsx'],
    },
    {
        domain: DomainType.UTIL,
        paths: [/\/utils\//i, /\/helpers\//i, /\/lib\//i, /\/common\//i],
        imports: ['lodash', 'ramda', 'date-fns', 'dayjs', 'moment'],
        keywords: ['util', 'helper', 'common', 'shared', 'library'],
    },
    {
        domain: DomainType.TEST,
        paths: [/\/test\//i, /\/tests\//i, /\/__tests__\//i, /\.test\./i, /\.spec\./i],
        imports: ['jest', 'vitest', 'mocha', 'chai', 'jasmine', '@testing-library'],
        keywords: ['test', 'spec', 'mock', 'fixture', 'describe', 'it'],
    },
    {
        domain: DomainType.CONFIG,
        paths: [/\/config\//i, /\/settings\//i, /\/env\//i],
        imports: ['dotenv', 'config'],
        keywords: ['config', 'configuration', 'settings', 'environment'],
    },
    {
        domain: DomainType.CORE,
        paths: [/\/core\//i, /\/kernel\//i, /\/engine\//i],
        imports: [],
        keywords: ['core', 'kernel', 'engine', 'main', 'app'],
    },
];

/**
 * Domain Classifier
 * Analyzes file paths and imports to determine which domain a symbol belongs to
 *
 * Performance note: Use classifyByPathCached() when classifying all symbols in
 * a file — it caches results so pattern matching runs only once per file path.
 */
export class DomainClassifier {
    /** Per-file cache: filePath → DomainClassification */
    private fileCache: Map<string, DomainClassification> = new Map();

    /**
     * Classify a file-level domain once and cache it.
     * All symbols in the same file share the same domain.
     */
    classifyByPathCached(filePath: string, imports: string[] = []): DomainClassification {
        const cached = this.fileCache.get(filePath);
        if (cached) return cached;
        const result = this.classify(filePath, imports, undefined);
        this.fileCache.set(filePath, result);
        return result;
    }

    /** Invalidate the cache for a specific file (e.g. after re-index). */
    invalidateCache(filePath: string): void {
        this.fileCache.delete(filePath);
    }

    /** Clear the entire cache (e.g. on workspace close). */
    clearCache(): void {
        this.fileCache.clear();
    }

    /**
     * Classify a file/symbol into a domain
     * @param filePath - Absolute path to the file
     * @param imports - List of import statements or package names
     * @param symbolName - Optional symbol name for keyword matching
     */
    classify(filePath: string, imports: string[] = [], symbolName?: string): DomainClassification {
        const scores: Map<DomainType, { score: number; reasons: string[] }> = new Map();

        // Initialize scores
        for (const pattern of DOMAIN_PATTERNS) {
            scores.set(pattern.domain, { score: 0, reasons: [] });
        }

        // 1. Path-based matching (highest confidence)
        for (const pattern of DOMAIN_PATTERNS) {
            for (const pathRegex of pattern.paths) {
                if (pathRegex.test(filePath)) {
                    const entry = scores.get(pattern.domain)!;
                    entry.score += 100; // High weight for path matches
                    entry.reasons.push(`path matches ${pathRegex.source}`);
                }
            }
        }

        // 2. Import-based matching (medium confidence)
        for (const pattern of DOMAIN_PATTERNS) {
            for (const importPattern of pattern.imports) {
                if (imports.some(imp => imp.includes(importPattern))) {
                    const entry = scores.get(pattern.domain)!;
                    entry.score += 50; // Medium weight for import matches
                    entry.reasons.push(`imports include ${importPattern}`);
                }
            }
        }

        // 3. Keyword-based matching (lower confidence)
        if (symbolName) {
            const lowerName = symbolName.toLowerCase();
            for (const pattern of DOMAIN_PATTERNS) {
                for (const keyword of pattern.keywords) {
                    if (lowerName.includes(keyword)) {
                        const entry = scores.get(pattern.domain)!;
                        entry.score += 10; // Low weight for keyword matches
                        entry.reasons.push(`symbol name contains "${keyword}"`);
                    }
                }
            }
        }

        // Find the domain with highest score
        let bestDomain = DomainType.UNKNOWN;
        let bestScore = 0;
        let bestReasons: string[] = [];

        for (const [domain, data] of scores) {
            if (data.score > bestScore) {
                bestScore = data.score;
                bestDomain = domain;
                bestReasons = data.reasons;
            }
        }

        // Calculate confidence (0-1 scale)
        // Path match (100) = 1.0, Import match (50) = 0.7, Keyword (10) = 0.3
        let confidence = 0;
        if (bestScore >= 100) {
            confidence = 1.0;
        } else if (bestScore >= 50) {
            confidence = 0.7;
        } else if (bestScore > 0) {
            confidence = 0.3;
        } else {
            confidence = 0;
        }

        return {
            domain: bestDomain,
            confidence,
            reason: bestReasons.length > 0 ? bestReasons.join(', ') : 'no matching patterns',
        };
    }

    /**
     * Classify based only on file path
     */
    classifyByPath(filePath: string): DomainClassification {
        return this.classify(filePath, [], undefined);
    }

    /**
     * Get all available domain types
     */
    static getDomainTypes(): DomainType[] {
        return Object.values(DomainType);
    }

    /**
     * Get human-readable name for a domain
     */
    static getDomainDisplayName(domain: DomainType): string {
        const names: Record<DomainType, string> = {
            [DomainType.AUTH]: 'Authentication',
            [DomainType.PAYMENT]: 'Payment',
            [DomainType.API]: 'API',
            [DomainType.DATABASE]: 'Database',
            [DomainType.NOTIFICATION]: 'Notification',
            [DomainType.CORE]: 'Core',
            [DomainType.UI]: 'UI',
            [DomainType.UTIL]: 'Utilities',
            [DomainType.TEST]: 'Tests',
            [DomainType.CONFIG]: 'Configuration',
            [DomainType.UNKNOWN]: 'Unknown',
        };
        return names[domain];
    }

    /**
     * Get icon for a domain (emoji)
     */
    static getDomainIcon(domain: DomainType): string {
        const icons: Record<DomainType, string> = {
            [DomainType.AUTH]: '🔐',
            [DomainType.PAYMENT]: '💳',
            [DomainType.API]: '🔌',
            [DomainType.DATABASE]: '🗄️',
            [DomainType.NOTIFICATION]: '🔔',
            [DomainType.CORE]: '⚙️',
            [DomainType.UI]: '🎨',
            [DomainType.UTIL]: '🔧',
            [DomainType.TEST]: '🧪',
            [DomainType.CONFIG]: '⚙️',
            [DomainType.UNKNOWN]: '❓',
        };
        return icons[domain];
    }
}
