/**
 * Dependencies Section Component
 *
 * Shows dependency lists based on node type:
 * - Symbol: Calls → / Called By ←
 * - File: Imports → / Used By ←
 *
 * Each item is clickable to focus that node in the graph
 */

import { memo, useCallback, useMemo } from 'react';
import { useNodeType, useDeps, useIsLoadingDeps } from '../../stores/useInspectorStore';
import CollapsibleSection from './CollapsibleSection';
import type { DependencyItem } from '../../types/inspector';

interface DependenciesSectionProps {
    onDependencyClick: (nodeId: string) => void;
}

// Single dependency item
interface DependencyRowProps {
    item: DependencyItem;
    onClick: (id: string) => void;
}

const DependencyRow = memo(({ item, onClick }: DependencyRowProps) => {
    const handleClick = useCallback(() => {
        onClick(item.id);
    }, [onClick, item.id]);

    const handleKeyDown = useCallback(
        (e: React.KeyboardEvent) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onClick(item.id);
            }
        },
        [onClick, item.id]
    );

    return (
        <div
            className="dependency-item"
            onClick={handleClick}
            onKeyDown={handleKeyDown}
            tabIndex={0}
            role="button"
            title={item.filePath}
        >
            <span className="dependency-icon">
                {item.type === 'function' || item.type === 'method' ? '⚡' : '📦'}
            </span>
            <span className="dependency-name">{item.name}</span>
            <span className="dependency-type">{item.type}</span>
        </div>
    );
});

DependencyRow.displayName = 'DependencyRow';

// Dependency list with header
interface DependencyListProps {
    title: string;
    icon: string;
    items: DependencyItem[] | undefined | null;
    onItemClick: (id: string) => void;
    maxItems?: number;
}

const DependencyList = memo(
    ({ title, icon, items, onItemClick, maxItems = 10 }: DependencyListProps) => {
        // Guard: items may be undefined if the data provider returns null for this dep group
        const safeItems = items ?? [];

        const displayItems = useMemo(
            () => (safeItems.length > maxItems ? safeItems.slice(0, maxItems) : safeItems),
            [safeItems, maxItems]
        );

        const hasMore = safeItems.length > maxItems;

        if (safeItems.length === 0) {
            return (
                <div className="dependency-list empty">
                    <div className="dependency-list-header">
                        <span>{icon}</span>
                        <span>{title}</span>
                        <span className="dependency-count">(0)</span>
                    </div>
                    <div className="dependency-empty">None</div>
                </div>
            );
        }

        return (
            <div className="dependency-list">
                <div className="dependency-list-header">
                    <span>{icon}</span>
                    <span>{title}</span>
                    <span className="dependency-count">({safeItems.length})</span>
                </div>
                <div className="dependency-items">
                    {displayItems.map((item) => (
                        <DependencyRow key={item.id} item={item} onClick={onItemClick} />
                    ))}
                    {hasMore && (
                        <div className="dependency-more">
                            +{safeItems.length - maxItems} more...
                        </div>
                    )}
                </div>
            </div>
        );
    }
);

DependencyList.displayName = 'DependencyList';

const DependenciesSection = memo(({ onDependencyClick }: DependenciesSectionProps) => {
    const nodeType = useNodeType();
    const deps = useDeps();
    const isLoading = useIsLoadingDeps();

    // Determine which lists to show based on node type
    const lists = useMemo(() => {
        if (!deps || !nodeType) return [];

        switch (nodeType) {
            case 'symbol':
                return [
                    { title: 'Calls', icon: '→', items: deps.calls ?? [] },
                    { title: 'Called By', icon: '←', items: deps.calledBy ?? [] },
                ];
            case 'file':
                return [
                    { title: 'Imports', icon: '→', items: deps.imports ?? [] },
                    { title: 'Used By', icon: '←', items: deps.usedBy ?? [] },
                ];
            case 'domain':
                // Domains show file-level dependencies
                return [
                    { title: 'Files', icon: '📄', items: deps.imports ?? [] },
                    { title: 'Depends On', icon: '→', items: deps.calls ?? [] },
                ];
            default:
                return [];
        }
    }, [deps, nodeType]);

    return (
        <CollapsibleSection
            id="dependencies"
            title="Dependencies"
            icon="🔗"
            loading={isLoading}
        >
            {lists.length > 0 ? (
                <div className="dependencies-container">
                    {lists.map((list) => (
                        <DependencyList
                            key={list.title}
                            title={list.title}
                            icon={list.icon}
                            items={list.items}
                            onItemClick={onDependencyClick}
                        />
                    ))}
                </div>
            ) : (
                <div className="inspector-empty-section">No dependencies</div>
            )}
        </CollapsibleSection>
    );
});

DependenciesSection.displayName = 'DependenciesSection';

export default DependenciesSection;
