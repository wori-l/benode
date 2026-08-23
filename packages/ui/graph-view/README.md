# Webview

The Vue 3 webview renders a validated endpoint graph with Vue Flow after ELK.js computes a deterministic left-to-right layered layout for groups, method children, and semantic edge routes.

Implemented interaction:

- methods are grouped by their immediate owning type and remain visible inside their group, so nested types are rendered as separate class cards;
- ELK routes every visible edge orthogonally, including edges between methods in the same group;
- class cards show role and namespace, plus endpoint base paths, HTTP client URLs, or entity tables when applicable;
- method cards show endpoint path, inputs, output, and source location;
- parser-provided filters independently control the node categories the active technology can distinguish;
- selecting a class or method highlights its complete upstream and downstream path;
- visible methods and classes can be searched case-insensitively; `Ctrl/Cmd+F` focuses the search, while `Enter` and `Shift+Enter` cycle results at a fixed 100% zoom;
- `Escape` clears focus;
- `Ctrl/Cmd+click` or `Ctrl/Cmd+Enter` sends a source-navigation intent;
- compatible payload updates retain focus IDs that still exist.

The canvas supports Vue Flow zoom/pan. Node dragging and group collapsing are intentionally disabled so the routes returned by ELK remain authoritative.

## Development

```bash
npm run debug:webview --workspace @benode/graph-view
npm run build --workspace @benode/graph-view
npm run test --workspace @benode/graph-view
npm run lint --workspace @benode/graph-view
```

The standalone Vite server uses `src/debug/sample-graph.ts`; VS Code waits for a validated `showEndpointGraph` payload. Production assets are emitted with stable names into `packages/ide-extensions/vs-code/dist/webview-assets` and loaded only through the panel CSP.

