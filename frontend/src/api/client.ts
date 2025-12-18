import type { GraphData, EdgeModalData, InferredInsight, Paper, Entity, Edge } from '../types';
import {
    mockGraphData,
    mockPapers,
    getMockEdgeModal,
    getMockPapersForNode,
    getMockEdgesForNode,
    getMockInsightsForEdge
} from '../mocks/mockData';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000';
// Use real API if VITE_API_URL is set, otherwise default to mock for local dev
const USE_MOCK = import.meta.env.VITE_API_URL ? false : (import.meta.env.VITE_USE_MOCK !== 'false');

class ApiClient {
    private baseUrl: string;
    private useMock: boolean;

    constructor(baseUrl: string, useMock: boolean = true) {
        this.baseUrl = baseUrl;
        this.useMock = useMock;
        console.log(`API Client initialized: baseUrl=${baseUrl}, useMock=${useMock}`);
    }

    private async fetch<T>(endpoint: string, options?: RequestInit): Promise<T> {
        const url = `${this.baseUrl}${endpoint}`;
        console.log(`Fetching: ${url}`);

        const response = await fetch(url, {
            ...options,
            headers: {
                'Content-Type': 'application/json',
                ...options?.headers,
            },
        });

        if (!response.ok) {
            throw new Error(`API Error: ${response.status} ${response.statusText}`);
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

    // Get all insights
    async getAllInsights(page = 1, limit = 50): Promise<{ data: InferredInsight[]; count: number }> {
        if (this.useMock) {
            await new Promise(resolve => setTimeout(resolve, 300));
            const { mockInsights } = await import('../mocks/mockData');
            return { data: mockInsights, count: mockInsights.length };
        }
        return this.fetch<{ data: InferredInsight[]; count: number }>(`/api/insights?page=${page}&limit=${limit}`);
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

    // Toggle mock mode
    setUseMock(useMock: boolean) {
        this.useMock = useMock;
    }
}

export const apiClient = new ApiClient(API_BASE, USE_MOCK);
export default apiClient;
