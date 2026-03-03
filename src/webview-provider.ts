import * as vscode from 'vscode';
import * as path from 'path';
import type { WorkerManager } from './worker/worker-manager';

export class GraphWebviewProvider {
    private panel: vscode.WebviewPanel | undefined;
    private disposables: vscode.Disposable[] = [];
    private isReady = false;
    private pendingTrace: { symbolId?: number, nodeId?: string } | null = null;

    constructor(
        private readonly context: vscode.ExtensionContext,
        private readonly workerManager: WorkerManager
    ) { }

    public async show() {
        if (this.panel) {
            this.panel.reveal(vscode.ViewColumn.One);
            return;
        }

        this.panel = vscode.window.createWebviewPanel(
            'codeGraphVisualization',
            'Code Graph Visualization',
            vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [
                    vscode.Uri.file(path.join(this.context.extensionPath, 'dist', 'webview'))
                ],
            }
        );

        this.panel.webview.html = this.getHtmlContent(this.panel.webview);

        // Handle messages from webview
        this.panel.webview.onDidReceiveMessage(
            async (message) => {
                switch (message.type) {
                    case 'ready':
                        this.isReady = true;
                        console.log('Webview ready');
                        await this.sendGraphData();
                        await this.sendArchitectureSkeleton();

                        if (this.pendingTrace) {
                            await this.sendFunctionTrace(this.pendingTrace.symbolId, this.pendingTrace.nodeId);
                            this.pendingTrace = null;
                        }
                        break;

                    case 'request-graph':
                        await this.sendGraphData();
                        break;

                    case 'request-architecture-skeleton':
                        await this.sendArchitectureSkeleton();
                        break;

                    case 'request-function-trace':
                        await this.sendFunctionTrace(message.symbolId, message.nodeId);
                        break;

                    case 'index-workspace':
                        vscode.commands.executeCommand('codeIndexer.indexWorkspace');
                        break;

                    case 'node-selected':
                        // Single click only selects the node in the webview (handled internally)
                        // We don't open the file on single click anymore
                        break;

                    case 'export-image':
                        vscode.window.showInformationMessage(
                            `Export as ${message.format} - Feature coming soon!`
                        );
                        break;

                    case 'open-file':
                        await this.openFile(message.filePath, message.line);
                        break;

                    // Inspector Panel message handlers
                    case 'inspector-overview':
                    case 'inspector-dependencies':
                    case 'inspector-risks':
                    case 'inspector-batch':
                    case 'inspector-ai-action':
                    case 'inspector-ai-why':
                        await this.handleInspectorMessage(message);
                        break;

                    case 'preview-refactor':
                        await this.handlePreviewRefactor(message.diff);
                        break;

                    case 'apply-refactor':
                        await this.handleApplyRefactor(message.diff);
                        break;

                    case 'cancel-refactor':
                        // Just acknowledge cancellation
                        break;
                }
            },
            null,
            this.disposables
        );

        // Handle panel disposal
        this.panel.onDidDispose(
            () => {
                this.panel = undefined;
                this.isReady = false;
                this.pendingTrace = null;
                this.disposables.forEach((d) => d.dispose());
                this.disposables = [];
            },
            null,
            this.disposables
        );

