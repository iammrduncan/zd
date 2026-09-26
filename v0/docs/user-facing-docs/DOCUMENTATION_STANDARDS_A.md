# User documentation standards

These standards apply to documentation for people who use `zd`. A reader should not need to know
how the repository plans, builds, or reviews work before they can use the product.

## Start with the reader's goal

Before writing, answer three questions:

1. Who is reading this page?
2. What do they want to understand or finish?
3. What is the shortest path to a useful result?

The opening must define the subject and explain why a reader would use it. Put the smallest working
command or action near the top. Introduce constraints and failure recovery where the reader needs
them.

## Choose one primary page type

ZenSuite uses the four documentation needs described by Diátaxis:

| Page type | Reader need | Shape |
| --- | --- | --- |
| Tutorial | Learn through a guided experience | Safe, complete steps with a visible result |
| How-to guide | Finish a real task | Direct, adaptable actions without unrelated explanation |
| Reference | Look up facts while working | Predictable syntax, defaults, limits, results, and failures |
| Explanation | Understand how or why the system works | Context, relationships, tradeoffs, and alternatives |

Choose the primary type before writing. Split a page when it starts serving a second major task.

## Write for a product user

- Address the reader as “you” when describing their actions.
- Use direct, active sentences and present tense.
- Prefer familiar words without making the result less exact.
- Define a necessary technical term when it first appears.
- Keep one main idea in each paragraph.
- Use the same term for the same concept.
- Use sentence-style capitalization for headings.
- State limitations plainly.
- Remove filler such as “simply,” “obviously,” and “it is important to note.”

Do not organize a page around source modules, implementation order, objectives, milestones, or
verification runs.

## Make examples accurate

- Show the common path before an advanced path.
- Include the setup needed to understand an example.
- Use generic paths and document names.
- Show useful command output when it helps the reader recognize success.
- Keep command names, paths, file types, and error behavior synchronized with source and tests.
- Label incomplete sketches. Do not present pseudocode as copyable code.

## Keep the hierarchy shallow

The documentation home is `docs/user-facing-docs/README.md`. Its folders represent durable reader
needs, not releases or implementation phases. Give each topic one canonical page.

Public pages must stand alone. They must not link to `_internal`, ADRs, or ZSIPs.
Contributor-only material can link to public pages, but public tasks must not depend on contributor
records.

## Review every page

Before committing a user-facing documentation change, check that:

- The opening defines the subject and its use.
- The first action demonstrates the common path.
- The page has one primary reader goal and page type.
- Public names, outputs, limits, and failures match the product.
- Planning and implementation history do not appear.
- Local links resolve and code fences close.
- The documentation contract and affected product tests pass.
