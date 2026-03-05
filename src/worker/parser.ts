// Purpose: Tree-sitter parser initialization and management
// Handles WASM parser loading and AST generation
// Runs exclusively in worker thread

import Parser from 'web-tree-sitter';

export class TreeSitterParser {
    private parser: Parser | null = null;
    private languages: Map<string, Parser.Language> = new Map();
    private initialized: boolean = false;

    /**
     * Initialize tree-sitter WASM and load language grammars
     */
    async initialize(): Promise<void> {
        if (this.initialized) {
            return;
        }

        // Initialize tree-sitter WASM
        await Parser.init();
        this.parser = new Parser();

        // Load language grammars from node_modules
        try {
            // Load TypeScript WASM
            const typescriptWasmPath = require.resolve('tree-sitter-wasms/out/tree-sitter-typescript.wasm');
            const typescript = await Parser.Language.load(typescriptWasmPath);
            this.languages.set('typescript', typescript);

            // Load Python WASM
            const pythonWasmPath = require.resolve('tree-sitter-wasms/out/tree-sitter-python.wasm');
            const python = await Parser.Language.load(pythonWasmPath);
            this.languages.set('python', python);

            // Load C WASM
            const cWasmPath = require.resolve('tree-sitter-wasms/out/tree-sitter-c.wasm');
            const c = await Parser.Language.load(cWasmPath);
            this.languages.set('c', c);

            this.initialized = true;
        } catch (error) {
            throw new Error(`Failed to load tree-sitter grammars: ${error}`);
        }
    }

    /**
     * Parse source code and return AST
     */
    parse(code: string, language: 'typescript' | 'python' | 'c'): Parser.Tree {
        if (!this.parser || !this.initialized) {
            throw new Error('Parser not initialized. Call initialize() first.');
        }

        const lang = this.languages.get(language);
        if (!lang) {
            throw new Error(`Language ${language} not loaded`);
        }

        this.parser.setLanguage(lang);
        const tree = this.parser.parse(code);

        if (!tree) {
            throw new Error(`Failed to parse code as ${language}`);
        }

        return tree;
    }

    /**
     * Check if parser is ready
     */
    isReady(): boolean {
        return this.initialized;
    }

    /**
     * Get supported languages
     */
    getSupportedLanguages(): string[] {
        return Array.from(this.languages.keys());
    }

