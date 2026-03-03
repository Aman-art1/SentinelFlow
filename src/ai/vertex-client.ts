// Purpose: Vertex AI client for strategic AI queries
// Uses Gemini 1.5 Pro for complex code analysis
// Optimized for thorough analysis with large context windows

import { VertexAI, GenerativeModel, Content } from '@google-cloud/vertexai';

/**
 * Vertex AI response interface
 */
export interface VertexResponse {
    content: string;
    model: string;
    latencyMs: number;
    finishReason?: string;
}

/**
 * Vertex AI client configuration
 */
export interface VertexClientConfig {
    projectId?: string;
    location?: string;
    model?: string;
    maxOutputTokens?: number;
    temperature?: number;
}

/**
 * Default configuration
 */
const DEFAULT_MODEL = 'gemini-1.5-pro';
const DEFAULT_LOCATION = 'us-central1';
const DEFAULT_MAX_TOKENS = 4096;
const DEFAULT_TEMPERATURE = 0.2;

/**
 * Vertex AI Client - Gemini 1.5 Pro for strategic analysis
 * Designed for the "strategic" path where depth is critical
 */
export class VertexClient {
    private vertexAI: VertexAI;
    private model: GenerativeModel;
    private modelName: string;

    constructor(config: VertexClientConfig = {}) {
        const projectId = config.projectId || process.env.GOOGLE_CLOUD_PROJECT;
        const location = config.location || process.env.GOOGLE_CLOUD_LOCATION || DEFAULT_LOCATION;

        if (!projectId) {
            throw new Error('GOOGLE_CLOUD_PROJECT is required. Set it in environment or pass via config.');
        }

        this.vertexAI = new VertexAI({
            project: projectId,
            location,
        });

        this.modelName = config.model || DEFAULT_MODEL;

        this.model = this.vertexAI.getGenerativeModel({
            model: this.modelName,
            generationConfig: {
                maxOutputTokens: config.maxOutputTokens || DEFAULT_MAX_TOKENS,
                temperature: config.temperature || DEFAULT_TEMPERATURE,
            },
        });
    }

    /**
     * Send a completion request with full context
     */
    async complete(prompt: string, systemInstruction?: string): Promise<VertexResponse> {
        const startTime = performance.now();

        const contents: Content[] = [
            { role: 'user', parts: [{ text: prompt }] },
        ];

        // Use system instruction if provided
        const requestOptions: { contents: Content[]; systemInstruction?: { parts: { text: string }[] } } = {
            contents,
        };

        if (systemInstruction) {
            requestOptions.systemInstruction = {
                parts: [{ text: systemInstruction }],
            };
        }

        const result = await this.model.generateContent(requestOptions);
        const endTime = performance.now();
        const latencyMs = Math.round(endTime - startTime);

        // Log latency for monitoring
        console.log(`[Vertex AI] Latency: ${latencyMs}ms (model: ${this.modelName})`);

        const response = result.response;
        const candidate = response.candidates?.[0];
        const content = candidate?.content?.parts?.[0]?.text || '';

        return {
            content,
            model: this.modelName,
            latencyMs,
            finishReason: candidate?.finishReason,
        };
    }

    /**
     * Strategic code analysis with full context
     * Includes the target symbol and all neighboring code
     */
    async analyzeCode(
        targetCode: string,
        neighboringCode: string[],
        analysisType: 'security' | 'refactor' | 'dependencies' | 'general',
        question: string
    ): Promise<VertexResponse> {
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

        // Log that we're including context
        console.log(`[Vertex AI] Prompt includes ${neighboringCode.length} neighboring code snippets`);

        return this.complete(prompt, systemInstruction);
    }

    /**
     * Get system instruction based on analysis type
     */
    private getSystemInstruction(analysisType: string): string {
        const baseInstruction = `You are an expert code analyst. Analyze the provided code thoroughly and provide actionable insights.`;

        switch (analysisType) {
            case 'security':
                return `${baseInstruction}
Focus on security vulnerabilities including:
- Injection attacks (SQL, command, XSS)
- Authentication/authorization issues
- Data exposure risks
- Input validation problems
- Secure coding best practices violations
Provide severity levels and remediation steps.`;

            case 'refactor':
                return `${baseInstruction}
Focus on code quality and refactoring opportunities:
- Code duplication and DRY violations
- Single Responsibility Principle violations
- Complex cyclomatic complexity
- Poor naming conventions
- Opportunities for abstraction
Provide specific refactoring suggestions with examples.`;

            case 'dependencies':
                return `${baseInstruction}
Focus on dependency analysis:
- Direct and transitive dependencies
- Coupling and cohesion analysis
- Circular dependency detection
- Impact analysis for changes
- Dependency inversion opportunities
Provide a clear dependency graph description.`;

            default:
                return baseInstruction;
        }
    }

    /**
     * Get the current model being used
     */
    getModel(): string {
        return this.modelName;
    }
}

/**
 * Create a Vertex AI client with default configuration
 * Returns null if credentials are not available
 */
export function createVertexClient(config?: VertexClientConfig): VertexClient | null {
    try {
        return new VertexClient(config);
    } catch (error) {
        const msg = (error as Error).message;
        if (msg.includes('GOOGLE_CLOUD_PROJECT is required')) {
            console.log('[Vertex AI] Client not initialized (Project ID missing). Waiting for configuration.');
        } else {
            console.warn('[Vertex AI] Client initialization failed:', msg);
        }
        return null;
    }
}
