# Images and links demo

## Project-relative image

The image below resolves relative to this document through the active project.

![The zd Markdown reader](../user-facing-docs/assets/zd-workbench.png)

## Blocked remote image

The remote image below should remain a quiet text placeholder and make no network request.

![A remote diagram that must not load](https://example.com/diagram.png)

## Links

- [A project-relative document](../DESIGN.md)
- [An external website](https://example.com)
- <https://example.com/autolink>
- An inline link with emphasis in its label: [**Markdown design**](../DESIGN.md#markdown)

Unsafe link syntax stays inert: [do not activate](javascript:alert%281%29).
