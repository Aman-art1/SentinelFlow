// Purpose: Gemini API client for strategic AI queries (alternative to Vertex AI)
// Uses Google Generative AI SDK with a simple API Key
// Optimized for thorough analysis with large context windows

import { GoogleGenerativeAI, GenerativeModel } from '@google/generative-ai';

/**
 * Gemini AI response interface
 */
export interface GeminiResponse {
    content: string;
    thought?: string;
    model: string;
    latencyMs: number;
    finishReason?: string;
}

/**
 * Gemini AI client configuration
 */
export interface GeminiClientConfig {
    apiKey?: string;
    model?: string;
    maxOutputTokens?: number;
    temperature?: number;
    thinkingBudget?: number; // For Gemini 2.x models (e.g. 1024, -1 for dynamic)
    thinkingLevel?: 'minimal' | 'low' | 'medium' | 'high'; // For Gemini 3.x models
    includeThoughts?: boolean;
}

/**
 * Default configuration
 */
const DEFAULT_MODEL = 'gemini-3-flash-preview';
const DEFAULT_MAX_TOKENS = 8192;
const DEFAULT_TEMPERATURE = 0.7;
const DEFAULT_THINKING_BUDGET = -1; // Dynamic thinking by default for 2.0+

/**
 * Gemini Client - Gemini 1.5 Pro for strategic analysis
 * Designed for simplicity using an API Key
 */
export class GeminiClient {
    private genAI: GoogleGenerativeAI;
    private model: GenerativeModel;
    private modelName: string;

    constructor(config: GeminiClientConfig = {}) {
        const apiKey = config.apiKey || process.env.GOOGLE_API_KEY;

        if (!apiKey) {
            throw new Error('GOOGLE_API_KEY is required. Set it in environment or pass via config.');
        }

        this.genAI = new GoogleGenerativeAI(apiKey);
        this.modelName = config.model || DEFAULT_MODEL;

        const generationConfig: any = {
            maxOutputTokens: config.maxOutputTokens || DEFAULT_MAX_TOKENS,
            temperature: config.temperature || DEFAULT_TEMPERATURE,
        };

        // Add thinking config if requested or using a 2.0+ model
        const thinkingConfig: any = {};
        if (config.thinkingBudget !== undefined) {
            thinkingConfig.includeThoughts = config.includeThoughts ?? true;
            thinkingConfig.thinkingBudget = config.thinkingBudget;
        } else if (this.modelName.includes('2.0') || this.modelName.includes('3')) {
            thinkingConfig.includeThoughts = config.includeThoughts ?? true;
            if (this.modelName.includes('3')) {
                thinkingConfig.thinkingLevel = config.thinkingLevel || 'high';
            } else {
                thinkingConfig.thinkingBudget = DEFAULT_THINKING_BUDGET;
            }
        }

        this.model = this.genAI.getGenerativeModel({
            model: this.modelName,
            generationConfig,
            // @ts-ignore - Support newer thinking config if available in SDK
            thinkingConfig: Object.keys(thinkingConfig).length > 0 ? thinkingConfig : undefined
        });
    }

    /**
     * Send a completion request with full context
     */
    async complete(prompt: string, systemInstruction?: string): Promise<GeminiResponse> {
        const startTime = performance.now();

        // Include system instruction if provided
        let modelToUse = this.model;
        if (systemInstruction) {
            modelToUse = this.genAI.getGenerativeModel({
                model: this.modelName,
                systemInstruction: systemInstruction,
            });
        }

        const result = await modelToUse.generateContent(prompt);
        const endTime = performance.now();
        const latencyMs = Math.round(endTime - startTime);

        // Log latency for monitoring
        console.log(`[Gemini] Latency: ${latencyMs}ms (model: ${this.modelName})`);

        const response = result.response;
        let content = '';
        let thought = '';

        // Extract parts, handling thoughts separately
        const candidates = (response as any).candidates;
        if (candidates && candidates.length > 0 && candidates[0].content && candidates[0].content.parts) {
            for (const part of candidates[0].content.parts) {
                if (part.thought) {
                    thought += part.text || '';
                } else {
                    content += part.text || '';
                }
            }
        } else {
            content = response.text() || '';
        }

        return {
            content,
            thought: thought || undefined,
            model: this.modelName,
            latencyMs,
        };
    }

    /**
     * Strategic code analysis with full context
     */
    async analyzeCode(
        targetCode: string,
        neighboringCode: string[],
        analysisType: 'security' | 'refactor' | 'dependencies' | 'general',
        question: string
    ): Promise<GeminiResponse> {
        const systemInstruction = this.getSystemInstruction(analysisType);

        // Build comprehensive prompt with context
        let prompt = `## Target Code\n\`\`\`\n${targetCode}\n\`\`\`\n\n`;

        if (neighboringCode.length > 0) {
            prompt += `## Related Code (Dependencies & Dependents)\n`;
            neighboringCode.forEach((code, index) => {
                prompt += `### Related Code ${index + 1}\n\`\`\`\n${code}\n\`\`\`\n\n`;
            });
        }

        prompt += `## Analysis Request\n${question}`;

        return this.complete(prompt, systemInstruction);
    }

    private getSystemInstruction(analysisType: string): string {
        const baseInstruction = `You are an expert code analyst. Analyze the provided code thoroughly and provide actionable insights.`;

        switch (analysisType) {
            case 'security':
                return `${baseInstruction}\nFocus on security vulnerabilities, severity levels, and remediation steps.`;
            case 'refactor':
                return `${baseInstruction}\nFocus on code quality and specific refactoring suggestions with examples.`;
            case 'dependencies':
                return `${baseInstruction}\nFocus on coupling, cohesion, and circular dependency detection.`;
            default:
                return baseInstruction;
        }
    }

    getModel(): string {
        return this.modelName;
    }
}

/**
 * Create a Gemini AI client
 */
export function createGeminiClient(config?: GeminiClientConfig): GeminiClient | null {
    try {
        return new GeminiClient(config);
    } catch (error) {
        const msg = (error as Error).message;
        if (msg.includes('GOOGLE_API_KEY is required')) {
            console.log('[Gemini] Client not initialized (API key missing).');
        } else {
            console.warn('[Gemini] Client initialization failed:', msg);
        }
        return null;
    }
}
