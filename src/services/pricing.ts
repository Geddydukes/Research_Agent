export interface ModelPricing {
  inputPricePerMillion: number;
  outputPricePerMillion: number;
}
export const GEMINI_PRICING: Record<string, ModelPricing> = {
  'gemini-1.5-flash': {
    inputPricePerMillion: 0.075,
    outputPricePerMillion: 0.30,
  },
  'gemini-1.5-pro': {
    inputPricePerMillion: 1.25,
    outputPricePerMillion: 5.00,
  },
  'gemini-2.5-flash': {
    inputPricePerMillion: 0.075,
    outputPricePerMillion: 0.30,
  },
  'gemini-2.5-pro': {
    inputPricePerMillion: 1.25,
    outputPricePerMillion: 5.00,
  },
  'gemini-embedding-001': {
    inputPricePerMillion: 0.07,
    outputPricePerMillion: 0,
  },
  default: {
    inputPricePerMillion: 1.0,
    outputPricePerMillion: 4.0,
  },
};

export const OPENAI_PRICING: Record<string, ModelPricing> = {
  'gpt-4': {
    inputPricePerMillion: 30.0,
    outputPricePerMillion: 60.0,
  },
  'gpt-3.5-turbo': {
    inputPricePerMillion: 0.5,
    outputPricePerMillion: 1.5,
  },
};

export function calculateCost(
  model: string,
  provider: string,
  inputTokens: number,
  outputTokens: number,
  markup: number = 0
): number {
  let pricing: ModelPricing | undefined;

  if (provider === 'gemini') {
    pricing = GEMINI_PRICING[model] || GEMINI_PRICING.default;
  } else if (provider === 'openai') {
    pricing = OPENAI_PRICING[model] || GEMINI_PRICING.default;
  } else {
    pricing = GEMINI_PRICING.default;
  }

  const inputCost = (inputTokens / 1_000_000) * pricing.inputPricePerMillion;
  const outputCost = (outputTokens / 1_000_000) * pricing.outputPricePerMillion;
  return (inputCost + outputCost) * (1 + markup);
}
export function getModelPricing(model: string, provider: string): ModelPricing {
  if (provider === 'gemini') {
    return GEMINI_PRICING[model] || GEMINI_PRICING.default;
  } else if (provider === 'openai') {
    return OPENAI_PRICING[model] || GEMINI_PRICING.default;
  }
  return GEMINI_PRICING.default;
}
