const canonicalizeCache = new Map<string, string>();

export function canonicalize(input: string): string {
  if (!input) return '';
  
  const cached = canonicalizeCache.get(input);
  if (cached !== undefined) {
    return cached;
  }
  
  let normalized = input.trim();
  
  normalized = normalized.replace(/\s+/g, ' ');
  
  const parentheticalMatch = normalized.match(/^(.+?)\s*\(([^)]+)\)\s*$/);
  if (parentheticalMatch) {
    const alias = parentheticalMatch[2]!.trim();
    const name = parentheticalMatch[1]!.trim();
    normalized = alias || name;
  }
  
  normalized = normalized.toLowerCase();
  
  normalized = normalized.replace(/[^\w\s-]/g, '');
  
  normalized = normalized.replace(/\s+/g, '_');
  normalized = normalized.replace(/-+/g, '_');
  normalized = normalized.replace(/_+/g, '_');
  
  const result = normalized.trim() || input.toLowerCase().trim();
  canonicalizeCache.set(input, result);
  return result;
}

export function extractAliases(input: string): string[] {
  if (!input) return [];
  
  const aliases: string[] = [];
  const trimmed = input.trim();
  
  const parentheticalMatch = trimmed.match(/^(.+?)\s*\(([^)]+)\)\s*$/);
  if (parentheticalMatch) {
    const name = parentheticalMatch[1]!.trim();
    const alias = parentheticalMatch[2]!.trim();
    aliases.push(name, alias);
  } else {
    aliases.push(trimmed);
  }
  
  return aliases.filter(Boolean).slice(0, 10);
}
