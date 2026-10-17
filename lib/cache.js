const entries = new Map();
export async function cached(key, ttlMs, producer) {
  const existing = entries.get(key);
  if (existing && existing.expiresAt > Date.now()) return await existing.promise;
  const promise = Promise.resolve().then(producer);
  entries.set(key, { expiresAt: Date.now() + ttlMs, promise });
  try {
    const result = await promise;
    if (entries.size > 200) entries.clear();
    return result;
  } catch (error) {
    if (entries.get(key)?.promise === promise) entries.delete(key);
    throw error;
  }
}
