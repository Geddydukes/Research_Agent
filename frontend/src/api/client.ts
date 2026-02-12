import type { GraphData, EdgeModalData, InferredInsight, Paper, Entity, Edge, TenantMembership, PipelineJob, ArxivPaper } from '../types';
import {
    mockGraphData,
    mockInsights,
    mockPapers,
    getMockEdgeModal,
    getMockPapersForNode,
    getMockEdgesForNode,
    getMockInsightsForEdge
} from '../mocks/mockData';
import { supabase } from '../auth/supabaseClient';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000';
// Use real API if VITE_API_URL is set, otherwise default to mock for local dev
const USE_MOCK = import.meta.env.VITE_API_URL ? false : (import.meta.env.VITE_USE_MOCK !== 'false');

class ApiClient {
    private baseUrl: string;
    private useMock: boolean;

    constructor(baseUrl: string, useMock: boolean = true) {
        this.baseUrl = baseUrl;
        this.useMock = useMock;
    }

    private async getAuthHeaders(): Promise<Record<string, string>> {
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token || null;
        const tenantId = typeof window !== 'undefined' ? localStorage.getItem('tenant_id') : null;
        return {
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
            ...(tenantId ? { 'x-tenant-id': tenantId } : {}),
        };
    }

    private async fetch<T>(endpoint: string, options?: RequestInit): Promise<T> {
        const url = `${this.baseUrl}${endpoint}`;
        const authHeaders = await this.getAuthHeaders();

        const response = await fetch(url, {
            ...options,
            headers: {
                'Content-Type': 'application/json',
                ...authHeaders,
                ...options?.headers,
            },
        });

        if (!response.ok) {
            const text = await response.text();
            let message = `API Error: ${response.status} ${response.statusText}`;
            try {
                const json = JSON.parse(text);
                const msg = json?.error?.message;
                if (typeof msg === 'string' && msg.length > 0) message = msg;
            } catch {
                if (text.length > 0 && text.length < 200) message = text;
            }
            throw new Error(message);
        }

        return response.json();
    }

    // Get full graph data (nodes + edges)
    async getGraphData(): Promise<GraphData> {
        if (this.useMock) {
            // Simulate network delay
            await new Promise(resolve => setTimeout(resolve, 500));
            return mockGraphData;
        }
        // Backend wraps response in { data: { nodes, edges } }
        const response = await this.fetch<{ data: GraphData }>('/api/graph');
        return response.data;
    }

    // Get all papers with pagination
    async getPapers(page = 1, limit = 50): Promise<{ data: Paper[]; count: number }> {
        if (this.useMock) {
            await new Promise(resolve => setTimeout(resolve, 300));
            return { data: mockPapers, count: mockPapers.length };
        }
        return this.fetch<{ data: Paper[]; count: number }>(`/api/papers?page=${page}&limit=${limit}`);
    }

    // Get node by ID
    async getNodeById(nodeId: number): Promise<Entity | null> {
        if (this.useMock) {
            await new Promise(resolve => setTimeout(resolve, 200));
            return mockGraphData.nodes.find(n => n.id === nodeId) || null;
        }
        const response = await this.fetch<{ data: Entity | null }>(`/api/nodes/${nodeId}`);
        return response.data;
    }

    // Get edges for a node
    async getEdgesForNode(nodeId: number): Promise<Edge[]> {
        if (this.useMock) {
            await new Promise(resolve => setTimeout(resolve, 200));
            return getMockEdgesForNode(nodeId);
        }
        const response = await this.fetch<{ data: Edge[] }>(`/api/nodes/${nodeId}/edges`);
        return response.data || [];
    }

    // Get edge modal data (full edge details with source/target)
    async getEdgeModal(edgeId: number): Promise<EdgeModalData | null> {
        if (this.useMock) {
            await new Promise(resolve => setTimeout(resolve, 300));
            return getMockEdgeModal(edgeId);
        }
        // Backend uses /api/edges/:edgeId and wraps in { data: ... }
        const response = await this.fetch<{ data: EdgeModalData | null }>(`/api/edges/${edgeId}`);
        return response.data;
    }

    // Get insights for an edge
    async getInsightsForEdge(edgeId: number): Promise<InferredInsight[]> {
        if (this.useMock) {
            await new Promise(resolve => setTimeout(resolve, 200));
            return getMockInsightsForEdge(edgeId);
        }
        const response = await this.fetch<{ data: InferredInsight[] }>(`/api/edges/${edgeId}/insights`);
        return response.data || [];
    }

    // Get papers for a node (via entity_mentions)
    async getPapersForNode(nodeId: number): Promise<Paper[]> {
        if (this.useMock) {
            await new Promise(resolve => setTimeout(resolve, 300));
            return getMockPapersForNode(nodeId);
        }
        const response = await this.fetch<{ data: Paper[] }>(`/api/nodes/${nodeId}/papers`);
        return response.data || [];
    }

