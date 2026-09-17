export function withRelockSuppressed<T>(fn: () => Promise<T>): Promise<T> {
  return fn();
}
