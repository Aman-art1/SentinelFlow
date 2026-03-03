
import { GraphData, GraphSymbol, GraphEdge } from '../types';

export interface HierarchyNode {
    name: string;
    path: string; // Full path for ID
    type: 'root' | 'folder' | 'file' | 'symbol';
    children?: HierarchyNode[];
    size?: number; // For leaf nodes (width)
    colorValue?: number; // For impact/fragility
    data?: GraphSymbol; // specific data for symbols
}

/**
 * Converts flat GraphData into a hierarchical tree structure for D3 Sunburst.
 */
export const convertToHierarchy = (graphData: GraphData): HierarchyNode => {
    const root: HierarchyNode = {
        name: 'root',
        path: '/',
        type: 'root',
        children: []
    };

    // Helper to find or create folder path
    const getOrCreateFolder = (pathParts: string[], parent: HierarchyNode, fullPath: string): HierarchyNode => {
        if (pathParts.length === 0) return parent;

        const currentName = pathParts[0];
        const remainingParts = pathParts.slice(1);
        const currentPath = fullPath ? `${fullPath}/${currentName}` : currentName;

        let child = parent.children?.find(c => c.name === currentName && c.type === 'folder');

        if (!child) {
            child = {
                name: currentName,
                path: currentPath,
                type: 'folder',
                children: []
            };
            if (!parent.children) parent.children = [];
            parent.children.push(child);
        }

        return getOrCreateFolder(remainingParts, child, currentPath);
    };

    // 1. Structure Files and Folders
    // We can iterate through symbols directly, as they contain filePath.
    // However, files might be empty of symbols? graphData.files has all files.
    // Let's use graphData.files to build the skeleton, then populate symbols.

    const fileMap = new Map<string, HierarchyNode>();

    graphData.files.forEach(file => {
        // Normalize path
        const parts = file.filePath.split('/').filter(p => p);
        const fileName = parts.pop();
        if (!fileName) return;

        // Create folders
        const folderNode = getOrCreateFolder(parts, root, '');

        // Create File Node
        const fileNode: HierarchyNode = {
            name: fileName,
            path: file.filePath,
            type: 'file',
            children: []
        };

        if (!folderNode.children) folderNode.children = [];
        folderNode.children.push(fileNode);

        fileMap.set(file.filePath, fileNode);
    });

    // 2. Populate Symbols
    graphData.symbols.forEach(symbol => {
        const fileNode = fileMap.get(symbol.filePath);
        if (!fileNode) {
            // If file wasn't in graphData.files for some reason, create it?
            // Or just skip. Ideally strict consistency.
            // Let's skip for safety or fallback to creating it.
            return;
        }

        const symbolNode: HierarchyNode = {
            name: symbol.name,
            path: `${symbol.filePath}#${symbol.name}:${symbol.range.startLine}`,
            type: 'symbol',
            size: symbol.complexity || 1,
            colorValue: symbol.impactDepth, // Keep as undefined if missing
            data: symbol
        };

        if (!fileNode.children) fileNode.children = [];
        fileNode.children.push(symbolNode);
    });

    return root;
};
