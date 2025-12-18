// Mock data for testing the frontend without backend
// This simulates the data structure from your backend

import type { GraphData, Paper, EdgeModalData, InferredInsight } from '../types';

export const mockGraphData: GraphData = {
    nodes: [
        // Methods
        { id: 1, type: 'method', canonical_name: 'NeRF', metadata: { year: 2020 }, original_confidence: 0.95, adjusted_confidence: 0.95, created_at: '2024-01-01' },
        { id: 2, type: 'method', canonical_name: '3D Gaussian Splatting', metadata: { year: 2023 }, original_confidence: 0.92, adjusted_confidence: 0.92, created_at: '2024-01-01' },
        { id: 3, type: 'method', canonical_name: 'Instant NGP', metadata: { year: 2022 }, original_confidence: 0.88, adjusted_confidence: 0.88, created_at: '2024-01-01' },
        { id: 4, type: 'method', canonical_name: 'Mip-NeRF', metadata: { year: 2021 }, original_confidence: 0.91, adjusted_confidence: 0.91, created_at: '2024-01-01' },
        { id: 5, type: 'method', canonical_name: 'Plenoxels', metadata: { year: 2022 }, original_confidence: 0.85, adjusted_confidence: 0.85, created_at: '2024-01-01' },

        // Datasets
        { id: 6, type: 'dataset', canonical_name: 'Blender Dataset', metadata: { size: '1000 scenes' }, original_confidence: 0.90, adjusted_confidence: 0.90, created_at: '2024-01-01' },
        { id: 7, type: 'dataset', canonical_name: 'LLFF', metadata: { type: 'forward-facing' }, original_confidence: 0.88, adjusted_confidence: 0.88, created_at: '2024-01-01' },
        { id: 8, type: 'dataset', canonical_name: 'Tanks & Temples', metadata: { type: 'large-scale' }, original_confidence: 0.87, adjusted_confidence: 0.87, created_at: '2024-01-01' },

        // Metrics
        { id: 9, type: 'metric', canonical_name: 'PSNR', metadata: { unit: 'dB' }, original_confidence: 0.95, adjusted_confidence: 0.95, created_at: '2024-01-01' },
        { id: 10, type: 'metric', canonical_name: 'SSIM', metadata: { range: '0-1' }, original_confidence: 0.94, adjusted_confidence: 0.94, created_at: '2024-01-01' },
        { id: 11, type: 'metric', canonical_name: 'LPIPS', metadata: { type: 'perceptual' }, original_confidence: 0.89, adjusted_confidence: 0.89, created_at: '2024-01-01' },
        { id: 12, type: 'metric', canonical_name: 'FPS', metadata: { unit: 'frames/sec' }, original_confidence: 0.92, adjusted_confidence: 0.92, created_at: '2024-01-01' },

        // Concepts
        { id: 13, type: 'concept', canonical_name: 'Neural Rendering', metadata: null, original_confidence: 0.93, adjusted_confidence: 0.93, created_at: '2024-01-01' },
        { id: 14, type: 'concept', canonical_name: 'Novel View Synthesis', metadata: null, original_confidence: 0.91, adjusted_confidence: 0.91, created_at: '2024-01-01' },
        { id: 15, type: 'concept', canonical_name: 'Differentiable Rendering', metadata: null, original_confidence: 0.88, adjusted_confidence: 0.88, created_at: '2024-01-01' },

        // Tasks
        { id: 16, type: 'task', canonical_name: 'Scene Reconstruction', metadata: null, original_confidence: 0.90, adjusted_confidence: 0.90, created_at: '2024-01-01' },
        { id: 17, type: 'task', canonical_name: 'Real-time Rendering', metadata: null, original_confidence: 0.87, adjusted_confidence: 0.87, created_at: '2024-01-01' },
    ],
    edges: [
        // Method relationships
        { id: 1, source_node_id: 2, target_node_id: 1, relationship_type: 'extends', confidence: 0.95, evidence: 'We build upon Neural Radiance Fields by replacing the implicit MLP with explicit 3D Gaussians', provenance: { section_type: 'methods', paper_id: '2308.04079' }, created_at: '2024-01-01' },
        { id: 2, source_node_id: 3, target_node_id: 1, relationship_type: 'extends', confidence: 0.92, evidence: 'Instant-NGP achieves speedups by using multi-resolution hash encoding with NeRF backbone', provenance: { section_type: 'methods', paper_id: '2201.05989' }, created_at: '2024-01-01' },
        { id: 3, source_node_id: 4, target_node_id: 1, relationship_type: 'improves', confidence: 0.91, evidence: 'Mip-NeRF addresses aliasing artifacts in NeRF through integrated positional encoding', provenance: { section_type: 'abstract', paper_id: '2103.13415' }, created_at: '2024-01-01' },
        { id: 4, source_node_id: 5, target_node_id: 1, relationship_type: 'extends', confidence: 0.85, evidence: 'Plenoxels achieve similar quality to NeRF without neural networks', provenance: { section_type: 'results', paper_id: '2112.05131' }, created_at: '2024-01-01' },
        { id: 5, source_node_id: 2, target_node_id: 3, relationship_type: 'compares_to', confidence: 0.88, evidence: 'Compared to Instant-NGP, 3DGS achieves faster rendering through rasterization', provenance: { section_type: 'results', paper_id: '2308.04079' }, created_at: '2024-01-01' },

        // Method -> Dataset (uses)
        { id: 6, source_node_id: 1, target_node_id: 6, relationship_type: 'uses', confidence: 0.94, evidence: 'We evaluate on the synthetic Blender dataset', provenance: { section_type: 'results', paper_id: '2003.08934' }, created_at: '2024-01-01' },
        { id: 7, source_node_id: 1, target_node_id: 7, relationship_type: 'uses', confidence: 0.91, evidence: 'Results on LLFF forward-facing scenes', provenance: { section_type: 'results', paper_id: '2003.08934' }, created_at: '2024-01-01' },
        { id: 8, source_node_id: 2, target_node_id: 6, relationship_type: 'uses', confidence: 0.93, evidence: 'Experiments on Blender synthetic scenes', provenance: { section_type: 'results', paper_id: '2308.04079' }, created_at: '2024-01-01' },
        { id: 9, source_node_id: 2, target_node_id: 8, relationship_type: 'uses', confidence: 0.89, evidence: 'We additionally evaluate on Tanks & Temples', provenance: { section_type: 'results', paper_id: '2308.04079' }, created_at: '2024-01-01' },

        // Method -> Metric (evaluates)
        { id: 10, source_node_id: 1, target_node_id: 9, relationship_type: 'evaluates', confidence: 0.96, evidence: 'We report PSNR for quantitative comparisons', provenance: { section_type: 'results', paper_id: '2003.08934' }, created_at: '2024-01-01' },
        { id: 11, source_node_id: 1, target_node_id: 10, relationship_type: 'evaluates', confidence: 0.95, evidence: 'SSIM scores for structural similarity', provenance: { section_type: 'results', paper_id: '2003.08934' }, created_at: '2024-01-01' },
        { id: 12, source_node_id: 2, target_node_id: 9, relationship_type: 'evaluates', confidence: 0.94, evidence: 'PSNR comparison with baselines', provenance: { section_type: 'results', paper_id: '2308.04079' }, created_at: '2024-01-01' },
        { id: 13, source_node_id: 2, target_node_id: 12, relationship_type: 'evaluates', confidence: 0.92, evidence: 'We achieve 100+ FPS at 1080p resolution', provenance: { section_type: 'results', paper_id: '2308.04079' }, created_at: '2024-01-01' },

        // Concept relationships
        { id: 14, source_node_id: 1, target_node_id: 13, relationship_type: 'implements', confidence: 0.93, evidence: 'NeRF is a foundational neural rendering technique', provenance: { section_type: 'abstract', paper_id: '2003.08934' }, created_at: '2024-01-01' },
        { id: 15, source_node_id: 1, target_node_id: 14, relationship_type: 'implements', confidence: 0.95, evidence: 'NeRF achieves photorealistic novel view synthesis', provenance: { section_type: 'abstract', paper_id: '2003.08934' }, created_at: '2024-01-01' },
        { id: 16, source_node_id: 2, target_node_id: 17, relationship_type: 'implements', confidence: 0.91, evidence: '3DGS enables real-time rendering of radiance fields', provenance: { section_type: 'abstract', paper_id: '2308.04079' }, created_at: '2024-01-01' },
        { id: 17, source_node_id: 13, target_node_id: 15, relationship_type: 'based_on', confidence: 0.88, evidence: 'Neural rendering relies on differentiable rendering for gradient-based optimization', provenance: null, created_at: '2024-01-01' },
    ],
};

