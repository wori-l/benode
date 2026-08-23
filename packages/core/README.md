# Analysis Core

`@benode/core` contains the framework-neutral contracts and graph algorithms shared by Benode.

Its public entry point exports:

- application, endpoint, graph, source-location, diagnostic, file-fact, and adapter contracts;
- the profile-driven `WorkspaceAnalyzer`, read-only filesystem boundary, content hashing, and incremental file-fact reuse;
- `WorkspaceDiscoverer`, `LanguageAdapter`, and `FrameworkAdapter`;
- transparent technology-aware stable application and symbol ID helpers;
- `getEndpointGraph` with node and confidence filters plus cycle handling;
- endpoint-graph validation with stable issue codes;
- the validated host/webview protocol.

Public data is readonly and JSON-safe. Traversal always retains the endpoint root, applies filters while exploring so excluded nodes cannot bridge branches, and then restores every edge internal to the reached node set, including cycle-closing edges.

The package imports no Node, VS Code, Vue, or Spring-specific API.

## Isolated debugging

```bash
npm run build --workspace @benode/core
npm run test --workspace @benode/core
npm run lint --workspace @benode/core
```
