// File C: Imports from File B and exports TestRunner
// Tests multi-file import chains

import { Calculator, helperFn } from './fileB';

/**
 * Run test suite
 */
export function runTests(): void {
    const calc = new Calculator();

    // Test addition
    const sum = calc.add(10, 20);
    console.log(`Sum: ${sum}`);

    // Test multiplication
    const product = calc.multiply(5, 6);
    console.log(`Product: ${product}`);

    // Use helper function
    const helperResult = helperFn();
    console.log(`Helper: ${helperResult}`);
}

/**
 * Test runner class
 */
export class TestRunner {
    private results: boolean[] = [];

    /**
     * Run all tests
     */
    run(): void {
        runTests();
        this.results.push(true);
    }

    /**
     * Run with custom calculator
     */
    runWithCalculator(): number {
        const calc = new Calculator();
        const result = calc.add(1, 2);
        this.results.push(result === 3);
        return result;
    }

    /**
     * Get test results
     */
    getResults(): boolean[] {
        return [...this.results];
    }
}

/**
 * Quick test utility
 */
export const quickTest = (): boolean => {
    const calc = new Calculator();
    return calc.add(2, 2) === 4;
};
