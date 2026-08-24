import type { Platform, WorkspaceFile } from "@/platform";
import type { CommentTag, ReviewSelection } from "@/editor/review";
import { resourceKey, type FileResource } from "./resources";

import "./review.css";

const OUTPUT_NAME = "zd-feedback.txt";
const STORAGE_PREFIX = "zd.review.v2:";

export interface ReviewComment {
  readonly id: string;
  readonly relative: string;
  readonly startLine: number;
  readonly endLine: number;
  readonly selected: string;
  readonly comment: string;
}

export interface ReviewDocument {
  connect(render: (tags: readonly CommentTag[]) => void): () => void;
  openFeedback(commentId?: string): void;
  selection(selection: ReviewSelection | null): void;
}

export interface Review {
  document(file: WorkspaceFile): ReviewDocument;
  unmount(): void;
}

function oneLine(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

/** Format one durable, grep-friendly handoff line per review comment. */
export function formatFeedback(comments: readonly ReviewComment[]): string {
  return comments
    .map(
      (comment) =>
        `[${comment.relative.replaceAll("\\", "/")}][LN${comment.startLine}:LN${comment.endLine}] [${oneLine(comment.selected)}] ${oneLine(comment.comment)}`,
    )
    .join("\n");
}

function scopeKey(resource: FileResource): string {
  return `${resource.projectId}\0${resource.worktreeId}`;
}

function storageKey(resource: FileResource): string {
  return `${STORAGE_PREFIX}${scopeKey(resource)}`;
}

function isComment(value: unknown): value is ReviewComment {
  if (!value || typeof value !== "object") return false;
  const comment = value as Partial<ReviewComment>;
  return (
    typeof comment.id === "string" &&
    typeof comment.relative === "string" &&
    typeof comment.startLine === "number" &&
    typeof comment.endLine === "number" &&
    typeof comment.selected === "string" &&
    typeof comment.comment === "string"
  );
}

function identifier(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
}

function focusDeleteButton(host: ParentNode, commentId?: string): boolean {
  if (!commentId) return false;
  const button = [...host.querySelectorAll<HTMLButtonElement>("[data-comment-id]")].find(
    ({ dataset }) => dataset.commentId === commentId,
  );
  button?.focus();
  return Boolean(button);
}

/** Own review comments across the worktrees visited by one workbench window. */
export function mountReview(host: HTMLElement, platform: Platform): Review {
  const commentsByScope = new Map<string, ReviewComment[]>();
  const listeners = new Map<string, Set<(tags: readonly CommentTag[]) => void>>();
  const writes = new Map<string, Promise<void>>();
  let pending: { file: WorkspaceFile; selection: ReviewSelection } | null = null;
  let feedbackView: HTMLElement | null = null;
  let feedbackScope: string | null = null;

  const commentsFor = (resource: FileResource): ReviewComment[] => {
    const key = scopeKey(resource);
    const known = commentsByScope.get(key);
    if (known) return known;
    const comments = (() => {
      try {
        const stored = localStorage.getItem(storageKey(resource));
        const parsed: unknown = stored ? JSON.parse(stored) : [];
        return Array.isArray(parsed) ? parsed.filter(isComment) : [];
      } catch {
        return [];
      }
    })();
    commentsByScope.set(key, comments);
    return comments;
  };

  const remember = (resource: FileResource, comments: readonly ReviewComment[]) => {
    const key = scopeKey(resource);
    const next = [...comments];
    commentsByScope.set(key, next);
    try {
      localStorage.setItem(storageKey(resource), JSON.stringify(next));
    } catch {
      // The in-memory ledger remains usable for this window when storage refuses.
    }
  };

  const tagsFor = (file: WorkspaceFile): readonly CommentTag[] =>
    commentsFor(file.resource)
      .filter(({ relative }) => relative === file.relative)
      .map(({ id, startLine, comment }) => ({ id, line: startLine, text: comment }));

  const notify = (file: WorkspaceFile) => {
    const tags = tagsFor(file);
    for (const render of listeners.get(resourceKey(file.resource)) ?? []) render(tags);
  };

  const writeFile = (resource: FileResource): Promise<boolean> => {
    const key = scopeKey(resource);
    const output = formatFeedback(commentsFor(resource));
    const previous = writes.get(key) ?? Promise.resolve();
    const attempt = previous.then(async () => {
      try {
        await platform.writeTextFile(
          { ...resource, relativePath: OUTPUT_NAME },
          output ? `${output}\n` : "",
        );
        return true;
      } catch {
        return false;
      }
    });
    writes.set(
      key,
      attempt.then(() => undefined),
    );
    return attempt;
  };

  const composer = document.createElement("form");
  composer.className = "md-comment-composer";
  composer.hidden = true;
  composer.setAttribute("role", "dialog");
  composer.setAttribute("aria-label", "Add comment");

  const textbox = document.createElement("textarea");
  textbox.rows = 3;
  textbox.placeholder = "Comment on selected text";
  textbox.setAttribute("aria-label", "Comment");

  const add = document.createElement("button");
  add.type = "submit";
  add.textContent = "Add comment";
  composer.append(textbox, add);
  host.append(composer);

  const close = (): void => {
    feedbackView?.remove();
    feedbackView = null;
    feedbackScope = null;
  };

  const open = (file: WorkspaceFile, commentId?: string): void => {
    const key = scopeKey(file.resource);
    if (feedbackView && feedbackScope === key) {
      focusDeleteButton(feedbackView, commentId);
      return;
    }
    close();
    composer.hidden = true;

    const plane = document.createElement("section");
    plane.className = "md-feedback-view";
    plane.setAttribute("role", "dialog");
    plane.setAttribute("aria-modal", "true");
    plane.setAttribute("aria-labelledby", "md-feedback-title");

    const column = document.createElement("div");
    column.className = "md-feedback-column";
    const title = document.createElement("h2");
    title.id = "md-feedback-title";
    title.textContent = "Feedback";
    const fileName = document.createElement("span");
    fileName.className = "md-feedback-file";
    fileName.textContent = OUTPUT_NAME;
    const commentList = document.createElement("ul");
    commentList.className = "md-feedback-comments";
    commentList.setAttribute("aria-label", "Review comments");
    const output = document.createElement("pre");
    output.className = "md-feedback-output";
    const status = document.createElement("span");
    status.className = "md-feedback-status";
    status.setAttribute("aria-live", "polite");
    const actions = document.createElement("div");
    actions.className = "md-feedback-actions";

    const renderOutput = () => {
      output.textContent = formatFeedback(commentsFor(file.resource));
    };
    const renderComments = () => {
      commentList.replaceChildren();
      for (const comment of commentsFor(file.resource)) {
        const item = document.createElement("li");
        item.className = "md-feedback-comment";
        const text = document.createElement("span");
        text.className = "md-feedback-comment-text";
        text.textContent = formatFeedback([comment]);
        const remove = document.createElement("button");
        remove.type = "button";
        remove.textContent = "Delete";
        remove.dataset.commentId = comment.id;
        remove.setAttribute("aria-label", `Delete comment: ${comment.comment}`);
        remove.addEventListener("click", () => {
          remember(
            file.resource,
            commentsFor(file.resource).filter(({ id }) => id !== comment.id),
          );
          notify({
            ...file,
            relative: comment.relative,
            resource: { ...file.resource, relativePath: comment.relative },
          });
          renderComments();
          renderOutput();
          void writeFile(file.resource).then((saved) => {
            status.textContent = saved
              ? "Deleted comment"
              : `Deleted comment but could not save ${OUTPUT_NAME}`;
          });
        });
        item.append(text, remove);
        commentList.append(item);
      }
    };

    const save = document.createElement("button");
    save.type = "button";
    save.textContent = "Save feedback file";
    save.addEventListener("click", () => {
      void writeFile(file.resource).then((saved) => {
        status.textContent = saved ? `Saved ${OUTPUT_NAME}` : `Could not save ${OUTPUT_NAME}`;
      });
    });
    const dismiss = document.createElement("button");
    dismiss.type = "button";
    dismiss.textContent = "Close";
    dismiss.addEventListener("click", close);
    actions.append(save, dismiss, status);
    renderComments();
    renderOutput();
    column.append(title, fileName, commentList, output, actions);
    plane.append(column);
    host.append(plane);
    feedbackView = plane;
    feedbackScope = key;
    if (!focusDeleteButton(commentList, commentId)) dismiss.focus();
  };

  composer.addEventListener("submit", (event) => {
    event.preventDefault();
    const active = pending;
    const text = oneLine(textbox.value);
    if (!active || !text) return;
    const comments = [
      ...commentsFor(active.file.resource),
      {
        id: identifier(),
        relative: active.file.relative,
        startLine: active.selection.startLine,
        endLine: active.selection.endLine,
        selected: active.selection.text,
        comment: text,
      },
    ];
    remember(active.file.resource, comments);
    notify(active.file);
    textbox.value = "";
    pending = null;
    composer.hidden = true;
    void writeFile(active.file.resource);
  });

  const escape = (event: KeyboardEvent) => {
    if (event.key !== "Escape" || !feedbackView) return;
    event.preventDefault();
    event.stopPropagation();
    close();
  };
  window.addEventListener("keydown", escape, true);

  return {
    document: (file) => {
      const key = resourceKey(file.resource);
      return {
        connect: (render) => {
          let forFile = listeners.get(key);
          if (!forFile) {
            forFile = new Set();
            listeners.set(key, forFile);
          }
          forFile.add(render);
          render(tagsFor(file));
          return () => {
            forFile?.delete(render);
            if (pending && resourceKey(pending.file.resource) === key) {
              pending = null;
              composer.hidden = true;
            }
          };
        },
        openFeedback: (commentId) => open(file, commentId),
        selection: (selection) => {
          if (!selection || !oneLine(selection.text)) {
            if (pending && resourceKey(pending.file.resource) === key) pending = null;
            composer.hidden = true;
            return;
          }
          pending = { file, selection };
          composer.style.setProperty("--md-comment-left", `${selection.rect.left}px`);
          composer.style.setProperty("--md-comment-top", `${selection.rect.bottom}px`);
          composer.hidden = false;
        },
      };
    },
    unmount: () => {
      window.removeEventListener("keydown", escape, true);
      close();
      composer.remove();
      listeners.clear();
    },
  };
}
