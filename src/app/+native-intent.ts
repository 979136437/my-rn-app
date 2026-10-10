const DEMO_SCHEME = "myapp:";
const DEMO_HOST = "refresh-demo";

// Custom-scheme hosts are not route paths; keep the documented short link usable.
export function redirectSystemPath({
  path,
}: {
  path: string;
  initial: boolean;
}) {
  try {
    const url = new URL(path);
    if (url.protocol === DEMO_SCHEME && url.hostname === DEMO_HOST) {
      return `/refresh-demo${url.search}${url.hash}`;
    }
  } catch {
    // Relative Expo Router paths already have their intended route semantics.
  }
  return path;
}