export const mockPapers: Paper[] = [
    { paper_id: '2003.08934', title: 'NeRF: Representing Scenes as Neural Radiance Fields for View Synthesis', abstract: 'We present a method that achieves state-of-the-art results for synthesizing novel views of complex scenes...', year: 2020, metadata: { authors: ['Mildenhall', 'Srinivasan', 'Tancik'] }, created_at: '2024-01-01' },
    { paper_id: '2308.04079', title: '3D Gaussian Splatting for Real-Time Radiance Field Rendering', abstract: 'Radiance Field methods have recently revolutionized novel-view synthesis...', year: 2023, metadata: { authors: ['Kerbl', 'Kopanas', 'Leimkühler'] }, created_at: '2024-01-01' },
    { paper_id: '2201.05989', title: 'Instant Neural Graphics Primitives with a Multiresolution Hash Encoding', abstract: 'Neural graphics primitives, parameterized by fully connected neural networks...', year: 2022, metadata: { authors: ['Müller', 'Evans', 'Schied', 'Keller'] }, created_at: '2024-01-01' },
    { paper_id: '2103.13415', title: 'Mip-NeRF: A Multiscale Representation for Anti-Aliasing Neural Radiance Fields', abstract: 'The rendering procedure used by neural radiance fields samples a scene...', year: 2021, metadata: { authors: ['Barron', 'Mildenhall', 'Tancik'] }, created_at: '2024-01-01' },
    { paper_id: '2112.05131', title: 'Plenoxels: Radiance Fields without Neural Networks', abstract: 'We introduce Plenoxels (plenoptic voxels), a system for photorealistic view synthesis...', year: 2022, metadata: { authors: ['Fridovich-Keil', 'Yu'] }, created_at: '2024-01-01' },
];

