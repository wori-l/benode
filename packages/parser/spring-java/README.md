# Spring/Java Adapter

`@benode/spring-java` implements Java indexing, Spring Boot semantics, and Maven and Gradle multi-project discovery through the contracts in `@benode/core`. Production code uses injected read-only resources and does not import Node, VS Code, or Vue APIs.

## Implemented pipeline

- `TreeSitterJavaAdapter` loads explicit runtime Wasm, Java grammar, and query resources and emits deterministic file facts.
- Parsing covers packages, imports, nested types, fields, constructors, methods, parameters, annotations, invocations, argument type hints, source locations, syntax diagnostics, and parser-owned node filters for Spring roles, low-signal methods, and standard/framework methods.
- `discoverMavenWorkspace` discovers POM-based modules and applications with deterministic roots and IDs.
- `discoverGradleWorkspace` recognizes Groovy and Kotlin DSL build/settings markers, static include declarations, and projectDir mappings.
- `SpringBootFrameworkAdapter` builds request mappings, component roles, graph metadata, and call edges.
- Resolution covers owner methods, typed field/parameter receivers, static receivers, arity, argument-based overload selection, nested invocation return types, single interface implementations, and `@Qualifier` matches.
- Repository, entity, and OpenFeign types retain their semantic roles and edge kinds, while every concrete method body follows the same call traversal and all constructor edges are omitted. Entity nodes also retain `@Table` metadata.

SpringWorkspaceAnalyzer composes Maven and Gradle discovery over the core `WorkspaceAnalyzer`, then supplies Java source/generated globs, `@SpringBootApplication` invalidation, the Java fact namespace, and the Spring framework adapter. Core owns hashing, change sets, progress and per-file reuse; the extension can still supply worker-backed `FileFactIndexer`. Discovery stays read-only and never evaluates build scripts.

Only Spring/Java profile, discovery, parser, semantic resolution, and composition code live in this package. Generic filesystem, URI, hashing, file planning, sequential indexing, state and orchestration live in `@benode/core`.

## Isolated debugging

```bash
npm run debug:service --workspace @benode/spring-java -- $PWD/fixtures/springboot-srv
npm run debug:service --workspace @benode/spring-java -- $PWD/fixtures/springboot-multiapp-srv
```

Add `--json` for the complete analysis payload.

Focused checks:

```bash
npm run build --workspace @benode/spring-java
npm run test --workspace @benode/spring-java
npm run lint --workspace @benode/spring-java
```

## Workspace analysis benchmark

```bash
npm run benchmark:analysis
npm run benchmark:acceptance
```

`benchmark:analysis` runs the quick deterministic 250-file workload. `benchmark:acceptance` starts three new processes for 5,000-file cold samples including Wasm startup, then executes 100 updates split into 80 method-body, 10 mapping, and 10 signature/type changes; it finishes with the webview's 250-node ELK layout. The workload never invokes Maven, Gradle, a JDK, Spring, or the network.
