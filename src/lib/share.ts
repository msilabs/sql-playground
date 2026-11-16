/** query শেয়ারের লিংক: URL-এর # অংশে query আর dataset (সার্ভারে কিছু যায় না) */
import { isDatasetId, type DatasetId } from "./db/datasets";

const toBase64Url = (text: string) => {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  bytes.forEach((b) => (binary += String.fromCharCode(b)));
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

const fromBase64Url = (data: string) => {
  const binary = atob(data.replace(/-/g, "+").replace(/_/g, "/"));
  return new TextDecoder().decode(Uint8Array.from(binary, (c) => c.charCodeAt(0)));
};

export function encodeShare(query: string, dataset: DatasetId): string {
  return `#d=${dataset}&q=${toBase64Url(query)}`;
}

export function decodeShare(hash: string): { query: string; dataset: DatasetId } | null {
  const params = new URLSearchParams(hash.replace(/^#/, ""));
  const q = params.get("q");
  const d = params.get("d");
  if (!q || !isDatasetId(d)) return null;
  try {
    const query = fromBase64Url(q);
    return query.length > 0 && query.length < 20_000 ? { query, dataset: d } : null;
  } catch {
    return null;
  }
}
