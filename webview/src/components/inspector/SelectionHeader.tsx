/**
 * Selection Header Component
 *
 * Always visible at top of inspector panel
 * Shows icon, name, path, type, and last modified
 */

import { memo, useMemo } from 'react';
import { useSelectedId, useNodeType, useOverview } from '../../stores/useInspectorStore';

const NODE_ICONS: Record<string, string> = {
    domain: '🔐',
    file: '📄',
    symbol: '⚡',
};

const NODE_TYPE_LABELS: Record<string, string> = {
    domain: 'Domain',
    file: 'File',
    symbol: 'Symbol',
};

const SelectionHeader = memo(() => {
    const selectedId = useSelectedId();
    const nodeType = useNodeType();
    const overview = useOverview();

    const displayInfo = useMemo(() => {
        const icon = nodeType ? NODE_ICONS[nodeType] : '📋';
        const typeLabel = nodeType ? NODE_TYPE_LABELS[nodeType] : '';

        // Use overview data if available
        if (overview) {
            return {
                icon,
                name: overview.name,
                path: overview.path,
                typeLabel,
                lastModified: overview.lastModified,
            };
        }

        // Parse from selectedId as fallback
        if (selectedId) {
            // Parse domain:filePath:symbolName:line format
            if (selectedId.startsWith('domain:')) {
                return {
                    icon: '🔐',
                    name: selectedId.replace('domain:', ''),
                    path: '',
                    typeLabel: 'Domain',
                    lastModified: undefined,
                };
            }

            const parts = selectedId.split(':');
            if (parts.length >= 3) {
                // Symbol: domain:filePath:symbolName:line
                return {
                    icon,
                    name: parts[parts.length - 2] || selectedId,
                    path: parts.slice(0, -2).join(':'),
                    typeLabel,
                    lastModified: undefined,
                };
            }

            return {
                icon,
                name: parts[parts.length - 1] || selectedId,
                path: parts.length > 1 ? parts.slice(0, -1).join(':') : '',
                typeLabel,
                lastModified: undefined,
            };
        }

        return {
            icon: '📋',
            name: 'No selection',
            path: '',
            typeLabel: '',
            lastModified: undefined,
        };
    }, [selectedId, nodeType, overview]);

    return (
        <div className="inspector-selection-header">
            <div className="selection-icon">{displayInfo.icon}</div>
            <div className="selection-info">
                <div className="selection-name" title={displayInfo.name}>
                    {displayInfo.name}
                </div>
                {displayInfo.path && (
                    <div className="selection-path" title={displayInfo.path}>
                        {displayInfo.path}
                    </div>
                )}
                {displayInfo.typeLabel && (
                    <div className="selection-type">{displayInfo.typeLabel}</div>
                )}
                {displayInfo.lastModified && (
                    <div className="selection-modified">
                        Modified: {new Date(displayInfo.lastModified).toLocaleDateString()}
                    </div>
                )}
            </div>
        </div>
    );
});

SelectionHeader.displayName = 'SelectionHeader';

export default SelectionHeader;