    // Get all insights (API returns { data, pagination }; we normalize to { data, count })
    async getAllInsights(page = 1, limit = 50): Promise<{ data: InferredInsight[]; count: number }> {
        if (this.useMock) {
            await new Promise(resolve => setTimeout(resolve, 300));
            return { data: mockInsights, count: mockInsights.length };
        }
        const res = await this.fetch<{
            data: InferredInsight[];
            count?: number;
            pagination?: { total?: number };
        }>(`/api/insights?page=${page}&limit=${limit}`);
        const list = res?.data ?? [];
        const count = res?.count ?? res?.pagination?.total ?? list.length;
        return { data: list, count };
    }

    // Get tenant memberships for current user
    async getTenants(): Promise<TenantMembership[]> {
        if (this.useMock) {
            await new Promise(resolve => setTimeout(resolve, 200));
            return [
                {
                    role: 'owner',
                    tenant: {
                        id: '00000000-0000-0000-0000-000000000000',
                        name: 'Default Workspace',
                        slug: 'default',
                        created_at: new Date().toISOString(),
                        updated_at: new Date().toISOString(),
                    },
                },
            ];
        }
        const response = await this.fetch<{ data: TenantMembership[] }>('/api/tenants');
        return response.data || [];
    }

    // Get tenant settings
    async getSettings(): Promise<Record<string, unknown>> {
        if (this.useMock) {
            await new Promise(resolve => setTimeout(resolve, 200));
            return {
                execution_mode: 'hosted',
                max_reasoning_depth: 2,
                semantic_gating_threshold: 0.7,
                allow_speculative_edges: false,
                enabled_relationship_types: [],
                api_key_configured: false,
            };
        }
        const response = await this.fetch<{ data: Record<string, unknown> }>('/api/settings');
        return response.data || {};
    }

    async updateSettings(payload: Record<string, unknown>): Promise<Record<string, unknown>> {
        if (this.useMock) {
            await new Promise(resolve => setTimeout(resolve, 200));
            return {
                ...payload,
                api_key_configured: Boolean(payload.api_key) || false,
            };
        }
        const response = await this.fetch<{ data: Record<string, unknown> }>('/api/settings', {
            method: 'PUT',
            body: JSON.stringify(payload),
        });
        return response.data || {};
    }

    async validateApiKey(apiKey: string): Promise<{ valid: boolean; message?: string }> {
        if (this.useMock) {
            await new Promise(resolve => setTimeout(resolve, 200));
            return { valid: true };
        }
        const response = await this.fetch<{ data: { valid: boolean; message?: string } }>(
            '/api/settings/validate-key',
            {
                method: 'POST',
                body: JSON.stringify({ api_key: apiKey }),
            }
        );
        return response.data;
    }

    async getReviewGraph(): Promise<GraphData> {
        if (this.useMock) {
            await new Promise(resolve => setTimeout(resolve, 200));
            return mockGraphData;
        }
        const response = await this.fetch<{ data: GraphData }>('/api/graphreview');
        return response.data;
    }

    async updateNodeReview(items: Array<{ id: number; status: string; reason?: string; adjusted_confidence?: number }>): Promise<void> {
        if (this.useMock) {
            await new Promise(resolve => setTimeout(resolve, 200));
            return;
        }
        await this.fetch('/api/review/nodes', {
            method: 'POST',
            body: JSON.stringify({ items }),
        });
    }

    async updateEdgeReview(items: Array<{ id: number; status: string; reason?: string }>): Promise<void> {
        if (this.useMock) {
            await new Promise(resolve => setTimeout(resolve, 200));
            return;
        }
        await this.fetch('/api/review/edges', {
            method: 'POST',
            body: JSON.stringify({ items }),
        });
    }

    async processPaper(payload: { paper_id: string; title?: string; raw_text: string; metadata?: Record<string, unknown>; reasoning_depth?: number }): Promise<{ jobId: string; status: string }> {
        if (this.useMock) {
            await new Promise(resolve => setTimeout(resolve, 300));
            return { jobId: 'mock-job', status: 'pending' };
        }
        const response = await this.fetch<{ data: { jobId: string; status: string } }>('/api/pipeline/process', {
            method: 'POST',
            body: JSON.stringify(payload),
        });
        return response.data;
    }

    async processFile(payload: { file_name: string; file_base64: string; reasoning_depth?: number }): Promise<{ jobId: string; status: string }> {
        if (this.useMock) {
            await new Promise(resolve => setTimeout(resolve, 300));
            return { jobId: 'mock-job', status: 'pending' };
        }
        const response = await this.fetch<{ data: { jobId: string; status: string } }>('/api/pipeline/process-file', {
            method: 'POST',
            body: JSON.stringify(payload),
        });
        return response.data;
    }

    async processUrl(payload: { url: string; paper_id?: string; title?: string; reasoning_depth?: number }): Promise<{ jobId: string; status: string }> {
        if (this.useMock) {
            await new Promise(resolve => setTimeout(resolve, 300));
            return { jobId: 'mock-job', status: 'pending' };
        }
        const response = await this.fetch<{ data: { jobId: string; status: string } }>('/api/pipeline/process-url', {
            method: 'POST',
            body: JSON.stringify(payload),
        });
        return response.data;
    }

