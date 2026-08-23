import { uniqueSorted, type JsonObject } from "@benode/core";

import { annotationStringValues } from "../parser/annotation-values.js";
import { annotationQualifiedName } from "./annotations.js";
import { FEIGN_CLIENT } from "./constants.js";
import { requestMappingMetadata } from "./request-mappings.js";
import { ownerType } from "./symbol-lookup.js";
import type { SymbolContext, SymbolIndex } from "./types.js";

function appendPath(url: string, path: string): string {
  if (path === "" || path === "/") {
    return url;
  }
  const base = url.replace(/\/$/u, "");
  const suffix = path.startsWith("/") ? path : "/" + path;
  return base + suffix;
}

function clientUrls(
  client: SymbolContext,
): readonly string[] {
  const annotation = client.symbol.annotations.find(
    (candidate) =>
      annotationQualifiedName(candidate, client) === FEIGN_CLIENT,
  );
  if (annotation === undefined) {
    return [];
  }

  const urls = annotationStringValues(annotation, "url");
  const paths = annotationStringValues(annotation, "path");
  return uniqueSorted(
    paths.length === 0
      ? urls
      : urls.flatMap((url) => paths.map((path) => appendPath(url, path))),
  );
}

export function feignMetadata(
  context: SymbolContext,
  index: SymbolIndex,
): JsonObject {
  const client = context.symbol.kind === "type"
    ? context
    : ownerType(context, index.symbolsById);
  if (client === null) {
    return {};
  }

  const urls = clientUrls(client);
  const urlMetadata: JsonObject = urls.length === 0
    ? {}
    : { httpClientUrls: urls };
  if (context.symbol.kind !== "method") {
    return urlMetadata;
  }

  const mapping = requestMappingMetadata(context);
  return {
    ...urlMetadata,
    ...(mapping.httpMethods.length === 0
      ? {}
      : { httpClientHttpMethods: mapping.httpMethods }),
    ...(mapping.paths.length === 0
      ? {}
      : { httpClientPaths: mapping.paths }),
  };
}
