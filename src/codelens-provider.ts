import * as vscode from 'vscode';
import { WorkerManager } from './worker/worker-manager';

/**
 * Provides CodeLens for files to show "Heat" (complexity)
 */
export class HeatCodeLensProvider implements vscode.CodeLensProvider {
    private workerManager: WorkerManager;
    private _onDidChangeCodeLenses: vscode.EventEmitter<void> = new vscode.EventEmitter<void>();
    public readonly onDidChangeCodeLenses: vscode.Event<void> = this._onDidChangeCodeLenses.event;

    constructor(workerManager: WorkerManager) {
        this.workerManager = workerManager;
    }

    /**
     * Refresh CodeLens
     */
    refresh(): void {
        this._onDidChangeCodeLenses.fire();
    }

    async provideCodeLenses(
        document: vscode.TextDocument,
        token: vscode.CancellationToken
    ): Promise<vscode.CodeLens[]> {
        // Only provide for supported languages
        if (!['typescript', 'typescriptreact', 'python', 'c'].includes(document.languageId)) {
            return [];
        }

        try {
            // Query symbols to get complexity "heatmap"
            // We use queryFile which returns symbols for the specific file
            const symbols = await this.workerManager.queryFile(document.uri.fsPath);

            const lenses: vscode.CodeLens[] = [];

            for (const symbol of symbols) {
                // Only show for functions and classes
                if (symbol.type !== 'function' && symbol.type !== 'class' && symbol.type !== 'method') {
                    continue;
                }

                const range = new vscode.Range(
                    symbol.range.startLine - 1,
                    symbol.range.startColumn,
                    symbol.range.endLine - 1,
                    symbol.range.endColumn
                );

                const command: vscode.Command = {
                    title: `$(flame) Heat: ${symbol.complexity}`,
                    tooltip: `Cyclomatic Complexity: ${symbol.complexity}`,
                    command: '', // No command action for now, just information
                    arguments: []
                };

                lenses.push(new vscode.CodeLens(range, command));
            }

            return lenses;
        } catch (error) {
            console.error('Failed to provide code lenses:', error);
            return [];
        }
    }
}

/**
 * Provides CodeLens for functions to trigger "Trace" view
 */
export class TraceCodeLensProvider implements vscode.CodeLensProvider {
    private workerManager: WorkerManager;
    private _onDidChangeCodeLenses: vscode.EventEmitter<void> = new vscode.EventEmitter<void>();
    public readonly onDidChangeCodeLenses: vscode.Event<void> = this._onDidChangeCodeLenses.event;

    constructor(workerManager: WorkerManager) {
        this.workerManager = workerManager;
    }

    refresh(): void {
        this._onDidChangeCodeLenses.fire();
    }

    async provideCodeLenses(
        document: vscode.TextDocument,
        token: vscode.CancellationToken
    ): Promise<vscode.CodeLens[]> {
        if (!['typescript', 'typescriptreact', 'python', 'c'].includes(document.languageId)) {
            return [];
        }

        try {
            const symbols = await this.workerManager.queryFile(document.uri.fsPath);
            const lenses: vscode.CodeLens[] = [];

            for (const symbol of symbols) {
                // Only show for function-like structures
                if (symbol.type !== 'function' && symbol.type !== 'method') {
                    continue;
                }

                const range = new vscode.Range(
                    symbol.range.startLine - 1,
                    symbol.range.startColumn,
                    symbol.range.startLine - 1, // Place on the start line
                    symbol.range.startColumn + symbol.name.length
                );

                const command: vscode.Command = {
                    title: `$(search) Trace`,
                    tooltip: `View execution trace for ${symbol.name}`,
                    command: 'architect.traceFunction',
                    arguments: [symbol.id, `${symbol.filePath}:${symbol.name}:${symbol.range.startLine}`]
                };

                lenses.push(new vscode.CodeLens(range, command));
            }

            return lenses;
        } catch (error) {
            console.error('Failed to provide trace code lenses:', error);
            return [];
        }
    }
}
