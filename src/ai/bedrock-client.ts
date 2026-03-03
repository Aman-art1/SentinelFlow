// Purpose: Amazon Bedrock client for strategic AI queries
// Routes requests to Anthropic Claude (or Llama) via AWS Bedrock API
// Uses AWS SDK v3 with credential chain (env vars, ~/.aws/credentials, IAM role, etc.)

import {
    BedrockRuntimeClient,
    ConverseCommand,
    ConverseCommandInput,
} from '@aws-sdk/client-bedrock-runtime';

/**
 * Bedrock response interface (mirrors VertexResponse for plug-in compatibility)
 */
export interface BedrockResponse {
    content: string;
    model: string;
    latencyMs: number;
}

/**
 * Bedrock client configuration
 */
export interface BedrockClientConfig {
    region?: string;
    modelId?: string;
    accessKeyId?: string;
    secretAccessKey?: string;
    maxTokens?: number;
    temperature?: number;
}

const DEFAULT_REGION = 'us-east-1';
const DEFAULT_MODEL_ID = 'us.amazon.nova-2-lite-v1:0';
const DEFAULT_MAX_TOKENS = 4096;
const DEFAULT_TEMPERATURE = 0.2;

/**
 * Amazon Bedrock Client — wraps the AWS Bedrock Runtime for strategic code analysis.
 *
 * Authentication is handled entirely by the AWS SDK credential chain:
 *   1. Environment variables (AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY)
 *   2. ~/.aws/credentials profile
 *   3. IAM Instance Role / SSO session
 *
 * No API key management required beyond standard AWS CLI setup.
 */
export class BedrockClient {
    private client: BedrockRuntimeClient;
    private modelId: string;
    private maxTokens: number;
    private temperature: number;

    constructor(config: BedrockClientConfig = {}) {
        const region = config.region || process.env.AWS_REGION || DEFAULT_REGION;
        this.modelId = config.modelId || DEFAULT_MODEL_ID;
        this.maxTokens = config.maxTokens || DEFAULT_MAX_TOKENS;
        this.temperature = config.temperature ?? DEFAULT_TEMPERATURE;

        const clientConfig: any = { region };
        if (config.accessKeyId && config.secretAccessKey) {
            clientConfig.credentials = {
                accessKeyId: config.accessKeyId,
                secretAccessKey: config.secretAccessKey,
            };
        }

        this.client = new BedrockRuntimeClient(clientConfig);

        console.log(`[Bedrock] Initialized. Region: ${region}, Model: ${this.modelId}, HasCredentials: ${!!config.accessKeyId}`);
    }

    /**
     * Send a completion request.
     * Supports Claude 3.x (Anthropic v3 Messages API body format).
     */
    async complete(prompt: string, systemInstruction?: string): Promise<BedrockResponse> {
        const startTime = performance.now();

        // Nova 2 models support extended thinking. Temperature must be omitted when reasoning is active.
        const useReasoning = this.modelId.includes('nova-2');
        const input: ConverseCommandInput = {
            modelId: this.modelId,
            system: [
                {
                    text: systemInstruction || 'You are an expert code analyst. Analyze the provided code thoroughly and provide actionable insights.',
                }
            ],
            messages: [
                {
                    role: 'user',
                    content: [
                        { text: prompt },
                    ],
                },
            ],
            inferenceConfig: {
                maxTokens: this.maxTokens,
                // Temperature is incompatible with Nova 2 extended thinking (reasoningConfig)
                ...(useReasoning ? {} : { temperature: this.temperature }),
            },
            ...(useReasoning ? {
                additionalModelRequestFields: {
                    reasoningConfig: {
                        type: 'enabled',
                        maxReasoningEffort: 'medium' // Balanced cost/quality for code analysis
                    }
                }
            } : {})
        };

        console.log(`[Bedrock] Sending request → modelId="${this.modelId}" useReasoning=${useReasoning} temperature=${useReasoning ? 'omitted' : this.temperature} maxTokens=${this.maxTokens}`);

        try {
            const command = new ConverseCommand(input);
            const result = await this.client.send(command);

            const endTime = performance.now();
            const latencyMs = Math.round(endTime - startTime);

            // Nova 2 with reasoning returns multiple blocks (reasoningContent + text).
            // Iterate all blocks and extract the text response.
            const contentBlocks = result.output?.message?.content || [];
            const content = contentBlocks.find((b: any) => 'text' in b)?.text || '';

            console.log(`[Bedrock] Response received. Latency: ${latencyMs}ms, Model: ${this.modelId}`);

            return { content, model: this.modelId, latencyMs };
        } catch (error: any) {
            const msg = error?.message || 'Unknown error';
            const code = error?.name || error?.code || 'UnknownCode';
            const httpStatus = error?.$metadata?.httpStatusCode || 'N/A';
            const requestId = error?.$metadata?.requestId || 'N/A';
            console.error(`[Bedrock] Request failed: ${msg}`);
            console.error(`[Bedrock] Error detail → code="${code}" httpStatus=${httpStatus} requestId=${requestId}`);
            throw new Error(`Bedrock request failed: ${msg}`);
        }
    }

    /**
     * Strategic code analysis — mirrors VertexClient.analyzeCode signature.
     */
    async analyzeCode(
        targetCode: string,
        neighboringCode: string[],
        analysisType: 'security' | 'refactor' | 'dependencies' | 'general',
        question: string
    ): Promise<BedrockResponse> {
        const systemInstruction = this.getSystemInstruction(analysisType);

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

    /**
     * System instructions per analysis type — matches VertexClient patterns.
     */
    private getSystemInstruction(analysisType: string): string {
        const base = `You are an expert code analyst. Analyze the provided code thoroughly and provide actionable insights.`;
        switch (analysisType) {
            case 'security':
                return `${base}\nFocus on security vulnerabilities: injections, auth issues, data exposure, input validation. Provide severity levels and remediation steps.`;
            case 'refactor':
                return `${base}\nFocus on code quality: DRY violations, SRP, high cyclomatic complexity, poor naming, abstraction opportunities. Provide specific refactoring suggestions.`;
            case 'dependencies':
                return `${base}\nFocus on dependency analysis: direct/transitive dependencies, coupling, cohesion, circular dependencies, impact analysis.`;
            default:
                return base;
        }
    }

    /** Return current model ID for display in the UI */
    getModel(): string {
        return this.modelId;
    }
}

/**
 * Create a Bedrock client.
 * Returns null if the AWS SDK client throws during construction (e.g., invalid region).
 */
export function createBedrockClient(config?: BedrockClientConfig): BedrockClient | null {
    try {
        return new BedrockClient(config);
    } catch (error) {
        console.warn('[Bedrock] Client initialization failed:', (error as Error).message);
        return null;
    }
}
