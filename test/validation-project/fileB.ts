// File B: Exports Calculator class and helper function
// Core module that other files import from

/**
 * Calculator class for arithmetic operations
 */
export class Calculator {
    private history: string[] = [];

    /**
     * Add two numbers
     */
    add(a: number, b: number): number {
        const result = a + b;
        this.history.push(`add(${a}, ${b}) = ${result}`);
        return result;
    }

    /**
     * Multiply two numbers
     */
    multiply(a: number, b: number): number {
        const result = a * b;
        this.history.push(`multiply(${a}, ${b}) = ${result}`);
        return result;
    }

    /**
     * Subtract two numbers
     */
    subtract(a: number, b: number): number {
        const result = a - b;
        this.history.push(`subtract(${a}, ${b}) = ${result}`);
        return result;
    }

    /**
     * Get operation history
     */
    getHistory(): string[] {
        return [...this.history];
    }
}

/**
 * Standalone helper function
 */
export function helperFn(): string {
    return 'helper';
}

/**
 * Format a calculation result
 */
export function formatResult(value: number): string {
    return `Result: ${value}`;
}
