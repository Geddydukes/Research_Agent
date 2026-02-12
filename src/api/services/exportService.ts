import type { DatabaseClient, Node, Edge, Paper } from '../../db/client';

const EXPORT_PAPERS_LIMIT = 10000;

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function paperUrl(paper: Paper): string {
  const meta = paper.metadata as Record<string, unknown> | null;
  if (!meta) return '';
  const externalIds = meta.externalIds as Record<string, string> | undefined;
  if (!externalIds) return '';
  const arxivId = externalIds.ArXiv || externalIds.arXiv || externalIds.arxiv;
  if (arxivId) return `https://arxiv.org/abs/${arxivId.replace(/v\d+$/, '')}`;
  const doi = externalIds.DOI || externalIds.doi;
  if (doi) return `https://doi.org/${doi}`;
  const corpusId = externalIds.CorpusId;
  if (corpusId) return `https://www.semanticscholar.org/paper/${corpusId}`;
  return '';
}

function paperAuthors(paper: Paper): string {
  const meta = paper.metadata as Record<string, unknown> | null;
  if (!meta) return '';
  const authors = meta.authors;
  if (Array.isArray(authors)) return authors.join('; ');
  if (typeof authors === 'string') return authors;
  return '';
}

function escapeCsv(val: unknown): string {
  if (val == null) return '';
  const s = String(val);
  if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

export interface ExportPayload {
  nodes: Node[];
  edges: Edge[];
  papers: Paper[];
  exportedAt: string;
}

export class ExportService {
  constructor(private db: DatabaseClient) {}

  async getExportData(): Promise<ExportPayload> {
    const [graph, papers] = await Promise.all([
      this.db.getGraphData(),
      this.db.getPapersForExport(EXPORT_PAPERS_LIMIT),
    ]);
    return {
      nodes: graph.nodes,
      edges: graph.edges,
      papers,
      exportedAt: new Date().toISOString(),
    };
  }

  toGraphML(payload: ExportPayload): string {
    const { nodes, edges } = payload;
    const lines: string[] = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<graphml xmlns="http://graphml.graphdrawing.org/xmlns">',
      '  <key id="node_type" for="node" attr.name="type" attr.type="string"/>',
      '  <key id="node_name" for="node" attr.name="name" attr.type="string"/>',
      '  <key id="node_confidence" for="node" attr.name="confidence" attr.type="double"/>',
      '  <key id="edge_relationship_type" for="edge" attr.name="relationship_type" attr.type="string"/>',
      '  <key id="edge_confidence" for="edge" attr.name="confidence" attr.type="double"/>',
      '  <key id="edge_evidence" for="edge" attr.name="evidence" attr.type="string"/>',
      '  <key id="edge_provenance" for="edge" attr.name="provenance" attr.type="string"/>',
      '  <graph id="G" edgedefault="undirected">',
    ];

    for (const n of nodes) {
      const conf = n.adjusted_confidence ?? n.original_confidence ?? '';
      lines.push(
        `    <node id="n${n.id}">`,
        `      <data key="node_type">${escapeXml(n.type)}</data>`,
        `      <data key="node_name">${escapeXml(n.canonical_name)}</data>`,
        `      <data key="node_confidence">${conf}</data>`,
        '    </node>'
      );
    }
    for (const e of edges) {
      lines.push(
        `    <edge source="n${e.source_node_id}" target="n${e.target_node_id}">`,
        `      <data key="edge_relationship_type">${escapeXml(e.relationship_type)}</data>`,
        `      <data key="edge_confidence">${e.confidence}</data>`,
        `      <data key="edge_evidence">${escapeXml(e.evidence ?? '')}</data>`,
        `      <data key="edge_provenance">${escapeXml(JSON.stringify(e.provenance ?? {}))}</data>`,
        '    </edge>'
      );
    }
    lines.push('  </graph>', '</graphml>');
    return lines.join('\n');
  }

  toGEXF(payload: ExportPayload): string {
    const { nodes, edges } = payload;
    const lines: string[] = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<gexf xmlns="http://www.gexf.net/1.2draft" version="1.2">',
      '  <graph mode="static" defaultedgetype="undirected">',
      '    <attributes class="node">',
      '      <attribute id="0" title="type" type="string"/>',
      '      <attribute id="1" title="confidence" type="double"/>',
      '    </attributes>',
      '    <attributes class="edge">',
      '      <attribute id="0" title="relationship_type" type="string"/>',
      '      <attribute id="1" title="evidence" type="string"/>',
      '    </attributes>',
      '    <nodes>',
    ];
    for (const n of nodes) {
      const conf = n.adjusted_confidence ?? n.original_confidence ?? '';
      lines.push(
        `      <node id="${n.id}" label="${escapeXml(n.canonical_name)}">`,
        `        <attvalues>`,
        `          <attvalue for="0" value="${escapeXml(n.type)}"/>`,
        `          <attvalue for="1" value="${conf}"/>`,
        `        </attvalues>`,
        '      </node>'
      );
    }
    lines.push('    </nodes>', '    <edges>');
    for (const e of edges) {
      lines.push(
        `      <edge source="${e.source_node_id}" target="${e.target_node_id}" weight="${e.confidence}">`,
        `        <attvalues>`,
        `          <attvalue for="0" value="${escapeXml(e.relationship_type)}"/>`,
        `          <attvalue for="1" value="${escapeXml((e.evidence ?? '').slice(0, 500))}"/>`,
        `        </attvalues>`,
        '      </edge>'
      );
    }
    lines.push(
      '    </edges>',
      '  </graph>',
      '</gexf>'
    );
    return lines.join('\n');
  }

  toCsvBundle(payload: ExportPayload): { entities: string; relationships: string; papers: string } {
    const { nodes, edges, papers } = payload;
    const entityRows: string[] = [
      'id,name,type,confidence,paper_count',
    ];
    const paperCountByNode = new Map<number, Set<string>>();
    for (const e of edges) {
      const prov = (e.provenance as Record<string, unknown> | null) || {};
      const paperId = (prov.paper_id as string) || '';
      if (paperId) {
        if (!paperCountByNode.has(e.source_node_id)) paperCountByNode.set(e.source_node_id, new Set());
        paperCountByNode.get(e.source_node_id)!.add(paperId);
        if (!paperCountByNode.has(e.target_node_id)) paperCountByNode.set(e.target_node_id, new Set());
        paperCountByNode.get(e.target_node_id)!.add(paperId);
      }
    }
    for (const n of nodes) {
      const conf = n.adjusted_confidence ?? n.original_confidence ?? '';
      const count = paperCountByNode.get(n.id)?.size ?? 0;
      entityRows.push(
        [n.id, escapeCsv(n.canonical_name), escapeCsv(n.type), conf, count].join(',')
      );
    }

    const relRows: string[] = [
      'source,target,type,confidence,evidence,paper_title,year',
    ];
    const paperMap = new Map(papers.map((p) => [p.paper_id, p]));
    for (const e of edges) {
      const prov = (e.provenance as Record<string, unknown> | null) || {};
      const paperId = (prov.paper_id as string) || '';
      const paper = paperMap.get(paperId);
      const paperTitle = paper?.title ?? '';
      const year = paper?.year ?? '';
      relRows.push(
        [
          e.source_node_id,
          e.target_node_id,
          escapeCsv(e.relationship_type),
          e.confidence,
          escapeCsv((e.evidence ?? '').slice(0, 500)),
          escapeCsv(paperTitle),
          year,
        ].join(',')
      );
    }

    const paperRows: string[] = ['id,title,authors,year,url'];
    for (const p of papers) {
      paperRows.push(
        [
          escapeCsv(p.paper_id),
          escapeCsv(p.title ?? ''),
          escapeCsv(paperAuthors(p)),
          p.year ?? '',
          escapeCsv(paperUrl(p)),
        ].join(',')
      );
    }

    return {
      entities: entityRows.join('\n'),
      relationships: relRows.join('\n'),
      papers: paperRows.join('\n'),
    };
  }

  toJson(payload: ExportPayload): string {
    const { nodes, edges, papers, exportedAt } = payload;
    const distinctPapersByNode = new Map<number, Set<string>>();
    for (const e of edges) {
      const prov = (e.provenance as Record<string, unknown> | null) || {};
      const paperId = (prov.paper_id as string) || '';
      if (paperId) {
        if (!distinctPapersByNode.has(e.source_node_id)) distinctPapersByNode.set(e.source_node_id, new Set());
        distinctPapersByNode.get(e.source_node_id)!.add(paperId);
        if (!distinctPapersByNode.has(e.target_node_id)) distinctPapersByNode.set(e.target_node_id, new Set());
        distinctPapersByNode.get(e.target_node_id)!.add(paperId);
      }
    }
    const entities = nodes.map((n) => ({
      id: n.id,
      name: n.canonical_name,
      type: n.type,
      confidence: n.adjusted_confidence ?? n.original_confidence ?? null,
      paper_count: distinctPapersByNode.get(n.id)?.size ?? 0,
    }));
    const relationships = edges.map((e) => ({
      source: e.source_node_id,
      target: e.target_node_id,
      type: e.relationship_type,
      confidence: e.confidence,
      evidence: e.evidence ?? null,
      provenance: e.provenance ?? null,
    }));
    const papersOut = papers.map((p) => ({
      id: p.paper_id,
      title: p.title ?? null,
      authors: paperAuthors(p) || null,
      year: p.year ?? null,
      url: paperUrl(p) || null,
    }));

    const out = {
      metadata: {
        exported_at: exportedAt,
        corpus_size: papers.length,
        entity_count: nodes.length,
        edge_count: edges.length,
      },
      entities,
      relationships,
      papers: papersOut,
    };
    return JSON.stringify(out, null, 2);
  }
}