export const mockInsights: InferredInsight[] = [
    { id: 1, insight_type: 'transitive_relationship', subject_nodes: [1, 2, 3], reasoning_path: { steps: ['NeRF is foundational', '3DGS and Instant-NGP both extend NeRF', 'They represent parallel evolution paths'], confidence: 0.85 }, confidence: 0.85, created_at: '2024-01-01' },
    { id: 2, insight_type: 'trend_analysis', subject_nodes: [2, 3, 5], reasoning_path: { steps: ['Recent methods focus on speed', 'Shift from implicit to explicit representations', 'Real-time rendering as primary goal'], confidence: 0.82 }, confidence: 0.82, created_at: '2024-01-01' },
    { id: 3, insight_type: 'cluster_analysis', subject_nodes: [1, 2, 3, 4, 5], reasoning_path: { steps: ['All methods address novel view synthesis', 'Shared evaluation datasets', 'Common metrics: PSNR, SSIM, LPIPS'], confidence: 0.90 }, confidence: 0.90, created_at: '2024-01-01' },
];

// Helper to get mock edge modal data
export function getMockEdgeModal(edgeId: number): EdgeModalData | null {
    const edge = mockGraphData.edges.find(e => e.id === edgeId);
    if (!edge) return null;

    const sourceNode = mockGraphData.nodes.find(n => n.id === edge.source_node_id) || null;
    const targetNode = mockGraphData.nodes.find(n => n.id === edge.target_node_id) || null;

    const sourcePaperId = edge.provenance?.paper_id;
    const sourcePaper = sourcePaperId ? mockPapers.find(p => p.paper_id === sourcePaperId) || null : null;

    return {
        edge,
        source_node: sourceNode,
        target_node: targetNode,
        source_paper: sourcePaper,
        target_paper: null,
    };
}

// Helper to get papers for a node
export function getMockPapersForNode(nodeId: number): Paper[] {
    // Simplified mock - in reality this would come from entity_mentions
    if (nodeId === 1) return mockPapers.slice(0, 2);
    if (nodeId === 2) return [mockPapers[1]];
    if (nodeId === 3) return [mockPapers[2]];
    if (nodeId === 4) return [mockPapers[3]];
    if (nodeId === 5) return [mockPapers[4]];
    return [];
}

// Helper to get edges for a node
export function getMockEdgesForNode(nodeId: number) {
    return mockGraphData.edges.filter(
        e => e.source_node_id === nodeId || e.target_node_id === nodeId
    );
}

// Helper to get insights for an edge
export function getMockInsightsForEdge(edgeId: number): InferredInsight[] {
    const edge = mockGraphData.edges.find(e => e.id === edgeId);
    if (!edge) return [];

    return mockInsights.filter(insight =>
        insight.subject_nodes.includes(edge.source_node_id) ||
        insight.subject_nodes.includes(edge.target_node_id)
    );
}
