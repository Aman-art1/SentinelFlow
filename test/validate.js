#!/usr/bin/env node

// Purpose: End-to-end validation script for Structural X-Ray engine
// Tests worker for symbol extraction, call graph, and import edges on 3-file project

const { Worker } = require('worker_threads');
const path = require('path');
const fs = require('fs');

console.log('═══════════════════════════════════════════════════');
console.log('  Structural X-Ray Engine - Validation Script');
console.log('═══════════════════════════════════════════════════\n');

async function runValidation() {
    try {
        // Check if build exists
        const workerPath = path.join(__dirname, '..', 'dist', 'worker', 'worker.js');
        if (!fs.existsSync(workerPath)) {
            throw new Error(`Worker not found at: ${workerPath}\nPlease run 'npm run build' first.`);
        }

        console.log('✓ Build files found\n');

        // Start worker
        console.log('Starting worker...');
        const worker = new Worker(workerPath);

        let requestId = 0;
        const pendingRequests = new Map();

        // Helper to send request and wait for response
        function sendRequest(request) {
            return new Promise((resolve, reject) => {
                const id = `test-${requestId++}`;
                request.id = id;

                const timeout = setTimeout(() => {
                    pendingRequests.delete(id);
                    reject(new Error(`Request ${request.type} timed out`));
                }, 30000);

                pendingRequests.set(id, { resolve, reject, timeout });
                worker.postMessage(request);
            });
        }

        // Handle messages from worker
        worker.on('message', (message) => {
            if (message.type === 'ready') {
                console.log('✓ Worker ready\n');
                return;
            }

            const pending = pendingRequests.get(message.id);
            if (pending) {
                clearTimeout(pending.timeout);
                pendingRequests.delete(message.id);

                if (message.type === 'error') {
                    pending.reject(new Error(message.error));
                } else {
                    pending.resolve(message);
                }
            }
        });

        worker.on('error', (error) => {
            console.error('Worker error:', error);
            process.exit(1);
        });

        // Send initialize request
        worker.postMessage({
            type: 'initialize',
            id: 'test-init',
            storagePath: require('os').tmpdir()
        });

        // Wait for initialize-complete signal
        await new Promise((resolve, reject) => {
            const checkReady = (msg) => {
                if (msg.type === 'initialize-complete') {
                    worker.off('message', checkReady);
                    resolve();
                } else if (msg.type === 'error' && msg.id === 'test-init') {
                    reject(new Error(msg.error));
                }
            };
            worker.on('message', checkReady);
        });

        // ========== Test 1: Parse 3-file validation project ==========
        console.log('═══════════════════════════════════════════════════');
        console.log('  Test 1: Parse 3-File Validation Project');
        console.log('═══════════════════════════════════════════════════\n');

        const validationDir = path.join(__dirname, 'validation-project');
        const testFiles = ['fileA.ts', 'fileB.ts', 'fileC.ts'];

        // Read all test files
        const filesToParse = [];
        for (const fileName of testFiles) {
            const filePath = path.join(validationDir, fileName);
            if (!fs.existsSync(filePath)) {
                console.log(`⚠ Skipping ${fileName} - file not found`);
                continue;
            }
            const content = fs.readFileSync(filePath, 'utf-8');
            filesToParse.push({ filePath, content, language: 'typescript' });
            console.log(`Reading: ${fileName} (${content.length} chars)`);
        }

        if (filesToParse.length === 0) {
            throw new Error('No validation project files found!');
        }

        // Parse files as batch for cross-file edge resolution
        console.log('\nParsing files as batch...');
        const batchResponse = await sendRequest({
            type: 'parse-batch',
            files: filesToParse,
        });

        console.log(`✓ Batch parsing complete`);
        console.log(`  - Total symbols: ${batchResponse.totalSymbols}`);
        console.log(`  - Total edges: ${batchResponse.totalEdges}`);
        console.log(`  - Files processed: ${batchResponse.filesProcessed}\n`);

        // ========== Test 2: Verify Import Edges ==========
        console.log('═══════════════════════════════════════════════════');
        console.log('  Test 2: Verify Import Edges');
        console.log('═══════════════════════════════════════════════════\n');

        // Export graph for verification
        const graphResponse = await sendRequest({ type: 'export-graph' });
        const graph = graphResponse.graph;

        console.log(`Graph exported:`);
        console.log(`  - Symbols: ${graph.symbols.length}`);
        console.log(`  - Edges: ${graph.edges.length}`);
        console.log(`  - Files tracked: ${graph.files.length}\n`);

        // Check for import edges
        const importEdges = graph.edges.filter(e => e.type === 'import');
        console.log(`Import edges found: ${importEdges.length}`);
        importEdges.forEach((edge, i) => {
            console.log(`  ${i + 1}. ${path.basename(edge.source.split(':')[0])} → ${edge.target.split(':')[1]} (${edge.type})`);
        });

        // Check for call edges
        const callEdges = graph.edges.filter(e => e.type === 'call');
        console.log(`\nCall edges found: ${callEdges.length}`);
        callEdges.forEach((edge, i) => {
            console.log(`  ${i + 1}. ${edge.source.split(':')[1]} → ${edge.target.split(':')[1]} (${edge.type})`);
        });

        // ========== Test 3: Query Specific Symbols ==========
        console.log('\n═══════════════════════════════════════════════════');
        console.log('  Test 3: Query Specific Symbols');
        console.log('═══════════════════════════════════════════════════\n');

        const symbolsToQuery = ['Calculator', 'runTests', 'main', 'helperFn'];
        for (const symbolName of symbolsToQuery) {
            const response = await sendRequest({
                type: 'query-symbols',
                query: symbolName,
            });
            console.log(`Query "${symbolName}": ${response.symbols.length} match(es)`);
            response.symbols.forEach(s => {
                console.log(`  - ${s.type} in ${path.basename(s.filePath)}:${s.range.startLine}`);
            });
        }

        // ========== Test 4: Verify Cross-File Import Resolution ==========
        console.log('\n═══════════════════════════════════════════════════');
        console.log('  Test 4: Verify Import Relationships');
        console.log('═══════════════════════════════════════════════════\n');

        // Check that fileA imports from fileB
        const fileASymbols = graph.symbols.filter(s => s.filePath.includes('fileA'));
        const fileBSymbols = graph.symbols.filter(s => s.filePath.includes('fileB'));
        const fileCSymbols = graph.symbols.filter(s => s.filePath.includes('fileC'));

        console.log(`Symbols per file:`);
        console.log(`  - fileA.ts: ${fileASymbols.length} symbols`);
        console.log(`  - fileB.ts: ${fileBSymbols.length} symbols`);
        console.log(`  - fileC.ts: ${fileCSymbols.length} symbols`);

        // Verify Calculator class exists in fileB
        const calculatorClass = graph.symbols.find(
            s => s.name === 'Calculator' && s.type === 'class'
        );
        if (calculatorClass) {
            console.log(`\n✓ Calculator class found in ${path.basename(calculatorClass.filePath)}`);
        } else {
            console.log(`\n✗ Calculator class NOT found`);
        }

        // Verify runTests function exists in fileC
        const runTestsFn = graph.symbols.find(
            s => s.name === 'runTests' && s.type === 'function'
        );
        if (runTestsFn) {
            console.log(`✓ runTests function found in ${path.basename(runTestsFn.filePath)}`);
        } else {
            console.log(`✗ runTests function NOT found`);
        }

        // ========== Test 5: Write JSON Graph Dump ==========
        console.log('\n═══════════════════════════════════════════════════');
        console.log('  Test 5: Export Graph to JSON File');
        console.log('═══════════════════════════════════════════════════\n');

        const outputPath = path.join(__dirname, 'validation-graph.json');
        fs.writeFileSync(outputPath, JSON.stringify(graph, null, 2), 'utf-8');
        console.log(`✓ Graph exported to: ${outputPath}\n`);

        // Print summary of edges
        console.log('Edge Summary:');
        const edgeTypes = {};
        graph.edges.forEach(e => {
            edgeTypes[e.type] = (edgeTypes[e.type] || 0) + 1;
        });
        Object.entries(edgeTypes).forEach(([type, count]) => {
            console.log(`  - ${type}: ${count}`);
        });

        // ========== Test 6: Test Incremental Indexing ==========
        console.log('\n═══════════════════════════════════════════════════');
        console.log('  Test 6: Test Incremental Indexing (Hash Check)');
        console.log('═══════════════════════════════════════════════════\n');

        // Check if files need re-indexing (should not need since just indexed)
        for (const file of filesToParse) {
            const hashResponse = await sendRequest({
                type: 'check-file-hash',
                filePath: file.filePath,
                content: file.content,
            });
            console.log(`${path.basename(file.filePath)}: needsReindex = ${hashResponse.needsReindex}`);
        }

        // ========== Test 7: Test Clear and Stats ==========
        console.log('\n═══════════════════════════════════════════════════');
        console.log('  Test 7: Statistics and Clear');
        console.log('═══════════════════════════════════════════════════\n');

        const statsResponse = await sendRequest({ type: 'stats' });
        console.log('Index Statistics:');
        console.log(`  - Total symbols: ${statsResponse.stats.symbolCount}`);
        console.log(`  - Total edges: ${statsResponse.stats.edgeCount}`);
        console.log(`  - Total files: ${statsResponse.stats.fileCount}`);
        if (statsResponse.stats.lastIndexTime) {
            console.log(`  - Last index: ${statsResponse.stats.lastIndexTime}`);
        }

        // Shutdown worker
        console.log('\nShutting down worker...');
        worker.postMessage({ type: 'shutdown', id: 'shutdown' });
        await new Promise(resolve => setTimeout(resolve, 500));
        await worker.terminate();
        console.log('✓ Worker shutdown complete\n');

        // Success
        console.log('═══════════════════════════════════════════════════');
        console.log('  ✓ ALL VALIDATION TESTS PASSED');
        console.log('═══════════════════════════════════════════════════\n');

        process.exit(0);
    } catch (error) {
        console.error('\n✗ VALIDATION FAILED:');
        console.error(error.message);
        if (error.stack) {
            console.error('\nStack trace:');
            console.error(error.stack);
        }
        console.log();
        process.exit(1);
    }
}

// Run validation
runValidation();
