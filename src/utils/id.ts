export function uid(prefix = 'id'): string {
  return `${prefix}_${crypto.randomUUID().slice(0, 8)}`;
}

export function slugify(input: string): string {
  const s = input
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-zA-Z0-9\u4e00-\u9fff._-]/g, '')
    .slice(0, 64);
  return s || 'item';
}
