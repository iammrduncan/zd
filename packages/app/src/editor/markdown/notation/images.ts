import { syntaxTree } from "@codemirror/language";
import { StateField, type EditorState, type Extension } from "@codemirror/state";
import {
  Decoration,
  EditorView,
  ViewPlugin,
  WidgetType,
  type DecorationSet,
} from "@codemirror/view";

import { renderInlineMarkdown } from "../inline";
import { isRaw, rawModeChanged } from "../raw";

export interface ResolvedMarkdownImage {
  readonly url: string;
  release(): void;
}

export type MarkdownImageResolver = (source: string) => Promise<ResolvedMarkdownImage | null>;

interface CachedMarkdownImage {
  active: boolean;
  load: Promise<ResolvedMarkdownImage | null>;
  resolved: ResolvedMarkdownImage | null;
}

/** Blob ownership lives with the editor, not with recyclable widget objects. */
class MarkdownImageCache {
  private activeSources = new Set<string>();
  private destroyed = false;
  private entries = new Map<string, CachedMarkdownImage>();

  constructor(private readonly resolveImage: MarkdownImageResolver | undefined) {}

  canResolve(): boolean {
    return this.resolveImage !== undefined;
  }

  retain(sources: ReadonlySet<string>): void {
    this.activeSources = new Set(sources);
    for (const [source, entry] of this.entries) {
      if (sources.has(source)) continue;
      entry.active = false;
      entry.resolved?.release();
      this.entries.delete(source);
    }
  }

  resolve(markup: string, source: string): Promise<ResolvedMarkdownImage | null> {
    if (this.destroyed || !this.resolveImage || !this.activeSources.has(markup)) {
      return Promise.resolve(null);
    }
    const current = this.entries.get(markup);
    if (current) return current.load;

    const entry: CachedMarkdownImage = {
      active: true,
      load: Promise.resolve(null),
      resolved: null,
    };
    entry.load = this.resolveImage(source).then(
      (resolved) => {
        if (!resolved) return null;
        if (this.destroyed || !entry.active) {
          resolved.release();
          return null;
        }
        entry.resolved = resolved;
        return resolved;
      },
      () => null,
    );
    this.entries.set(markup, entry);
    return entry.load;
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    for (const entry of this.entries.values()) {
      entry.active = false;
      entry.resolved?.release();
    }
    this.entries.clear();
    this.activeSources.clear();
  }
}

/**
 * An image, drawn instead of written.
 *
 * The shared inline renderer sanitizes the source before any node becomes live,
 * so a Markdown document cannot issue a remote request while it is being read.
 */
class ImageWidget extends WidgetType {
  constructor(
    private readonly source: string,
    private readonly images: MarkdownImageCache,
  ) {
    super();
  }

  eq(other: ImageWidget): boolean {
    return other.source === this.source && other.images === this.images;
  }

  toDOM(): HTMLElement {
    const host = document.createElement("span");
    host.className = "md-image";
    const fragment = renderInlineMarkdown(this.source);
    const image = fragment.querySelector<HTMLImageElement>("img");
    const source = image?.getAttribute("src") ?? "";
    if (!image || !this.images.canResolve() || /^(?:data|blob):/i.test(source)) {
      host.append(fragment);
      return host;
    }

    const placeholder = document.createElement("span");
    placeholder.className = "md-image-unavailable";
    placeholder.textContent = image.getAttribute("alt")?.trim() || "image";
    placeholder.dataset.imageStatus = "loading";
    host.append(placeholder);
    void this.images.resolve(this.source, source).then(
      (resolved) => {
        if (!resolved) {
          placeholder.dataset.imageStatus = "unavailable";
          return;
        }
        image.src = resolved.url;
        placeholder.replaceWith(image);
      },
      () => {
        placeholder.dataset.imageStatus = "unavailable";
      },
    );
    return host;
  }

  /** Not editable content. The source is reachable through raw mode. */
  ignoreEvent(): boolean {
    return true;
  }
}

/** Stable whole-document image replacements, independent of viewport motion. */
function imageDecorations(state: EditorState, images: MarkdownImageCache): DecorationSet {
  if (isRaw(state)) {
    images.retain(new Set());
    return Decoration.none;
  }
  const ranges: ReturnType<Decoration["range"]>[] = [];
  const sources = new Set<string>();
  syntaxTree(state).iterate({
    enter: (node) => {
      if (node.name !== "Image") return;
      const source = state.doc.sliceString(node.from, node.to);
      sources.add(source);
      ranges.push(
        Decoration.replace({ widget: new ImageWidget(source, images) }).range(node.from, node.to),
      );
    },
  });
  images.retain(sources);
  return Decoration.set(ranges, true);
}

export function renderedImages(resolveImage?: MarkdownImageResolver): Extension {
  const images = new MarkdownImageCache(resolveImage);
  const field = StateField.define<DecorationSet>({
    create: (state) => imageDecorations(state, images),
    update: (value, transaction) => {
      if (
        !transaction.docChanged &&
        !rawModeChanged(transaction.startState, transaction.state) &&
        syntaxTree(transaction.startState) === syntaxTree(transaction.state)
      ) {
        return value.map(transaction.changes);
      }
      return imageDecorations(transaction.state, images);
    },
    provide: (imageField) => [
      EditorView.decorations.from(imageField),
      EditorView.atomicRanges.of((view) => view.state.field(imageField, false) ?? Decoration.none),
    ],
  });
  const cleanup = ViewPlugin.fromClass(
    class {
      destroy(): void {
        images.destroy();
      }
    },
  );
  return [field, cleanup];
}
