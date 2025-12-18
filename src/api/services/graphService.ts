import type { DatabaseClient, Node, Edge } from '../../db/client';
import type {
  GraphNeighborhoodParams,
  GraphViewportParams,
  GraphSubgraphParams,
  GraphResponse,
} from '../types/api';
import { createError } from '../middleware/errorHandler';

export class GraphService {
  constructor(private db: DatabaseClient) {}

  /**
   * Get graph neighborhood starting from a node or paper
   * This is the primary endpoint for UI graph visualization
   */
  async getNeighborhood(
    params: GraphNeighborhoodParams
  ): Promise<GraphResponse> {
    const {
      nodeId,
      paperId,
      depth = 1,
      maxNodes = 500,
      maxEdges = 1000,
    } = params;

    if (!nodeId && !paperId) {
      throw createError('Either nodeId or paperId must be provided', 400);
    }

    let startNodeIds: number[] = [];

    if (nodeId) {
      // Verify the starting node is approved
      const startNode = await this.getNodeById(nodeId);
      if (!startNode) {
        // Node doesn't exist or is not approved
        return {
          nodes: [],
          edges: [],
          metadata: {
            nodeCount: 0,
            edgeCount: 0,
            depth: 0,
          },
        };
      }
      startNodeIds = [nodeId];
    } else if (paperId) {
      // Get all approved nodes for this paper
      const paperNodes = await this.db.getNodesForPaper(paperId, 'approved');
      startNodeIds = paperNodes.map((n) => n.id);
    }

    if (startNodeIds.length === 0) {
      return {
        nodes: [],
        edges: [],
        metadata: {
          nodeCount: 0,
          edgeCount: 0,
          depth: 0,
        },
      };
    }

    // BFS traversal to get neighborhood (only approved nodes/edges)
    const visitedNodes = new Set<number>(startNodeIds);
    const nodes: Node[] = [];
    const edges: Edge[] = [];
    let currentDepth = 0;
    let currentLevelNodes = startNodeIds;

    // Get initial nodes (already verified as approved above)
    for (const nodeId of startNodeIds) {
      const node = await this.getNodeById(nodeId);
      if (node) nodes.push(node);
    }

    // Traverse up to depth
    while (currentDepth < depth && nodes.length < maxNodes) {
      if (currentLevelNodes.length === 0) break;

      const nextLevelNodes = new Set<number>();

      // Get edges for current level nodes
      const edgePromises = currentLevelNodes.map((nId) =>
        this.getEdgesForNode(nId)
      );
      const edgeArrays = await Promise.all(edgePromises);

      for (let i = 0; i < edgeArrays.length; i++) {
        const edgeArray = edgeArrays[i];
        const currentNodeId = currentLevelNodes[i];

        for (const edge of edgeArray) {
          if (edges.length >= maxEdges) break;

          // Add edge if not already added
          if (!edges.find((e) => e.id === edge.id)) {
            edges.push(edge);
          }

          // Add connected nodes
          const connectedNodeId =
            edge.source_node_id === currentNodeId
              ? edge.target_node_id
              : edge.source_node_id;

          if (!visitedNodes.has(connectedNodeId)) {
            visitedNodes.add(connectedNodeId);
            nextLevelNodes.add(connectedNodeId);
          }
        }
      }

      // Fetch next level nodes
      for (const nodeId of Array.from(nextLevelNodes)) {
        if (nodes.length >= maxNodes) break;
        const node = await this.getNodeById(nodeId);
        if (node) nodes.push(node);
      }

      currentLevelNodes = Array.from(nextLevelNodes);
      currentDepth++;
    }

    return {
      nodes,
      edges,
      metadata: {
        nodeCount: nodes.length,
        edgeCount: edges.length,
        depth: currentDepth,
      },
    };
  }

  /**
   * Get graph viewport centered on a paper
   */
  async getViewport(params: GraphViewportParams): Promise<GraphResponse> {
    const { paperId, depth = 1, maxNodes = 500 } = params;

    if (!paperId) {
      throw createError('paperId must be provided', 400);
    }

    return this.getNeighborhood({ paperId, depth, maxNodes, maxEdges: 1000 });
  }

  /**
   * Get subgraph for selected papers
   */
  async getSubgraph(params: GraphSubgraphParams): Promise<GraphResponse> {
    const { paperIds } = params;

    if (!paperIds || paperIds.length === 0) {
      throw createError('paperIds array must be provided', 400);
    }

    // Get all nodes for all papers
    const allNodes: Node[] = [];
    const nodeIdSet = new Set<number>();

    for (const paperId of paperIds) {
      const nodes = await this.db.getNodesForPaper(paperId, 'approved');
      for (const node of nodes) {
        if (!nodeIdSet.has(node.id)) {
          nodeIdSet.add(node.id);
          allNodes.push(node);
        }
      }
    }

    // Get all approved edges between these nodes
    const allEdges: Edge[] = [];
    const edgeIdSet = new Set<number>();

    for (const paperId of paperIds) {
      const edges = await this.db.getEdgesForPaper(paperId, 'approved');
      for (const edge of edges) {
        if (!edgeIdSet.has(edge.id)) {
          edgeIdSet.add(edge.id);
          allEdges.push(edge);
        }
      }
    }

    return {
      nodes: allNodes,
      edges: allEdges,
      metadata: {
        nodeCount: allNodes.length,
        edgeCount: allEdges.length,
        depth: 1,
      },
    };
  }

  /**
   * Get full graph (for debugging only, with hard cap)
   */
  async getFullGraph(maxNodes: number = 1000): Promise<GraphResponse> {
    const { nodes, edges } = await this.db.getGraphData();

    return {
      nodes: nodes.slice(0, maxNodes),
      edges: edges.slice(0, maxNodes * 2), // Roughly 2 edges per node
      metadata: {
        nodeCount: Math.min(nodes.length, maxNodes),
        edgeCount: Math.min(edges.length, maxNodes * 2),
        depth: 0,
      },
    };
  }

  /**
   * Get review graph data (flagged and rejected items)
   */
  async getReviewGraph(): Promise<GraphResponse> {
    const { nodes, edges } = await this.db.getReviewGraphData();

    return {
      nodes,
      edges,
      metadata: {
        nodeCount: nodes.length,
        edgeCount: edges.length,
        depth: 0,
      },
    };
  }

  private async getNodeById(nodeId: number): Promise<Node | null> {
    return this.db.getNodeById(nodeId, 'approved');
  }

  private async getEdgesForNode(nodeId: number): Promise<Edge[]> {
    return this.db.getEdgesForNode(nodeId, 'approved');
  }
}
