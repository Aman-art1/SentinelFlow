// Purpose: Global string interning registry for the binary indexing pipeline.
// Converts file paths and symbol names to stable Uint32 IDs, eliminating
// repeated string concatenation and GC pressure in the hot parsing path.

/**
 * StringRegistry
 *
 * Interns arbitrary strings into monotonically-increasing Uint32 IDs.
 * Interning the same string twice always returns the same ID.
 *
 * Thread-safety: Designed to run on the single orchestrator thread.
 * Workers receive a snapshot of the registry for read-only lookup.
 */
export class StringRegistry {
    private stringToId: Map<string, number> = new Map();
    private idToString: string[] = [];
    private nextId: number = 0;

    /**
     * Intern a string and return its stable Uint32 ID.
     * O(1) amortized — plain Map lookup / insert.
     */
    intern(str: string): number {
        let id = this.stringToId.get(str);
        if (id === undefined) {
            id = this.nextId++;
            this.stringToId.set(str, id);
            this.idToString.push(str);
        }
        return id;
    }

    /**
     * Resolve an ID back to its original string.
     * Returns undefined if the ID has never been interned.
     */
    resolve(id: number): string | undefined {
        return this.idToString[id];
    }

    /**
     * Check whether a string has already been interned.
     */
    has(str: string): boolean {
        return this.stringToId.has(str);
    }

    /**
     * Total number of unique strings interned so far.
     */
    get size(): number {
        return this.nextId;
    }

    /**
     * Export a read-only snapshot of the id→string table for use in workers.
     * Workers should not mutate the returned array.
     */
    exportSnapshot(): ReadonlyArray<string> {
        return this.idToString;
    }

    /**
     * Export a Uint32 lookup table usable in workers.
     * Returns a serialisable plain object.
     */
    exportSerializable(): Record<string, number> {
        const out: Record<string, number> = {};
        for (const [k, v] of this.stringToId) {
            out[k] = v;
        }
        return out;
    }

    /**
     * Reconstruct a StringRegistry from a serialisable snapshot (e.g., in a worker thread).
     */
    static fromSerializable(data: Record<string, number>): StringRegistry {
        const reg = new StringRegistry();
        for (const [str, id] of Object.entries(data)) {
            reg.stringToId.set(str, id);
            reg.idToString[id] = str;
            if (id >= reg.nextId) {
                reg.nextId = id + 1;
            }
        }
        return reg;
    }
}
