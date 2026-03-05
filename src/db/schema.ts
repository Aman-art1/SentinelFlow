// Purpose: Define the database schema for code indexing
// This schema represents the codebase as a graph:
// - symbols = nodes (functions, classes, variables)
// - edges = relationships (imports, calls, inheritance)
// - files = file tracking for incremental indexing
// - meta = indexing state and cache metadata

import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

/**
 * Symbols Table
 * Stores all code symbols (functions, classes, variables, etc.)
 * extracted from the AST
 */
export const symbols = sqliteTable('symbols', {
    id: integer('id').primaryKey({ autoIncrement: true }),
    name: text('name').notNull(),
    type: text('type').notNull(), // function, class, variable, interface, etc.
    filePath: text('file_path').notNull(),
    rangeStartLine: integer('range_start_line').notNull(),
    rangeStartColumn: integer('range_start_column').notNull(),
    rangeEndLine: integer('range_end_line').notNull(),
    rangeEndColumn: integer('range_end_column').notNull(),
    complexity: integer('complexity').notNull().default(0),
    domain: text('domain'), // Domain classification (auth, payment, api, etc.)
    purpose: text('purpose'), // AI-inferred purpose
    impactDepth: integer('impact_depth'), // AI-inferred impact depth
    searchTags: text('search_tags'), // AI-inferred search tags (JSON)
    fragility: text('fragility'), // AI-inferred fragility
    riskScore: integer('risk_score'), // AI-calculated risk score 0-100
    riskReason: text('risk_reason'), // AI explanation of risk (e.g. "if this fails, auth flow stops")
});

/**
 * Edges Table
 * Stores relationships between symbols
 * (imports, function calls, inheritance, etc.)
 */
export const edges = sqliteTable('edges', {
    id: integer('id').primaryKey({ autoIncrement: true }),
    sourceId: integer('source_id')
        .notNull()
        .references(() => symbols.id, { onDelete: 'cascade' }),
    targetId: integer('target_id')
        .notNull()
        .references(() => symbols.id, { onDelete: 'cascade' }),
    type: text('type').notNull(), // import, call, inherit, implement
    reason: text('reason'), // Reason for implicit dependencies
});

/**
 * Files Table
 * Tracks files for incremental indexing
 * Only re-index files when content hash changes
 */
export const files = sqliteTable('files', {
    id: integer('id').primaryKey({ autoIncrement: true }),
    filePath: text('file_path').notNull().unique(),
    contentHash: text('content_hash').notNull(),
    lastIndexedAt: text('last_indexed_at').notNull(),
});

/**
 * Meta Table
 * Stores project metadata and indexing state
 * (file hashes, last index time, etc.)
 */
export const meta = sqliteTable('meta', {
    key: text('key').primaryKey(),
    value: text('value').notNull(),
});

// Type exports for use in the application
export type Symbol = typeof symbols.$inferSelect;
export type NewSymbol = typeof symbols.$inferInsert;
export type Edge = typeof edges.$inferSelect;
export type NewEdge = typeof edges.$inferInsert;
export type File = typeof files.$inferSelect;
export type NewFile = typeof files.$inferInsert;
export type Meta = typeof meta.$inferSelect;
export type NewMeta = typeof meta.$inferInsert;

/**
 * Symbol context for AI prompts (cAST)
 * Contains the target symbol plus its immediate neighbors (1st-degree connections)
 */
export interface SymbolContext {
    symbol: Symbol;
    neighbors: Symbol[];
    outgoingEdges: Edge[];
    incomingEdges: Edge[];
}

/**
 * AI Cache Table
 * Stores AI responses to avoid redundant API calls
 * Key: hash(node_code + neighbors_code)
 */
export const aiCache = sqliteTable('ai_cache', {
    hash: text('hash').primaryKey(),
    response: text('response').notNull(), // JSON stringified AIResponse
    createdAt: text('created_at').notNull(),
});

export type AICacheEntry = typeof aiCache.$inferSelect;
export type NewAICacheEntry = typeof aiCache.$inferInsert;

/**
 * Domain Metadata Table
 * Stores computed health metrics for each domain
 */
export const domainMetadata = sqliteTable('domain_metadata', {
    domain: text('domain').primaryKey(),
    healthScore: integer('health_score').notNull(),
    complexity: integer('complexity').notNull(),
    coupling: integer('coupling').notNull(),
    symbolCount: integer('symbol_count').notNull(),
    lastUpdated: text('last_updated').notNull(),
});

export type DomainMetadata = typeof domainMetadata.$inferSelect;
export type NewDomainMetadata = typeof domainMetadata.$inferInsert;

/**
 * Domain Cache Table
 * Stores AI-classified domains to avoid redundant API calls
 */
export const domainCache = sqliteTable('domain_cache', {
    symbolId: integer('symbol_id').primaryKey(),
    domain: text('domain').notNull(),
    confidence: integer('confidence').notNull(), // 0-100 scale
    cachedAt: text('cached_at').notNull(),
});

export type DomainCacheEntry = typeof domainCache.$inferSelect;
export type NewDomainCacheEntry = typeof domainCache.$inferInsert;

/**
 * Technical Debt Table
 * Stores detected code smells and debt items per symbol
 */
export const technicalDebt = sqliteTable('technical_debt', {
    id: integer('id').primaryKey({ autoIncrement: true }),
    symbolId: integer('symbol_id')
        .notNull()
        .references(() => symbols.id, { onDelete: 'cascade' }),
    smellType: text('smell_type').notNull(), // long_method, god_object, feature_envy, high_fan_out
    severity: text('severity').notNull(), // high, medium, low
    description: text('description').notNull(),
    detectedAt: text('detected_at').notNull(),
});

export type TechnicalDebtItem = typeof technicalDebt.$inferSelect;
export type NewTechnicalDebtItem = typeof technicalDebt.$inferInsert;
