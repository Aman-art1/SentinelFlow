/**
 * Collapsible Section Component
 *
 * PERFORMANCE: Memoized with stable callbacks
 * - Uses shallow comparison for props
 * - Loading state doesn't cause children re-render
 */

import { memo, useCallback, ReactNode } from 'react';
import { useInspectorStore } from '../../stores/useInspectorStore';

interface CollapsibleSectionProps {
    id: string;
    title: string;
    icon: string;
    children: ReactNode;
    loading?: boolean;
}

const CollapsibleSection = memo(
    ({ id, title, icon, children, loading = false }: CollapsibleSectionProps) => {
        // Use individual selectors to prevent unnecessary re-renders
        const collapsedSections = useInspectorStore((s) => s.collapsedSections);
        const toggleSection = useInspectorStore((s) => s.toggleSection);

        const isCollapsed = collapsedSections.includes(id);

        const handleToggle = useCallback(() => {
            toggleSection(id);
        }, [toggleSection, id]);

        return (
            <div className={`inspector-section ${isCollapsed ? 'collapsed' : ''}`}>
                <button
                    className="inspector-section-header"
                    onClick={handleToggle}
                    aria-expanded={!isCollapsed}
                    type="button"
                >
                    <span className="inspector-section-icon">{icon}</span>
                    <span className="inspector-section-title">{title}</span>
                    <span className="inspector-section-chevron">
                        {isCollapsed ? '▶' : '▼'}
                    </span>
                    {loading && <span className="inspector-loading-dot" />}
                </button>
                {!isCollapsed && (
                    <div className="inspector-section-content">
                        {loading ? <SectionSkeleton /> : children}
                    </div>
                )}
            </div>
        );
    }
);

const SectionSkeleton = memo(() => (
    <div className="inspector-skeleton">
        <div className="skeleton-line" style={{ width: '80%' }} />
        <div className="skeleton-line" style={{ width: '60%' }} />
        <div className="skeleton-line" style={{ width: '70%' }} />
    </div>
));

SectionSkeleton.displayName = 'SectionSkeleton';
CollapsibleSection.displayName = 'CollapsibleSection';

export default CollapsibleSection;
