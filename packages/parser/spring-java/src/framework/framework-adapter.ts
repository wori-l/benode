import {
  type FrameworkAdapter,
  type FrameworkBuildRequest,
  type FrameworkIndex,
} from "@benode/core";

import { buildGraph } from "./graph-builder.js";
import { SPRING_JAVA_NODE_FILTERS } from "./node-filters.js";
import { buildEndpoints } from "./request-mappings.js";
import { createSymbolIndex } from "./symbol-index.js";

export class SpringBootFrameworkAdapter implements FrameworkAdapter {
  readonly #excludedPackages: readonly string[];

  constructor(excludedPackages: readonly string[] = []) {
    this.#excludedPackages = excludedPackages;
  }

  async buildIndex(
    request: FrameworkBuildRequest,
  ): Promise<FrameworkIndex> {
    const symbolIndex = createSymbolIndex(request);
    const endpointIndex = buildEndpoints(symbolIndex);
    const graph = buildGraph(
      symbolIndex,
      endpointIndex.handlerRoutes,
      this.#excludedPackages,
    );

    return {
      applications: request.applications,
      endpoints: endpointIndex.endpoints,
      nodeFilters: SPRING_JAVA_NODE_FILTERS,
      nodes: graph.nodes,
      edges: graph.edges,
      diagnostics: symbolIndex.fileFacts.flatMap(
        (facts) => facts.diagnostics,
      ),
    };
  }
}
