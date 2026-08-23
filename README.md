# Benode

Benode is a VS Code extension for exploring static call graphs in microservices projects.
The goal is to help understand how an entry point propagates through an unfamiliar codebase, by transforming supported source code patterns into an interactive static call graph within Visual Studio Code.

![Benode endpoint call graph](https://raw.githubusercontent.com/wori-l/benode/main/packages/ide-extensions/vs-code/resources/example.png)

The current release supports Java Spring Boot projects. Benode is local and read-only: it analyzes source text without running a JDK, compiler, build tool, application, or network request.

## Workspace layout

- `packages/core` — framework-neutral contracts, incremental workspace engine, and graph algorithms.
- `packages/parser/spring-java` — Java parsing, Maven/Gradle discovery, and Spring semantics.
- `packages/ide-extensions/vs-code` — VS Code lifecycle, analysis orchestration, catalog, and packaging.
- `packages/ui/graph-view` — Vue Flow/ELK endpoint graph renderer.

## How it works

1. **Discover applications.** The extension reads the open workspace through a read-only filesystem boundary. The Spring/Java adapter inspects Maven and Gradle descriptors, locates source roots, and identifies each Spring Boot application entry point without running a build tool or a JDK.

2. **Plan the analysis.** Core enumerates Java files under the discovered source roots, reads their contents, and computes SHA-256 content hashes. Compatible facts from the disposable workspace cache are reused; only new or changed files continue to parsing.

3. **Extract language facts.** Each Java file is parsed with Tree-sitter/Wasm. It converts the syntax tree into immutable, JSON-safe `FileFacts`: packages, imports, types, methods, fields, annotations, invocations, source locations, and diagnostics. The syntax tree is then discarded.

4. **Apply framework semantics.** The Spring adapter combines all file facts into a symbol index, discovers HTTP mappings, classifies controllers, services, repositories, entities, and OpenFeign clients, and resolves invocation targets where static evidence permits it.

5. **Build the workspace graph.** The resolved symbols become a technology-neutral `FrameworkIndex` containing applications, endpoints, node filters, graph nodes, edges, confidence levels, evidence, and diagnostics. Only a complete successful analysis replaces the published index, catalog, diagnostics, and disposable cache.

6. **Select one endpoint graph.** When an endpoint is opened, core's pure `getEndpointGraph` query starts from its handler and follows every reachable call allowed by the active query filters. It terminates cycles, retains internal cycle-closing edges, and validates the resulting `EndpointGraph`.

7. **Send and render it.** The extension wraps the endpoint and graph in a `showEndpointGraph` message and posts it after the webview reports that it is ready. The webview validates the payload, applies its visible-node filters, groups methods by owning type, asks ELK for a deterministic layered layout, and renders the result with Vue Flow.

## Development

Install Node.js 22 or newer and npm, then clone the repository and install its workspace dependencies.

```bash
git clone https://github.com/wori-l/benode.git
cd benode
npm install
npm run build
npm run test
npm run lint
npm run benchmark:analysis
npm run benchmark:acceptance
```

Analysis and tests read source files directly. They never execute Maven, Gradle, a JDK, Spring, or the network. `benchmark:analysis` is the quick 250-file signal; `benchmark:acceptance` runs three fresh 5,000-file cold processes, 100 realistic updates, and the 250-node layout gate. Build output, debug output, caches, VSIX files, and coverage remain ignored.

#### Create the installable package with:

```bash
npm run package:vsix
```

This writes `benode-<version>.vsix` at the repository root with minified host and webview bundles, parser Wasm/query assets, licenses, and extension resources.

#### Package-local debugging:

```bash
npm run debug:service --workspace @benode/spring-java -- $PWD/fixtures/springboot-srv
npm run debug:webview --workspace @benode/graph-view
```

## Contributing and license

Report bugs and feature requests through [GitHub Issues](https://github.com/wori-l/benode/issues).

Benode is available under the [MIT License](LICENSE). Bundled third-party components retain their own license terms and notices.
