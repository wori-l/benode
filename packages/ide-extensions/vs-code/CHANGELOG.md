# Changelog


## 0.1.1 - 2026-08-24

- Improved resolution of Lombok methods and fields: `@AllArgsConstructor`, `@NoArgsConstructor`, `@Builder`, and `@Slf4j` are now handled correctly.
- Fixed an issue where methods inside try-catch blocks could be incorrectly classified as unresolved.
- Fixed an issue where inherited methods and fields could lead to nodes being incorrectly handled as unresolved.
- `org.slf4j.*` is now an excluded package by default.

## 0.1.0 - 2026-08-22

Initial preview release.

- Discover Java Spring Boot applications in common Maven and Gradle mono- and multi-module workspaces.
- Browse applications, controllers, and HTTP endpoints in the Benode Activity Bar view.
- Visualize static endpoint call graphs with class grouping, parser-provided node filters, search, path focus, fit-to-view, and local source navigation.
- Resolve common Spring, JPA, and OpenFeign source patterns without running the project or its build tools.
- Refresh analysis after relevant file changes and provide explicit cached and clean reindex commands.
- Keep analysis local and read-only, with no telemetry or network access.
