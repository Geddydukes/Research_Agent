/**
 * Deterministic shared phrase detection for entity matching.
 * Used to determine if two entities share defining phrases or evidence.
 */

const STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by',
  'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did',
  'will', 'would', 'should', 'could', 'may', 'might', 'must', 'can', 'this', 'that', 'these', 'those',
]);

/**
 * Normalize text: lowercase, tokenize, remove stopwords
 */
function normalizeTokens(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(token => token.length > 0 && !STOPWORDS.has(token));
}

/**
 * Extract n-grams from tokenized text
 */
function extractNgrams(tokens: string[], n: number): string[] {
  const ngrams: string[] = [];
  for (let i = 0; i <= tokens.length - n; i++) {
    ngrams.push(tokens.slice(i, i + n).join(' '));
  }
  return ngrams;
}

/**
 * Check if two definitions share key phrases using n-gram overlap.
 * Returns true if they share at least one 3-gram or longer sequence.
 */
export function hasSharedPhrase(
  definition1: string | undefined,
  definition2: string | undefined
): boolean {
  if (!definition1 || !definition2) return false;

  const tokens1 = normalizeTokens(definition1);
  const tokens2 = normalizeTokens(definition2);

  // Check for shared 3-grams (minimum for meaningful phrase matching)
  const ngrams1 = extractNgrams(tokens1, 3);
  const ngrams2 = extractNgrams(tokens2, 3);

  // Require at least one shared 3-gram
  return ngrams1.some(ngram => ngrams2.includes(ngram));
}

/**
 * Extract quoted strings from text (definitions often appear in quotes)
 */
function extractQuotedStrings(text: string): string[] {
  const matches = text.match(/"([^"]+)"/g) || text.match(/'([^']+)'/g) || [];
  return matches.map(m => m.slice(1, -1).toLowerCase().trim()).filter(s => s.length > 0);
}

/**
 * Check for exact match on quoted definition snippets.
 * Alternative to n-gram matching for more precise evidence matching.
 */
export function hasExactDefinitionMatch(
  evidence1: string | undefined,
  evidence2: string | undefined
): boolean {
  if (!evidence1 || !evidence2) return false;

  const quotes1 = extractQuotedStrings(evidence1);
  const quotes2 = extractQuotedStrings(evidence2);

  if (quotes1.length === 0 || quotes2.length === 0) return false;

  // Check if any quoted string appears in both
  return quotes1.some(q => quotes2.includes(q));
}

/**
 * Check if entities share aliases (e.g., both have "3DGS" as an alias)
 */
export async function hasSharedAlias(
  nodeId1: number,
  nodeId2: number,
  db: { getEntityAliases: (nodeId: number) => Promise<Array<{ alias_name: string }>> }
): Promise<boolean> {
  const [aliases1, aliases2] = await Promise.all([
    db.getEntityAliases(nodeId1),
    db.getEntityAliases(nodeId2),
  ]);

  const aliasSet1 = new Set(aliases1.map(a => a.alias_name.toLowerCase()));
  const aliasSet2 = new Set(aliases2.map(a => a.alias_name.toLowerCase()));

  // Check for any shared alias
  for (const alias of aliasSet1) {
    if (aliasSet2.has(alias)) {
      return true;
    }
  }

  return false;
}
