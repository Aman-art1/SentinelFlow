// File A: Imports from File B and File C
// Tests import resolution and call graph edges

import { Calculator } from './fileB';
import { runTests, TestRunner } from './fileC';

/**
 * Main application entry point
 */
export function main(): number {
    // Create and use Calculator from fileB
    const calc = new Calculator();
    const sum = calc.add(5, 10);
    const product = calc.multiply(3, 7);

    // Use runTests from fileC
    runTests();

    // Use TestRunner class from fileC
    const runner = new TestRunner();
    runner.run();

    return sum + product;
}

/**
 * Helper function that internally calls other functions
 */
export function processAndTest(): void {
    main();
    runTests();
}

/**
 * Configuration setup
 */
export const config = {
    name: 'Validation App',
    version: '1.0.0',
};