    /**
     * Generate structural skeleton for Gemini Architect Pass
     * Returns a simplified hierarchical JSON representation of the code
     */
    generateStructuralSkeleton(code: string, language: 'typescript' | 'python' | 'c'): StructuralSkeleton {
        const tree = this.parse(code, language);
        const root = tree.rootNode;

        const imports: string[] = [];
        const definitions: SkeletonNode[] = [];

        // Helper to extract identifier
        const getIdentifier = (node: Parser.SyntaxNode): string | null => {
            const child = node.children.find(c =>
                c.type === 'identifier' ||
                c.type === 'type_identifier' ||
                c.type === 'property_identifier' ||
                c.type === 'name' // Python
            );
            return child ? child.text : null;
        };

        // Recursive traversal
        const traverse = (node: Parser.SyntaxNode): SkeletonNode | null => {
            let type = '';
            let name = '';

            // TypeScript/JS Types
            if (['function_declaration', 'method_definition', 'class_declaration', 'interface_declaration', 'enum_declaration'].includes(node.type)) {
                type = node.type.replace('_declaration', '').replace('_definition', '');
                name = getIdentifier(node) || 'anonymous';
            }
            // Variable declaration with arrow function (simplified detection)
            else if (node.type === 'lexical_declaration' || node.type === 'variable_declaration') {
                const decl = node.children.find(c => c.type === 'variable_declarator');
                if (decl) {
                    const arrow = decl.children.find(c => c.type === 'arrow_function' || c.type === 'function_expression');
                    if (arrow) {
                        type = 'function';
                        name = getIdentifier(decl) || 'anonymous';
                    }
                }
            }
            // Python Types
            else if (['function_definition', 'class_definition'].includes(node.type)) {
                type = node.type.replace('_definition', '');
                name = getIdentifier(node) || 'anonymous';
            }

            // Collect imports (top-level only usually, but we check here)
            if (node.type === 'import_statement' || node.type === 'import_from_statement') {
                imports.push(node.text);
                return null;
            }

            if (type) {
                const skeletonNode: SkeletonNode = {
                    type,
                    name,
                    startLine: node.startPosition.row + 1,
                    endLine: node.endPosition.row + 1,
                    children: []
                };

                // Recurse for children
                for (let i = 0; i < node.childCount; i++) {
                    const child = node.child(i);
                    // For container nodes (like class body), define where to look
                    if (child) {
                        // Directly check children or dive into blocks
                        if (child.type === 'class_body' || child.type === 'statement_block' || child.type === 'block') {
                            for (let j = 0; j < child.childCount; j++) {
                                const subChild = child.child(j);
                                if (subChild) {
                                    const result = traverse(subChild);
                                    if (result) skeletonNode.children?.push(result);
                                }
                            }
                        } else {
                            // Some nodes might be direct children
                            const result = traverse(child);
                            if (result) skeletonNode.children?.push(result);
                        }
                    }
                }

                // If no children found by the above logic but we are in a wrapper, ensure we don't return empty children unless it's a leaf
                if (!skeletonNode.children?.length) delete skeletonNode.children;

                return skeletonNode;
            }

            // Continue traversal for non-definition nodes to find nested definitions
            for (let i = 0; i < node.childCount; i++) {
                const child = node.child(i);
                if (child) {
                    const result = traverse(child);
                    if (result) {
                        // If we found a definition but we are not one, where does it go?
                        // It should be added to the parent's list. 
                        // But here 'traverse' returns a node.
                        // This simple traversal assumes structure matches hierarchy.
                        // For top level, we add to 'definitions'.
                        // If we are inside a function but the function wrapper didn't trigger 'type', 
                        // we might just be in a block.
                    }
                }
            }

            return null;
        };

        // Top level traversal
        for (let i = 0; i < root.childCount; i++) {
            const child = root.child(i);
            if (child) {
                const result = traverse(child);
                if (result) {
                    definitions.push(result);
                } else {
                    // It might be a block or statement containing definitions
                    // But 'traverse' only returns if IT IS a definition.
                    // We need a way to bubble up nested definitions if the current node is not one.
                    // My recursive logic above is slightly flawed for "skipping" nodes.
                    // Let's refine: traverse should populate 'definitions' directly if at top level,
                    // or we need a proper visitor. 

                    // improved simple visitor:
                    const visit = (n: Parser.SyntaxNode, container: SkeletonNode[]) => {
                        let type = '';
                        let name = '';
                        let innerContainer: SkeletonNode[] | null = null;

                        // Identify type
                        if (['function_declaration', 'method_definition', 'class_declaration'].includes(n.type)) {
                            type = n.type.replace('_declaration', '').replace('_definition', '');
                            name = getIdentifier(n) || 'anonymous';
                        }
                        else if (n.type === 'lexical_declaration' || n.type === 'variable_declaration') {
                            const decl = n.children.find(c => c.type === 'variable_declarator');
                            if (decl) {
                                const arrow = decl.children.find(c => c.type === 'arrow_function' || c.type === 'function_expression');
                                if (arrow) {
                                    type = 'function';
                                    name = getIdentifier(decl) || 'anonymous';
                                }
                            }
                        }
                        else if (['function_definition', 'class_definition'].includes(n.type)) {
                            type = n.type.replace('_definition', '');
                            name = getIdentifier(n) || 'anonymous';
                        }

                        if (n.type === 'import_statement' || n.type === 'import_from_statement') {
                            imports.push(n.text);
                            return;
                        }

                        // PRUNING: Only include high-value logic nodes
                        // This reduces token usage significantly for large codebases
                        if (type && ['function', 'class', 'method'].includes(type)) {
                            const newNode: SkeletonNode = {
                                type,
                                name,
                                startLine: n.startPosition.row + 1,
                                endLine: n.endPosition.row + 1,
                                children: []
                            };
                            container.push(newNode);
                            innerContainer = newNode.children!;
                        }

                        // Recurse
                        for (let i = 0; i < n.childCount; i++) {
                            const child = n.child(i);
                            if (child) {
                                visit(child, innerContainer || container);
                            }
                        }

                        if (innerContainer && innerContainer.length === 0 && type) {
                            delete (container[container.length - 1] as any).children;
                        }
                    };

                    visit(child, definitions);
                }
            }
        }

        return {
            language,
            imports,
            definitions
        };
    }
}

export interface SkeletonNode {
    type: string;
    name: string;
    startLine: number;
    endLine: number;
    children?: SkeletonNode[];
}

export interface StructuralSkeleton {
    language: string;
    imports: string[];
    definitions: SkeletonNode[];
}
