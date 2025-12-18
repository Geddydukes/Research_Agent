import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import apiClient from '../api/client';
import { useGraphStore } from '../stores/graphStore';

export function useGraphData() {
    const setGraphData = useGraphStore((state) => state.setGraphData);
    const setLoading = useGraphStore((state) => state.setLoading);
    const setError = useGraphStore((state) => state.setError);

    const query = useQuery({
        queryKey: ['graphData'],
        queryFn: () => apiClient.getGraphData(),
        staleTime: 5 * 60 * 1000, // 5 minutes
        refetchOnWindowFocus: false,
    });

    useEffect(() => {
        setLoading(query.isLoading);
    }, [query.isLoading, setLoading]);

    useEffect(() => {
        if (query.data) {
            setGraphData(query.data);
        }
    }, [query.data, setGraphData]);

    useEffect(() => {
        if (query.error) {
            setError(query.error instanceof Error ? query.error.message : 'Unknown error');
        }
    }, [query.error, setError]);

    return query;
}

export function useEdgeModal(edgeId: number | null) {
    return useQuery({
        queryKey: ['edgeModal', edgeId],
        queryFn: () => edgeId ? apiClient.getEdgeModal(edgeId) : null,
        enabled: edgeId !== null,
        staleTime: 5 * 60 * 1000,
    });
}

export function useEdgeInsights(edgeId: number | null) {
    return useQuery({
        queryKey: ['edgeInsights', edgeId],
        queryFn: () => edgeId ? apiClient.getInsightsForEdge(edgeId) : [],
        enabled: edgeId !== null,
        staleTime: 5 * 60 * 1000,
    });
}

export function usePapersForNode(nodeId: number | null) {
    return useQuery({
        queryKey: ['nodePapers', nodeId],
        queryFn: () => nodeId ? apiClient.getPapersForNode(nodeId) : [],
        enabled: nodeId !== null,
        staleTime: 5 * 60 * 1000,
    });
}

export function useEdgesForNode(nodeId: number | null) {
    return useQuery({
        queryKey: ['nodeEdges', nodeId],
        queryFn: () => nodeId ? apiClient.getEdgesForNode(nodeId) : [],
        enabled: nodeId !== null,
        staleTime: 5 * 60 * 1000,
    });
}