        // Data will be sent when 'ready' message is received
    }

    public async refresh() {
        if (this.panel) {
            await this.sendGraphData();
        }
    }

    public async traceSymbol(symbolId?: number, nodeId?: string) {
        if (this.panel && this.isReady) {
            await this.sendFunctionTrace(symbolId, nodeId);
            this.panel.reveal(vscode.ViewColumn.One);
        } else {
            this.pendingTrace = { symbolId, nodeId };
            await this.show();
        }
    }

    public async postMessage(message: any) {
        if (this.panel) {
            await this.panel.webview.postMessage(message);
        }
    }

    private async sendGraphData() {
        if (!this.panel) {
            return;
        }

        try {
            // Export graph from worker
            const graphData = await this.workerManager.exportGraph();
            console.log(`Sending graph data to webview: ${graphData.symbols.length} symbols, ${graphData.edges.length} edges`);

            // Send to webview
            this.panel.webview.postMessage({
                type: 'graph-data',
                data: graphData,
            });
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            vscode.window.showErrorMessage(`Failed to load graph data: ${errorMessage}`);
            this.panel.webview.postMessage({
                type: 'error',
                message: errorMessage
            });
        }
    }

    private async sendArchitectureSkeleton() {
        if (!this.panel) return;
        try {
            const skeleton = await this.workerManager.getArchitectureSkeleton();
            this.panel.webview.postMessage({
                type: 'architecture-skeleton',
                data: skeleton
            });
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            vscode.window.showErrorMessage(`Failed to get architecture skeleton: ${errorMessage}`);
            this.panel.webview.postMessage({
                type: 'error',
                message: errorMessage
            });
        }
    }

    public refreshArchitectureSkeleton(skeleton: any) {
        if (this.panel) {
            this.panel.webview.postMessage({
                type: 'architecture-skeleton',
                data: skeleton
            });
        }
    }

    private async sendFunctionTrace(symbolId?: number, nodeId?: string) {
        if (!this.panel) return;
        try {
            const trace = await this.workerManager.traceFunction(symbolId, nodeId);
            this.panel.webview.postMessage({
                type: 'function-trace',
                data: trace
            });
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to trace function: ${error}`);
        }
    }

    private async openFile(filePath: string, line: number) {
        try {
            let absolutePath = filePath;
            const workspaceFolders = vscode.workspace.workspaceFolders;

            if (workspaceFolders && workspaceFolders.length > 0) {
                const root = workspaceFolders[0].uri.fsPath;
                // If it's not already an absolute path within the workspace
                if (!filePath.startsWith(root)) {
                    // Handle both "src/app..." and "/src/app..."
                    const relativePath = filePath.startsWith('/') ? filePath.substring(1) : filePath;
                    absolutePath = path.join(root, relativePath);
                }
            }

            const uri = vscode.Uri.file(absolutePath);
            const document = await vscode.workspace.openTextDocument(uri);
            const editor = await vscode.window.showTextDocument(document, {
                viewColumn: vscode.ViewColumn.Beside,
                preserveFocus: true, // Keep focus on the graph so user can continue interacting
            });

            // Jump to line
            const position = new vscode.Position(Math.max(0, line - 1), 0);
            editor.selection = new vscode.Selection(position, position);
            editor.revealRange(
                new vscode.Range(position, position),
                vscode.TextEditorRevealType.InCenter
            );
        } catch (error) {
            vscode.window.showErrorMessage(
                `Failed to open file: ${error instanceof Error ? error.message : String(error)}`
            );
        }
    }

    private async handleInspectorMessage(message: {
        type: string;
        requestId: string;
        nodeId: string;
        nodeType?: 'domain' | 'file' | 'symbol';
        action?: string;
        metric?: string;
    }): Promise<void> {
        if (!this.panel) return;

        const messageId = `inspector-${Date.now()}`;

        try {
            const response = await this.workerManager.sendInspectorRequest({
                type: message.type as any,
                id: messageId,
                requestId: message.requestId,
                nodeId: message.nodeId,
                nodeType: message.nodeType,
                action: message.action,
                metric: message.metric,
            });

            this.panel.webview.postMessage({
                ...response,
                requestId: message.requestId,
            });
        } catch (error) {
            this.panel.webview.postMessage({
                type: `${message.type}-error`,
                requestId: message.requestId,
                error: error instanceof Error ? error.message : String(error),
            });
        }
    }

    private async handlePreviewRefactor(message: { diff: string }): Promise<void> {
        try {
            const doc = await vscode.workspace.openTextDocument({
                content: message.diff,
                language: 'diff'
            });
            await vscode.window.showTextDocument(doc);
        } catch (error) {
            vscode.window.showErrorMessage(
                `Failed to preview refactor: ${error instanceof Error ? error.message : String(error)}`
            );
        }
    }

    private async handleApplyRefactor(_message: { diff: string }): Promise<void> {
        try {
            const confirm = await vscode.window.showWarningMessage(
                'Apply refactor changes? This will modify your files.',
                { modal: true },
                'Apply'
            );

            if (confirm !== 'Apply') {
                return;
            }

            vscode.window.showInformationMessage('Refactor application not yet implemented');
        } catch (error) {
            vscode.window.showErrorMessage(
                `Failed to apply refactor: ${error instanceof Error ? error.message : String(error)}`
            );
        }
    }

    private getHtmlContent(webview: vscode.Webview): string {
        const scriptUri = webview.asWebviewUri(
            vscode.Uri.file(path.join(this.context.extensionPath, 'dist', 'webview', 'index.js'))
        );
        const styleUri = webview.asWebviewUri(
            vscode.Uri.file(path.join(this.context.extensionPath, 'dist', 'webview', 'index.css'))
        );

        const nonce = getNonce();

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; img-src ${webview.cspSource} data:; connect-src ${webview.cspSource} data:;">
    <link href="${styleUri}" rel="stylesheet">
    <title>Code Graph Visualization</title>
    <style>
        body, html, #root {
            margin: 0;
            padding: 0;
            width: 100%;
            height: 100%;
            overflow: hidden;
        }
    </style>
</head>
<body>
    <div id="root"></div>
    <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
    }

    public dispose() {
        if (this.panel) {
            this.panel.dispose();
        }
        this.disposables.forEach((d) => d.dispose());
    }
}

function getNonce() {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}
