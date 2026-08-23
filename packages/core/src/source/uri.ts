import { normalizeRelativeUri } from "./stable-id.js";

function directoryUrl(uri: string): URL {
  const url = new URL(uri);
  url.hash = "";
  url.search = "";
  if (!url.pathname.endsWith("/")) {
    url.pathname += "/";
  }
  return url;
}

export function directoryUri(uri: string): string {
  const url = directoryUrl(uri);
  if (url.pathname !== "/") {
    url.pathname = url.pathname.replace(/\/$/u, "");
  }
  return url.toString();
}

export function resolveDirectoryUri(
  baseUri: string,
  value: string,
): string {
  return directoryUri(
    new URL(value, directoryUrl(baseUri)).toString(),
  );
}

export function relativeUriWithin(
  rootUri: string,
  childUri: string,
): string | null {
  const root = directoryUrl(rootUri);
  const child = new URL(childUri);
  child.hash = "";
  child.search = "";
  if (
    root.protocol !== child.protocol ||
    root.host !== child.host ||
    !child.pathname.startsWith(root.pathname)
  ) {
    return null;
  }
  return normalizeRelativeUri(
    decodeURIComponent(child.pathname.slice(root.pathname.length)),
  );
}
