import type { Platform, WorkspaceFile } from "@/platform";
import type { CommentTag, ReviewSelection } from "./annotations";

export type { ReviewSelection } from "./annotations";

const OUTPUT_NAME = "zd-feedback.txt";
const STORAGE_PREFIX = "zd.review.v1:";

export interface ReviewComment {
  id: string;
  path: string;
  relative: string;
  startLine: number;
  endLine: number;
  selected: string;
  comment: string;
}

export interface ReviewDocument {
  connect(render: (tags: CommentTag[]) => void): () => void;
  openFeedback(commentId?: string): void;
  selection(selection: ReviewSelection | null): void;
}

export interface Review {
  document(file: WorkspaceFile): ReviewDocument;
  open(): void;
  unmount(): void;
}

export interface ReviewOptions {
  host: HTMLElement;
  launcherHost?: HTMLElement;
  root: string;
  platform: Platform;
}

function oneLine(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

/** The exact, one-comment-per-line handoff format requested for agent feedback. */
export function formatFeedback(comments: readonly ReviewComment[]): string {
  return comments
    .map((comment) => {
      const path = comment.relative.replaceAll("\\", "/");
      return `[${path}][LN${comment.startLine}:LN${comment.endLine}] [${oneLine(comment.selected)}] ${oneLine(comment.comment)}`;
    })
    .join("\n");
}

function outputPath(root: string): string {
  if (!root) return OUTPUT_NAME;
  if (/[\\/]$/.test(root)) return `${root}${OUTPUT_NAME}`;
  const separator = root.includes("\\") && !root.includes("/") ? "\\" : "/";
  return `${root}${separator}${OUTPUT_NAME}`;
}

function isComment(value: unknown): value is ReviewComment {
  if (!value || typeof value !== "object") return false;
  const comment = value as Partial<ReviewComment>;
  return (
    typeof comment.id === "string" &&
    typeof comment.path === "string" &&
    typeof comment.relative === "string" &&
    typeof comment.startLine === "number" &&
    typeof comment.endLine === "number" &&
    typeof comment.selected === "string" &&
    typeof comment.comment === "string"
  );
}

function read(root: string): ReviewComment[] {
  try {
    const stored = localStorage.getItem(`${STORAGE_PREFIX}${root}`);
    if (!stored) return [];
    const parsed: unknown = JSON.parse(stored);
    return Array.isArray(parsed) ? parsed.filter(isComment) : [];
  } catch {
    return [];
  }
}

function remember(root: string, comments: readonly ReviewComment[]): void {
  try {
    localStorage.setItem(`${STORAGE_PREFIX}${root}`, JSON.stringify(comments));
  } catch {
    // The in-memory list remains the truth for this window when storage refuses.
  }
}

function identifier(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
}

function focusDeleteButton(host: ParentNode, commentId?: string): boolean {
  if (!commentId) return false;
  const button = [...host.querySelectorAll<HTMLButtonElement>("[data-comment-id]")].find(
    (candidate) => candidate.dataset.commentId === commentId,
  );
  button?.focus();
  return Boolean(button);
}

/**
 * Own one workspace's review ledger, selection composer, feedback view, and file.
 *
 * Markdown files remain untouched. The ledger persists in the webview and every
 * accepted comment regenerates one plain-text handoff beside the reviewed files.
 */
export function mountReview({ host, launcherHost, root, platform }: ReviewOptions): Review {
  let comments = read(root);
  let pending: { file: WorkspaceFile; selection: ReviewSelection } | null = null;
  let feedbackView: HTMLElement | null = null;
  let writes: Promise<void> = Promise.resolve();
  const listeners = new Map<string, Set<(tags: CommentTag[]) => void>>();

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

  const launcher = document.createElement("button");
  launcher.className = "md-feedback-launcher";
  launcher.type = "button";
  launcher.setAttribute("aria-label", "View feedback");
  launcher.addEventListener("click", () => open());
  launcherHost?.append(launcher);

  const tagsFor = (path: string): CommentTag[] =>
    comments
      .filter((comment) => comment.path === path)
      .map((comment) => ({ id: comment.id, line: comment.startLine, text: comment.comment }));

  const updateLauncher = () => {
    launcher.textContent = `Feedback ${comments.length}`;
  };

  const notify = (path: string) => {
    const tags = tagsFor(path);
    for (const render of listeners.get(path) ?? []) render(tags);
  };

  const writeFile = (): Promise<boolean> => {
    const output = formatFeedback(comments);
    const attempt = writes.then(async () => {
      try {
        await platform.writeTextFile(outputPath(root), output ? `${output}\n` : "");
        return true;
      } catch {
        return false;
      }
    });
    writes = attempt.then(() => {});
    return attempt;
  };

  function close(): void {
    feedbackView?.remove();
    feedbackView = null;
  }

  function open(commentId?: string): void {
    if (feedbackView) {
      focusDeleteButton(feedbackView, commentId);
      return;
    }
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

    const file = document.createElement("span");
    file.className = "md-feedback-file";
    file.textContent = OUTPUT_NAME;

    const output = document.createElement("pre");
    output.className = "md-feedback-output";
    output.textContent = formatFeedback(comments);

    const commentList = document.createElement("ul");
    commentList.className = "md-feedback-comments";
    commentList.setAttribute("aria-label", "Review comments");

    const status = document.createElement("span");
    status.className = "md-feedback-status";
    status.setAttribute("aria-live", "polite");

    const actions = document.createElement("div");
    actions.className = "md-feedback-actions";

    for (const comment of comments) {
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
        comments = comments.filter((candidate) => candidate.id !== comment.id);
        remember(root, comments);
        notify(comment.path);
        updateLauncher();
        output.textContent = formatFeedback(comments);
        item.remove();
        void writeFile().then((saved) => {
          status.textContent = saved
            ? "Deleted comment"
            : `Deleted comment but could not save ${OUTPUT_NAME}`;
        });
      });

      item.append(text, remove);
      commentList.append(item);
    }

    const save = document.createElement("button");
    save.type = "button";
    save.textContent = "Save feedback file";
    save.addEventListener("click", () => {
      void writeFile().then((saved) => {
        status.textContent = saved ? `Saved ${OUTPUT_NAME}` : `Could not save ${OUTPUT_NAME}`;
      });
    });

    const dismiss = document.createElement("button");
    dismiss.type = "button";
    dismiss.textContent = "Close";
    dismiss.addEventListener("click", close);

    actions.append(save, dismiss, status);
    column.append(title, file, commentList, output, actions);
    plane.append(column);
    host.append(plane);
    feedbackView = plane;
    if (!focusDeleteButton(commentList, commentId)) dismiss.focus();
  }

  const escape = (event: KeyboardEvent) => {
    if (event.key !== "Escape" || !feedbackView) return;
    event.preventDefault();
    event.stopPropagation();
    close();
  };
  window.addEventListener("keydown", escape, true);

  composer.addEventListener("submit", (event) => {
    event.preventDefault();
    const active = pending;
    const text = oneLine(textbox.value);
    if (!active || !text) return;

    comments = [
      ...comments,
      {
        id: identifier(),
        path: active.file.path,
        relative: active.file.relative,
        startLine: active.selection.startLine,
        endLine: active.selection.endLine,
        selected: active.selection.text,
        comment: text,
      },
    ];
    remember(root, comments);
    notify(active.file.path);
    updateLauncher();
    textbox.value = "";
    pending = null;
    composer.hidden = true;
    void writeFile();
  });

  updateLauncher();

  return {
    document: (file) => ({
      connect: (render) => {
        let forFile = listeners.get(file.path);
        if (!forFile) {
          forFile = new Set();
          listeners.set(file.path, forFile);
        }
        forFile.add(render);
        render(tagsFor(file.path));
        return () => {
          forFile?.delete(render);
          if (pending?.file.path === file.path) {
            pending = null;
            composer.hidden = true;
          }
        };
      },
      openFeedback: open,
      selection: (selection) => {
        if (!selection || !oneLine(selection.text)) {
          if (pending?.file.path === file.path) pending = null;
          composer.hidden = true;
          return;
        }
        pending = { file, selection };
        composer.style.setProperty("--md-comment-left", `${selection.rect.left}px`);
        composer.style.setProperty("--md-comment-top", `${selection.rect.bottom}px`);
        composer.hidden = false;
      },
    }),
    open,
    unmount: () => {
      window.removeEventListener("keydown", escape, true);
      close();
      composer.remove();
      launcher.remove();
      listeners.clear();
    },
  };
}
