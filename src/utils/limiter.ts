type Lane = 'gemini_llm' | 'gemini_embed' | 'semantic_scholar' | 'arxiv_download';

interface LimiterConfig {
  gemini_llm: number;
  gemini_embed: number;
  semantic_scholar: number;
  arxiv_download: number;
}

const defaultConfig: LimiterConfig = {
  gemini_llm: 2,
  gemini_embed: 4,
  semantic_scholar: 2,
  arxiv_download: 3,
};

class LaneLimiter {
  private queues: Map<Lane, Array<() => void>> = new Map();
  private running: Map<Lane, number> = new Map();
  private lastRequestTime: Map<Lane, number> = new Map();
  private config: LimiterConfig;
  private rateLimits: Map<Lane, number> = new Map();

  constructor(config?: Partial<LimiterConfig>) {
    this.config = { ...defaultConfig, ...config };
    for (const lane of Object.keys(defaultConfig) as Lane[]) {
      this.queues.set(lane, []);
      this.running.set(lane, 0);
      this.lastRequestTime.set(lane, 0);
    }
    
    // Rate limits in milliseconds (minimum delay between requests)
    // Semantic Scholar: 1 req/sec regardless of API key status
    const ssRateLimit = 1000; // 1000ms = 1 req/sec (enforced even with API key)
    this.rateLimits.set('semantic_scholar', ssRateLimit);
  }

  private async waitForRateLimit(lane: Lane): Promise<void> {
    const rateLimit = this.rateLimits.get(lane);
    if (!rateLimit) return;

    const lastTime = this.lastRequestTime.get(lane) || 0;
    const now = Date.now();
    const timeSinceLastRequest = now - lastTime;
    
    if (timeSinceLastRequest < rateLimit) {
      const waitTime = rateLimit - timeSinceLastRequest;
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
    
    this.lastRequestTime.set(lane, Date.now());
  }

  async limit<T>(lane: Lane, fn: () => Promise<T>): Promise<T> {
    const max = this.config[lane];
    const running = this.running.get(lane) || 0;

    if (running < max) {
      this.running.set(lane, running + 1);
      await this.waitForRateLimit(lane);
      try {
        return await fn();
      } finally {
        this.running.set(lane, (this.running.get(lane) || 1) - 1);
        this.processQueue(lane);
      }
    }

    return new Promise<T>((resolve) => {
      this.queues.get(lane)!.push(async () => {
        this.running.set(lane, (this.running.get(lane) || 0) + 1);
        await this.waitForRateLimit(lane);
        try {
          const result = await fn();
          resolve(result);
        } finally {
          this.running.set(lane, (this.running.get(lane) || 1) - 1);
          this.processQueue(lane);
        }
      });
    });
  }

  private processQueue(lane: Lane): void {
    const queue = this.queues.get(lane)!;
    const running = this.running.get(lane) || 0;
    const max = this.config[lane];

    if (running < max && queue.length > 0) {
      const next = queue.shift()!;
      next();
    }
  }
}

const globalLimiterConfig = {
  gemini_llm: Number(process.env.GEMINI_LLM_CONCURRENCY || '2'),
  gemini_embed: Number(process.env.GEMINI_EMBED_CONCURRENCY || '4'),
  semantic_scholar: Number(process.env.SS_CONCURRENCY || '1'), // Set to 1 to respect rate limits
  arxiv_download: Number(process.env.ARXIV_CONCURRENCY || '3'),
};

const globalLimiter = new LaneLimiter(globalLimiterConfig);

let configLogged = false;

if (!configLogged && typeof process !== 'undefined' && process.env.NODE_ENV !== 'production') {
  console.log('[Limiter] Concurrency limits:', globalLimiterConfig);
  configLogged = true;
}

export function limit<T>(lane: Lane, fn: () => Promise<T>): Promise<T> {
  return globalLimiter.limit(lane, fn);
}
