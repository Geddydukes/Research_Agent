import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../api/client';
import type { ArxivPaper, PipelineJob } from '../types';
import modalStyles from '../components/Modal/Modal.module.css';
import styles from './AgentRunnerPage.module.css';

interface AgentRunnerPageProps {
  onClose: () => void;
}

export function AgentRunnerPage({ onClose }: AgentRunnerPageProps) {
  const [paperId, setPaperId] = useState('');
  const [title, setTitle] = useState('');
  const [rawText, setRawText] = useState('');
  const [metadata, setMetadata] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [reasoningDepth, setReasoningDepth] = useState(5);
  const [fileError, setFileError] = useState<string | null>(null);
  const [jobs, setJobs] = useState<PipelineJob[]>([]);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [selectedJob, setSelectedJob] = useState<PipelineJob | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [arxivQuery, setArxivQuery] = useState('');
  const [arxivResults, setArxivResults] = useState<ArxivPaper[]>([]);
  const [arxivLoading, setArxivLoading] = useState(false);
  const [arxivError, setArxivError] = useState<string | null>(null);

  const queryClient = useQueryClient();
  const latestJobs = useMemo(() => jobs.slice(0, 5), [jobs]);
  const activeJob = useMemo(
    () => (activeJobId ? jobs.find((j) => j.jobId === activeJobId) : null),
    [activeJobId, jobs]
  );

  const loadJobs = async () => {
    try {
      const result = await apiClient.listJobs();
      setJobs(result.data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load jobs');
    }
  };

  useEffect(() => {
    loadJobs();
  }, []);

  useEffect(() => {
    if (!activeJobId) return;
    let timer: number | undefined;

    const poll = async () => {
      try {
        const status = await apiClient.getJobStatus(activeJobId);
        setJobs((prev) => {
          const next = prev.filter((job) => job.jobId !== activeJobId);
          return [status, ...next];
        });
        if (status.status === 'completed' || status.status === 'failed') {
          setActiveJobId(null);
          queryClient.invalidateQueries({ queryKey: ['graphData'] });
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to poll job');
      }
    };

    timer = window.setInterval(poll, 2000);
    poll();

    return () => {
      if (timer) window.clearInterval(timer);
    };
  }, [activeJobId, queryClient]);

  const handleArxivSearch = async () => {
    if (!arxivQuery.trim()) return;
    setArxivError(null);
    setArxivLoading(true);
    try {
      const { data } = await apiClient.searchArxiv(arxivQuery.trim(), 20);
      setArxivResults(data || []);
    } catch (err) {
      setArxivError(err instanceof Error ? err.message : 'arXiv search failed');
      setArxivResults([]);
    } finally {
      setArxivLoading(false);
    }
  };

  const useArxivPaper = (paper: ArxivPaper) => {
    setSourceUrl(`https://arxiv.org/abs/${paper.paperId}`);
    setPaperId(paper.paperId);
    setTitle(paper.title);
    setFile(null);
    setRawText('');
  };

  const runArxivPaper = async (paper: ArxivPaper) => {
    setError(null);
    setIsSubmitting(true);
    try {
      const result = await apiClient.processUrl({
        url: `https://arxiv.org/abs/${paper.paperId}`,
        paper_id: paper.paperId,
        title: paper.title,
        reasoning_depth: reasoningDepth,
      });
      setActiveJobId(result.jobId);
      setArxivResults([]);
      setArxivQuery('');
      await loadJobs();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start job');
    } finally {
      setIsSubmitting(false);
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

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      if (!file && !sourceUrl.trim() && !rawText.trim()) {
        throw new Error('Provide a file, URL, or raw text to process.');
      }
      let parsedMetadata: Record<string, unknown> | undefined;
      if (metadata.trim()) {
        parsedMetadata = JSON.parse(metadata);
      }

      let result: { jobId: string; status: string };

      if (file) {
        const base64 = await readFileAsBase64(file);
        result = await apiClient.processFile({
          file_name: file.name,
          file_base64: base64,
          reasoning_depth: reasoningDepth,
        });
      } else if (sourceUrl.trim()) {
        result = await apiClient.processUrl({
          url: sourceUrl.trim(),
          paper_id: paperId || undefined,
          title: title || undefined,
          reasoning_depth: reasoningDepth,
        });
      } else {
        if (!paperId || !rawText.trim()) {
          throw new Error('Paper ID and raw text are required when no file or URL is provided.');
        }
        result = await apiClient.processPaper({
          paper_id: paperId,
          title: title || undefined,
          raw_text: rawText,
          metadata: parsedMetadata,
          reasoning_depth: reasoningDepth,
        });
      }

      setActiveJobId(result.jobId);
      setPaperId('');
      setTitle('');
      setRawText('');
      setMetadata('');
      setSourceUrl('');
      setFile(null);
      await loadJobs();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start job');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className={modalStyles.modalOverlay}
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby="run-agent-title"
    >
      <div ref={panelRef} className={modalStyles.modalPanel} onClick={(e) => e.stopPropagation()}>
        <div className={modalStyles.modalPanelHeader}>
          <h2 id="run-agent-title" className={modalStyles.modalPanelTitle}>Run Agent</h2>
          <button className={modalStyles.modalPanelClose} onClick={onClose} type="button" aria-label="Close">
            ×
          </button>
        </div>

        <div className={modalStyles.modalPanelBody}>
        {activeJobId && (
          <div className={styles.processingBanner} role="status" aria-live="polite">
            <div className={styles.processingSpinner} />
            <div className={styles.processingText}>
              <strong>Processing paper…</strong>
              {activeJob?.status === 'processing' && activeJob?.result?.progress?.stage && (
                <span className={styles.processingStage}>
                  {String(activeJob.result.progress.stage)}
                </span>
              )}
              {activeJob?.status === 'pending' && (
                <span className={styles.processingStage}>Starting…</span>
              )}
            </div>
          </div>
        )}

        <section className={styles.arxivSection}>
          <h3 className={styles.arxivTitle}>Search arXiv</h3>
          <div className={styles.arxivRow}>
            <input
              className={styles.input}
              type="text"
              value={arxivQuery}
              onChange={(e) => setArxivQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleArxivSearch())}
              placeholder="Keywords, title, author..."
              aria-label="arXiv search query"
            />
            <button
              type="button"
              className={styles.arxivSearchBtn}
              onClick={handleArxivSearch}
              disabled={arxivLoading || !arxivQuery.trim()}
            >
              {arxivLoading ? 'Searching…' : 'Search'}
            </button>
          </div>
          {arxivError && <div className={styles.inlineError}>{arxivError}</div>}
          {arxivResults.length > 0 && (
            <ul className={styles.arxivList}>
              {arxivResults.map((paper) => (
                <li key={paper.paperId} className={styles.arxivItem}>
                  <div className={styles.arxivItemContent}>
                    <span className={styles.arxivItemTitle}>{paper.title}</span>
                    {paper.abstract && (
                      <p className={styles.arxivItemAbstract}>
                        {paper.abstract.length > 180 ? `${paper.abstract.slice(0, 180)}…` : paper.abstract}
                      </p>
                    )}
                    <span className={styles.arxivItemMeta}>
                      {paper.paperId}
                      {paper.year != null && ` · ${paper.year}`}
                    </span>
                  </div>
                  <div className={styles.arxivItemActions}>
                    <button type="button" className={styles.arxivUseBtn} onClick={() => useArxivPaper(paper)}>
                      Use
                    </button>
                    <button
                      type="button"
                      className={styles.arxivRunBtn}
                      onClick={() => runArxivPaper(paper)}
                      disabled={isSubmitting}
                    >
                      Run
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <form className={styles.form} onSubmit={handleSubmit}>
          <label className={styles.label}>
            Paper ID
            <input
              className={styles.input}
              value={paperId}
              onChange={(event) => setPaperId(event.target.value)}
              placeholder="paper-123"
            />
          </label>
          <label className={styles.label}>
            Reasoning depth
            <select
              className={styles.input}
              value={reasoningDepth}
              onChange={(event) => setReasoningDepth(Number(event.target.value))}
              aria-label="Reasoning depth (1–20)"
            >
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20].map((d) => (
                <option key={d} value={d}>
                  {d === 1 ? '1 (Quick)' : d === 5 ? '5 (Standard)' : d === 10 ? '10 (Deep)' : d === 20 ? '20 (Rigorous)' : `${d}`}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.label}>
            Title (optional)
            <input
              className={styles.input}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Paper title"
            />
          </label>
          <label className={styles.label}>
            Source URL (PDF or JSON)
            <input
              className={styles.input}
              value={sourceUrl}
              onChange={(event) => setSourceUrl(event.target.value)}
              placeholder="https://arxiv.org/pdf/..."
            />
            <span className={styles.hint}>ArXiv abs links are supported.</span>
          </label>
          <label className={styles.label}>
            Upload file (PDF/DOCX/JSON)
            <input
              className={styles.input}
              type="file"
              accept=".pdf,.docx,.json"
              onChange={(event) => {
                const selected = event.target.files?.[0] || null;
                if (selected && selected.size > 10 * 1024 * 1024) {
                  setFileError('File too large (max 10MB).');
                  setFile(null);
                  return;
                }
                setFileError(null);
                setFile(selected);
              }}
            />
            {fileError && <div className={styles.inlineError}>{fileError}</div>}
          </label>
          <label className={styles.label}>
            Raw text
            <textarea
              className={styles.textarea}
              value={rawText}
              onChange={(event) => setRawText(event.target.value)}
              placeholder="Paste the paper text here"
              rows={6}
            />
          </label>
          <label className={styles.label}>
            Metadata (optional JSON)
            <textarea
              className={styles.textarea}
              value={metadata}
              onChange={(event) => setMetadata(event.target.value)}
              placeholder='{"authors":["Alice","Bob"]}'
              rows={3}
            />
          </label>
          <button className={styles.submit} type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Submitting…' : 'Start processing'}
          </button>
        </form>
        {error && <div className={styles.error}>{error}</div>}
        <div className={styles.jobs}>
          <h3>Recent jobs</h3>
          {latestJobs.length === 0 && <div className={styles.empty}>No jobs yet.</div>}
          {latestJobs.map((job) => (
            <button
              key={job.jobId}
              type="button"
              className={styles.jobRow}
              onClick={() => setSelectedJob(job)}
            >
              <div>
                <div className={styles.jobId}>{job.paperId || job.jobId}</div>
                <div className={styles.jobMeta}>{job.status}</div>
                {job.result?.progress?.stage && (
                  <div className={styles.jobStats}>
                    Stage: {job.result.progress.stage}
                  </div>
                )}
                {job.result?.stats && (
                  <div className={styles.jobStats}>
                    Entities {job.result.stats.entitiesExtracted ?? '-'} · Edges {job.result.stats.edgesExtracted ?? '-'}
                  </div>
                )}
              </div>
              {job.error && <div className={styles.jobError}>{job.error}</div>}
            </button>
          ))}
        </div>
        {selectedJob && (
          <div className={styles.jobDetailOverlay} role="dialog" aria-modal="true" onClick={() => setSelectedJob(null)}>
            <div className={styles.jobDetailModal} onClick={(e) => e.stopPropagation()}>
              <div className={modalStyles.modalPanelHeader}>
                <h3 className={modalStyles.modalPanelTitle}>Job details</h3>
                <button className={modalStyles.modalPanelClose} onClick={() => setSelectedJob(null)} type="button">
                  ×
                </button>
              </div>
              <div className={styles.modalBody}>
                <div className={styles.modalRow}>
                  <span>Status</span>
                  <span>{selectedJob.status}</span>
                </div>
                {selectedJob.paperId && (
                  <div className={styles.modalRow}>
                    <span>Paper ID</span>
                    <span>{selectedJob.paperId}</span>
                  </div>
                )}
                {selectedJob.error && (
                  <div className={styles.modalError}>{selectedJob.error}</div>
                )}
                {selectedJob.result && (
                  <pre className={styles.modalJson}>
                    {JSON.stringify(selectedJob.result, null, 2)}
                  </pre>
                )}
              </div>
            </div>
          </div>
        )}
        </div>
      </div>
    </div>
  );
}

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.split(',')[1] || '';
      resolve(base64);
    };
    reader.onerror = () => reject(reader.error || new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}
