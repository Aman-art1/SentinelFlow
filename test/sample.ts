// Test file for validation: 100+ lines of TypeScript
// Contains various symbol types and complexity patterns

import * as path from 'path';
import * as fs from 'fs';

/**
 * User interface
 */
export interface User {
    id: number;
    name: string;
    email: string;
    role: 'admin' | 'user';
}

/**
 * Configuration type
 */
export type Config = {
    apiUrl: string;
    timeout: number;
    retries: number;
};

/**
 * Status enum
 */
export enum Status {
    Pending = 'pending',
    Active = 'active',
    Completed = 'completed',
    Failed = 'failed',
}

/**
 * User service class
 */
export class UserService {
    private users: User[] = [];
    private config: Config;

    constructor(config: Config) {
        this.config = config;
    }

    /**
     * Add a new user
     */
    addUser(user: User): void {
        if (!user.name || !user.email) {
            throw new Error('Invalid user data');
        }

        this.users.push(user);
    }

    /**
     * Find user by ID
     */
    findUserById(id: number): User | undefined {
        return this.users.find((user) => user.id === id);
    }

    /**
     * Get all users
     */
    getAllUsers(): User[] {
        return [...this.users];
    }

    /**
     * Delete user by ID
     */
    deleteUser(id: number): boolean {
        const index = this.users.findIndex((user) => user.id === id);

        if (index === -1) {
            return false;
        }

        this.users.splice(index, 1);
        return true;
    }

    /**
     * Filter users by role
     */
    filterByRole(role: 'admin' | 'user'): User[] {
        return this.users.filter((user) => user.role === role);
    }
}

/**
 * Calculate factorial recursively
 */
export function factorial(n: number): number {
    if (n <= 1) {
        return 1;
    }
    return n * factorial(n - 1);
}

/**
 * Complex function with multiple decision points
 */
export function processData(data: any[]): any[] {
    const result: any[] = [];

    for (const item of data) {
        if (item.active) {
            if (item.priority > 5) {
                result.push({ ...item, urgent: true });
            } else if (item.priority > 2) {
                result.push({ ...item, normal: true });
            } else {
                result.push({ ...item, low: true });
            }
        } else if (item.archived) {
            // Skip archived items
            continue;
        } else {
            result.push(item);
        }
    }

    return result;
}

/**
 * Async function with error handling
 */
export async function fetchData(url: string): Promise<any> {
    try {
        const response = await fetch(url);

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        return data;
    } catch (error) {
        console.error('Fetch failed:', error);
        throw error;
    }
}

/**
 * Arrow function example
 */
export const squareNumbers = (numbers: number[]): number[] => {
    return numbers.map((n) => n * n);
};

/**
 * Higher-order function
 */
export function createMultiplier(factor: number) {
    return (value: number) => value * factor;
}

// Constants
const MAX_RETRIES = 3;
const DEFAULT_TIMEOUT = 5000;

/**
 * Utility function with ternary
 */
export function clamp(value: number, min: number, max: number): number {
    return value < min ? min : value > max ? max : value;
}

/**
 * Switch statement example
 */
export function getStatusMessage(status: Status): string {
    switch (status) {
        case Status.Pending:
            return 'Task is pending';
        case Status.Active:
            return 'Task is in progress';
        case Status.Completed:
            return 'Task completed successfully';
        case Status.Failed:
            return 'Task failed';
        default:
            return 'Unknown status';
    }
}
