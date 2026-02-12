import { useMemo, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AppLayout } from './components/Layout/AppLayout';
import { KnowledgeGraph } from './components/Graph/KnowledgeGraph';
import { FilterPanel } from './components/Filters/FilterPanel';
import { EntityDetailPanel } from './components/Panels/EntityDetailPanel';
import { InsightsPanel } from './components/Panels/InsightsPanel';
import { EdgeModal } from './components/Modal/EdgeModal';
import { SearchModal } from './components/Modal/SearchModal';
import { useGraphData } from './hooks/useGraphData';
import { useGraphStore } from './stores/graphStore';
import { AuthProvider, useAuth } from './auth/AuthProvider';
import { LoginPage } from './pages/LoginPage';
import { AccountFinalizationPage } from './pages/AccountFinalizationPage';
import { UserBar } from './components/Auth/UserBar';
import { SettingsPage } from './pages/SettingsPage';
import { ReviewQueuePage } from './pages/ReviewQueuePage';
import { AgentRunnerPage } from './pages/AgentRunnerPage';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ReadOnlyBanner } from './components/ReadOnlyBanner';
import './index.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      refetchOnWindowFocus: false,
    },
  },
});

function AppContent({ readOnly, onSignIn }: { readOnly?: boolean; onSignIn?: () => void }) {
  // Fetch graph data on mount
  useGraphData();

  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isInsightsOpen, setIsInsightsOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isReviewOpen, setIsReviewOpen] = useState(false);
  const [isRunnerOpen, setIsRunnerOpen] = useState(false);

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
      {readOnly && onSignIn && <ReadOnlyBanner onSignIn={onSignIn} />}
      <AppLayout
        sidebar={<FilterPanel />}
        onSearchClick={() => setIsSearchOpen(true)}
        onInsightsClick={() => setIsInsightsOpen(!isInsightsOpen)}
        userBar={!readOnly ? (
          <UserBar
            onSettingsClick={() => setIsSettingsOpen(true)}
            onReviewClick={() => setIsReviewOpen(true)}
            onRunClick={() => setIsRunnerOpen(true)}
          />
        ) : undefined}
      >
        <KnowledgeGraph />
      </AppLayout>

      {/* Insights Panel */}
      {isInsightsOpen && (
        <InsightsPanel onClose={() => setIsInsightsOpen(false)} />
      )}

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

      {isSettingsOpen && (
        <SettingsPage onClose={() => setIsSettingsOpen(false)} />
      )}

      {isReviewOpen && (
        <ReviewQueuePage onClose={() => setIsReviewOpen(false)} />
      )}

      {isRunnerOpen && (
        <AgentRunnerPage onClose={() => setIsRunnerOpen(false)} />
      )}
    </>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ErrorBoundary>
          <AuthGate />
        </ErrorBoundary>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;

function AuthGate() {
  const { session, isLoading, tenantId, needsOnboarding, signOut } = useAuth();

  if (isLoading) {
    return <div style={{ padding: '2rem' }}>Loading…</div>;
  }

  if (!session) {
    return <LoginPage />;
  }

  if (session && !tenantId) {
    return (
      <div className="auth-setup-failed" style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: '2rem', textAlign: 'center' }}>
        <div>
          <p style={{ marginBottom: '1rem', color: '#475569' }}>
            We couldn’t finish setting up your workspace. Please sign out and try again.
          </p>
          <button
            type="button"
            onClick={() => signOut()}
            style={{ padding: '0.5rem 1rem', borderRadius: '8px', border: '1px solid #cbd5e1', background: '#fff', cursor: 'pointer' }}
          >
            Sign out
          </button>
        </div>
      </div>
    );
  }

  if (needsOnboarding) {
    return <AccountFinalizationPage />;
  }

  return <AppContent />;
}
