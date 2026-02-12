import { useCallback, useEffect, useRef, useState } from 'react';
import { apiClient } from '../api/client';
import type { GraphData, Entity, Edge } from '../types';
import modalStyles from '../components/Modal/Modal.module.css';
import styles from './ReviewQueuePage.module.css';

interface ReviewQueuePageProps {
  onClose: () => void;
}

export function ReviewQueuePage({ onClose }: ReviewQueuePageProps) {
  const [data, setData] = useState<GraphData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [nodePage, setNodePage] = useState(1);
  const [edgePage, setEdgePage] = useState(1);
  const pageSize = 10;

  useEffect(() => {
    let isMounted = true;
    apiClient
      .getReviewGraph()
      .then((graph) => {
        if (!isMounted) return;
        setData(graph);
      })
      .catch((err) => {
        if (!isMounted) return;
        setError(err instanceof Error ? err.message : 'Failed to load review items');
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const nodeCount = data?.nodes.length || 0;
  const edgeCount = data?.edges.length || 0;
  const totalNodePages = Math.max(1, Math.ceil(nodeCount / pageSize));
  const totalEdgePages = Math.max(1, Math.ceil(edgeCount / pageSize));
  const nodeStart = (nodePage - 1) * pageSize;
  const edgeStart = (edgePage - 1) * pageSize;
  const nodeMap = new Map<number, Entity>();
  data?.nodes.forEach((node) => nodeMap.set(node.id, node));

  const handleReasonChange = (key: string, value: string) => {
    setReasons((prev) => ({ ...prev, [key]: value }));
  };

  const handleNodeAction = async (node: Entity, status: 'approved' | 'rejected') => {
    const key = `node-${node.id}`;
    setBusyIds((prev) => new Set([...prev, key]));
    try {
      await apiClient.updateNodeReview([
        {
          id: node.id,
          status,
          reason: reasons[key],
          adjusted_confidence: node.adjusted_confidence ?? node.original_confidence ?? undefined,
        },
      ]);
      setData((prev) =>
        prev
          ? { ...prev, nodes: prev.nodes.filter((n) => n.id !== node.id) }
          : prev
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update review status');
    } finally {
      setBusyIds((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  };

  const handleEdgeAction = async (edge: Edge, status: 'approved' | 'rejected') => {
    const key = `edge-${edge.id}`;
    setBusyIds((prev) => new Set([...prev, key]));
    try {
      await apiClient.updateEdgeReview([
        {
          id: edge.id,
          status,
          reason: reasons[key],
        },
      ]);
      setData((prev) =>
        prev
          ? { ...prev, edges: prev.edges.filter((e) => e.id !== edge.id) }
          : prev
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update review status');
    } finally {
      setBusyIds((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  };

  const panelRef = useRef<HTMLDivElement>(null);
  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) onClose();
    },
    [onClose]
  );

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [onClose]);

  return (
    <div
      className={modalStyles.modalOverlay}
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby="review-title"
    >
      <div ref={panelRef} className={modalStyles.modalPanel} onClick={(e) => e.stopPropagation()}>
        <div className={modalStyles.modalPanelHeader}>
          <h2 id="review-title" className={modalStyles.modalPanelTitle}>Review Queue</h2>
          <button className={modalStyles.modalPanelClose} onClick={onClose} type="button" aria-label="Close">
            ×
          </button>
        </div>
        <div className={modalStyles.modalPanelBody}>
          {isLoading && <div className={styles.loading}>Loading review items…</div>}
          {error && <div className={styles.error}>{error}</div>}
          {data && (
          <div className={styles.summary}>
            <div>
              <span className={styles.label}>Flagged nodes</span>
              <div className={styles.value}>{nodeCount}</div>
            </div>
            <div>
              <span className={styles.label}>Flagged edges</span>
              <div className={styles.value}>{edgeCount}</div>
            </div>
          </div>
        )}
        {data && (
          <div className={styles.list}>
            <div className={styles.section}>
              <h3>Nodes</h3>
              {data.nodes.slice(nodeStart, nodeStart + pageSize).map((node) => {
                const key = `node-${node.id}`;
                const confidence = node.adjusted_confidence ?? node.original_confidence ?? 0;
                return (
                  <div key={node.id} className={styles.card}>
                    <div className={styles.cardHeader}>
                      <div>
                        <div className={styles.title}>{node.canonical_name}</div>
                        <div className={styles.meta}>{node.type} · {(confidence * 100).toFixed(0)}%</div>
                      </div>
                      <div className={styles.actions}>
                        <button
                          className={styles.approve}
                          type="button"
                          onClick={() => handleNodeAction(node, 'approved')}
                          disabled={busyIds.has(key)}
                        >
                          Approve
                        </button>
                        <button
                          className={styles.reject}
                          type="button"
                          onClick={() => handleNodeAction(node, 'rejected')}
                          disabled={busyIds.has(key)}
                        >
                          Reject
                        </button>
                      </div>
                    </div>
                    <input
                      className={styles.reason}
                      placeholder="Reason (optional)"
                      value={reasons[key] || ''}
                      onChange={(event) => handleReasonChange(key, event.target.value)}
                    />
                  </div>
                );
              })}
              {nodeCount === 0 && (
                <div className={styles.empty}>No flagged nodes.</div>
              )}
              <div className={styles.pagination}>
                <button
                  type="button"
                  className={styles.pageButton}
                  onClick={() => setNodePage((p) => Math.max(1, p - 1))}
                  disabled={nodePage === 1}
                >
                  Prev
                </button>
                <span className={styles.pageLabel}>
                  Page {nodePage} / {totalNodePages}
                </span>
                <button
                  type="button"
                  className={styles.pageButton}
                  onClick={() => setNodePage((p) => Math.min(totalNodePages, p + 1))}
                  disabled={nodePage >= totalNodePages}
                >
                  Next
                </button>
              </div>
            </div>
            <div className={styles.section}>
              <h3>Edges</h3>
              {data.edges.slice(edgeStart, edgeStart + pageSize).map((edge) => {
                const key = `edge-${edge.id}`;
                const source = nodeMap.get(edge.source_node_id);
                const target = nodeMap.get(edge.target_node_id);
                return (
                  <div key={edge.id} className={styles.card}>
                    <div className={styles.cardHeader}>
                      <div>
                        <div className={styles.title}>{edge.relationship_type.replace(/_/g, ' ')}</div>
                        <div className={styles.meta}>
                          {source?.canonical_name || edge.source_node_id} → {target?.canonical_name || edge.target_node_id}
                        </div>
                        <div className={styles.meta}>Confidence {(edge.confidence * 100).toFixed(0)}%</div>
                      </div>
                      <div className={styles.actions}>
                        <button
                          className={styles.approve}
                          type="button"
                          onClick={() => handleEdgeAction(edge, 'approved')}
                          disabled={busyIds.has(key)}
                        >
                          Approve
                        </button>
                        <button
                          className={styles.reject}
                          type="button"
                          onClick={() => handleEdgeAction(edge, 'rejected')}
                          disabled={busyIds.has(key)}
                        >
                          Reject
                        </button>
                      </div>
                    </div>
                    <input
                      className={styles.reason}
                      placeholder="Reason (optional)"
                      value={reasons[key] || ''}
                      onChange={(event) => handleReasonChange(key, event.target.value)}
                    />
                  </div>
                );
              })}
              {edgeCount === 0 && (
                <div className={styles.empty}>No flagged edges.</div>
              )}
              <div className={styles.pagination}>
                <button
                  type="button"
                  className={styles.pageButton}
                  onClick={() => setEdgePage((p) => Math.max(1, p - 1))}
                  disabled={edgePage === 1}
                >
                  Prev
                </button>
                <span className={styles.pageLabel}>
                  Page {edgePage} / {totalEdgePages}
                </span>
                <button
                  type="button"
                  className={styles.pageButton}
                  onClick={() => setEdgePage((p) => Math.min(totalEdgePages, p + 1))}
                  disabled={edgePage >= totalEdgePages}
                >
                  Next
                </button>
              </div>
            </div>
          </div>
        )}
          <div className={styles.note}>
            Review items are filtered to flagged/rejected only.
          </div>
        </div>
      </div>
    </div>
  );
}