    async listJobs(page = 1, limit = 20): Promise<{ data: PipelineJob[]; pagination: { page: number; limit: number; total: number; totalPages: number } }> {
        if (this.useMock) {
            await new Promise(resolve => setTimeout(resolve, 200));
            return {
                data: [],
                pagination: { page, limit, total: 0, totalPages: 0 },
            };
        }
        const response = await this.fetch<{ data: PipelineJob[]; pagination: { page: number; limit: number; total: number; totalPages: number } }>(
            `/api/pipeline/jobs?page=${page}&limit=${limit}`
        );
        return response;
    }

    async getJobStatus(jobId: string): Promise<PipelineJob> {
        if (this.useMock) {
            await new Promise(resolve => setTimeout(resolve, 200));
            return { jobId, status: 'completed' };
        }
        const response = await this.fetch<{ data: PipelineJob }>(`/api/pipeline/status/${jobId}`);
        return response.data;
    }

    // Search entities and papers
    async search(query: string): Promise<{ nodes: Entity[]; papers: Paper[] }> {
        if (this.useMock) {
            await new Promise(resolve => setTimeout(resolve, 300));
            // Filter mock data by query
            const q = query.toLowerCase();
            const nodes = mockGraphData.nodes.filter(n =>
                n.canonical_name.toLowerCase().includes(q) ||
                (n.metadata?.title as string || '').toLowerCase().includes(q)
            );
            const papers = mockPapers.filter(p =>
                (p.title || '').toLowerCase().includes(q) ||
                p.paper_id.toLowerCase().includes(q)
            );
            return { nodes, papers };
        }
        const response = await this.fetch<{ data: { nodes: Entity[]; papers: Paper[] } }>(`/api/search?q=${encodeURIComponent(query)}`);
        return { nodes: response.data.nodes || [], papers: response.data.papers || [] };
    }

    // Semantic search for similar papers using embeddings
    async semanticSearch(query: string, limit = 20, threshold = 0.0): Promise<{
        papers: Array<{ paper: Paper; similarity: number }>;
        query: string;
        count: number;
    }> {
        if (this.useMock) {
            await new Promise(resolve => setTimeout(resolve, 500));
            // Mock semantic search - just return some papers with fake similarity
            const papers = mockPapers.slice(0, limit).map(p => ({
                paper: p,
                similarity: Math.random() * 0.5 + 0.5 // Random 0.5-1.0
            }));
            return { papers, query, count: papers.length };
        }

        const params = new URLSearchParams({
            q: query,
            limit: limit.toString(),
            threshold: threshold.toString(),
        });

        const response = await this.fetch<{
            data: {
                papers: Array<{ paper: Paper; similarity: number }>;
                query: string;
                count: number;
            };
        }>(`/api/search/semantic?${params}`);

        return response.data;
    }

    async searchArxiv(query: string, limit = 20): Promise<{ data: ArxivPaper[] }> {
        if (this.useMock) {
            await new Promise(resolve => setTimeout(resolve, 400));
            return {
                data: [
                    { paperId: '2301.00001', title: 'Mock arXiv Result', abstract: 'Abstract text.', year: 2023, externalIds: { arxiv: '2301.00001' } },
                ],
            };
        }
        const params = new URLSearchParams({ q: query.trim(), limit: String(Math.min(40, Math.max(1, limit))) });
        const response = await this.fetch<{ data: ArxivPaper[] }>(`/api/arxiv?${params}`);
        return response;
    }

    async downloadExport(format: 'graphml' | 'gexf' | 'csv-bundle' | 'json'): Promise<void> {
        if (this.useMock) {
            const blob = new Blob(['Mock export not available. Use real API.'], { type: 'text/plain' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `export-${format}.${format === 'csv-bundle' ? 'zip' : format}`;
            a.click();
            URL.revokeObjectURL(url);
            return;
        }
        const authHeaders = await this.getAuthHeaders();
        const url = `${this.baseUrl}/api/export?format=${encodeURIComponent(format)}`;
        const response = await fetch(url, {
            headers: {
                ...authHeaders,
            },
        });
        if (!response.ok) {
            const text = await response.text();
            let message = `Export failed: ${response.status}`;
            try {
                const json = JSON.parse(text);
                if (typeof json?.error?.message === 'string') message = json.error.message;
            } catch {
                if (text.length > 0 && text.length < 200) message = text;
            }
            throw new Error(message);
        }
        const blob = await response.blob();
        const disposition = response.headers.get('content-disposition');
        let filename = `knowledge-graph.${format === 'csv-bundle' ? 'zip' : format}`;
        if (disposition) {
            const match = /filename="?([^";\n]+)"?/.exec(disposition);
            if (match?.[1]) filename = match[1].trim();
        }
        const objectUrl = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = objectUrl;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(objectUrl);
    }

    // Toggle mock mode
    setUseMock(useMock: boolean) {
        this.useMock = useMock;
    }
}

export const apiClient = new ApiClient(API_BASE, USE_MOCK);
export default apiClient;
