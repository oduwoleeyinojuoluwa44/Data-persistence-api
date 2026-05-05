import NodeCache from 'node-cache';

export type CanonicalQuery = Record<string, string | number | undefined>;

const profileQueryCache = new NodeCache({
  stdTTL: Number(process.env.PROFILE_QUERY_CACHE_TTL_SECONDS || 60),
  checkperiod: 30,
  useClones: false,
});

export function canonicalizeQuery(query: CanonicalQuery): CanonicalQuery {
  const canonical: CanonicalQuery = {};
  Object.keys(query)
    .sort()
    .forEach((key) => {
      const value = query[key];
      if (value !== undefined && value !== '') {
        canonical[key] = value;
      }
    });
  return canonical;
}

export function profileCacheKey(scope: string, query: CanonicalQuery): string {
  return `${scope}:${JSON.stringify(canonicalizeQuery(query))}`;
}

export function getCachedProfileQuery<T>(key: string): T | undefined {
  return profileQueryCache.get<T>(key);
}

export function setCachedProfileQuery<T>(key: string, value: T): void {
  profileQueryCache.set(key, value);
}

export function invalidateProfileQueryCache(): void {
  profileQueryCache.flushAll();
}
