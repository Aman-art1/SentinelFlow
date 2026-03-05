// Purpose: Groq API client for fast reflex AI queries
// Uses Llama 3.1 via Groq's inference platform
// Target latency: <300ms for simple queries

import Groq from 'groq-sdk';

/**
 * Groq API response interface
 */
export interface GroqResponse {
    content: string;
    model: string;
    latencyMs: number;
    usage: {
        promptTokens: number;
        completionTokens: number;
        totalTokens: number;
    };
}

/**
 * Groq client configuration
 */
export interface GroqClientConfig {
    apiKey?: string;
    model?: string;
    maxTokens?: number;
    temperature?: number;
}

/**
 * Default model - Llama 3.1 8B for fastest inference
 * Can upgrade to llama-3.1-70b-versatile for more complex queries
 */
const DEFAULT_MODEL = 'llama-3.1-8b-instant';
const DEFAULT_MAX_TOKENS = 1024;
const DEFAULT_TEMPERATURE = 0.3;

/**
 * Groq Client - Fast inference with Llama 3.1
 * Designed for the "reflex" path where speed is critical
 */
export class GroqClient {
    private client: Groq;
    private model: string;
    private maxTokens: number;
    private temperature: number;

    constructor(config: GroqClientConfig = {}) {
        const apiKey = config.apiKey || process.env.GROQ_API_KEY;

        if (!apiKey) {
            throw new Error('GROQ_API_KEY is required. Set it in environment or pass via config.');
        }

        this.client = new Groq({ apiKey });
        this.model = config.model || DEFAULT_MODEL;
        this.maxTokens = config.maxTokens || DEFAULT_MAX_TOKENS;
        this.temperature = config.temperature || DEFAULT_TEMPERATURE;
    }

    /**
     * Send a completion request with latency logging
     */
    async complete(prompt: string, systemPrompt?: string): Promise<GroqResponse> {
        const startTime = performance.now();

        const messages: Groq.Chat.ChatCompletionMessageParam[] = [];

        if (systemPrompt) {
            messages.push({ role: 'system', content: systemPrompt });
        }

        messages.push({ role: 'user', content: prompt });

        const response = await this.client.chat.completions.create({
            model: this.model,
            messages,
            max_tokens: this.maxTokens,
            temperature: this.temperature,
        });

        const endTime = performance.now();
        const latencyMs = Math.round(endTime - startTime);

        // Log latency for monitoring
        console.log(`[Groq] Latency: ${latencyMs}ms (model: ${this.model})`);

        if (latencyMs > 300) {
            console.warn(`[Groq] Warning: Latency ${latencyMs}ms exceeds 300ms target`);
        }

        const choice = response.choices[0];

        return {
            content: choice?.message?.content || '',
            model: response.model,
            latencyMs,
            usage: {
                promptTokens: response.usage?.prompt_tokens || 0,
                completionTokens: response.usage?.completion_tokens || 0,
                totalTokens: response.usage?.total_tokens || 0,
            },
        };
    }

    /**
     * Complete with code context - optimized prompt for code explanations
     */
    async explainCode(code: string, question: string): Promise<GroqResponse> {
        const systemPrompt = `You are a helpful code assistant. Provide concise, direct explanations.
Focus on answering the specific question about the code.
Keep responses brief but accurate.`;

        const prompt = `Code:
\`\`\`
${code}
\`\`\`

Question: ${question}`;

        return this.complete(prompt, systemPrompt);
    }

    /**
     * Get the current model being used
     */
    getModel(): string {
        return this.model;
    }

    /**
     * Switch to a different model (e.g., for more complex queries)
     */
    setModel(model: string): void {
        this.model = model;
    }
}

/**
 * Create a Groq client with default configuration
 * Returns null if API key is not available
 */
export function createGroqClient(config?: GroqClientConfig): GroqClient | null {
    try {
        return new GroqClient(config);
    } catch (error) {
        const msg = (error as Error).message;
        if (msg.includes('GROQ_API_KEY is required')) {
            console.log('[Groq] Client not initialized (API key missing). Waiting for configuration.');
        } else {
            console.warn('[Groq] Client initialization failed:', msg);
        }
        return null;
    }
}
