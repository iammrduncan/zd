# 0004: Treat rendered Markdown as untrusted

## Status

Accepted

## Context

`zd md` opens documents created by people and coding agents. A document can contain raw HTML,
links, images, and text that resembles a URL.

Rendering document content in a webview creates script, network, file, and external-application
boundaries. A document must not gain those capabilities because a reader opened it.

## Decision

We will treat all Markdown source as untrusted input.

Markdown-it will disable raw HTML and validate link protocols. Inline fragments will use the same
safe renderer as the main surface.

The renderer will replace remote images inside an inert template before nodes enter the live
document. The app will not fetch remote image URLs.

The native external-link command will allow only HTTP and HTTPS. Relative document navigation will
stay inside the file scope.

The webview Content Security Policy will deny network and script capabilities by default. It will
act as a backstop, not the only input control.

## Consequences

- Opening a Markdown file does not execute its HTML or script.
- A remote image cannot announce that the document was opened.
- Local and data images can render within the Content Security Policy.
- Unsupported HTML appears as source text instead of rendered content.
- Every new renderer or link path must reuse these trust-boundary rules.
