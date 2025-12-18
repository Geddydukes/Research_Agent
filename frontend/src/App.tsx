import { useMemo, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AppLayout } from './components/Layout/AppLayout';
import { KnowledgeGraph } from './components/Graph/KnowledgeGraph';
import { FilterPanel } from './components/Filters/FilterPanel';
import { EntityDetailPanel } from './components/Panels/EntityDetailPanel';
import { EdgeModal } from './components/Modal/EdgeModal';
import { SearchModal } from './components/Modal/SearchModal';
import { useGraphData } from './hooks/useGraphData';
import { useGraphStore } from './stores/graphStore';
import './index.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      refetchOnWindowFocus: false,
    },
  },
});

function AppContent() {
  // Fetch graph data on mount
  useGraphData();

  const [isSearchOpen, setIsSearchOpen] = useState(false);

  const {
    graphData,
    selectedEntityId,
    selectedEdgeId,
    selectEntity,
    selectEdge,
  } = useGraphStore();

  // Get selected entity from graph data
  const selectedEntity = useMemo(() => {
    if (!selectedEntityId || !graphData) return null;
    return graphData.nodes.find(n => n.id === selectedEntityId) || null;
  }, [selectedEntityId, graphData]);

  // Handle edge click from entity panel
  const handleEdgeClickFromPanel = (edgeId: number) => {
    selectEdge(edgeId);
  };

  return (
    <>
      <AppLayout
        sidebar={<FilterPanel />}
        onSearchClick={() => setIsSearchOpen(true)}
      >
        <KnowledgeGraph />
      </AppLayout>

      {/* Detail Panel - completely separate from layout */}
      {selectedEntity && (
        <EntityDetailPanel
          entity={selectedEntity}
          onClose={() => selectEntity(null)}
          onEdgeClick={handleEdgeClickFromPanel}
        />
      )}

      {/* Edge Modal */}
      {selectedEdgeId && (
        <EdgeModal
          edgeId={selectedEdgeId}
          onClose={() => selectEdge(null)}
        />
      )}

      {/* Search Modal */}
      {isSearchOpen && (
        <SearchModal onClose={() => setIsSearchOpen(false)} />
      )}
    </>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AppContent />
    </QueryClientProvider>
  );
}

export default App;
