import type { EditorBuffer, MountedEditorBuffer, MountEditorBufferOptions } from "@/editor";
import type { Review } from "../review";
import type { FileResource } from "../resources";
import type { Unmount } from "../runtime";

interface CurrentFileReviewBinding {
  readonly options: MountEditorBufferOptions;
  connect(mounted: MountedEditorBuffer): Unmount;
}

const NO_REVIEW: CurrentFileReviewBinding = {
  options: {},
  connect: () => () => {},
};

/** Bind one Markdown buffer to the workbench review ledger and header action. */
export function createReviewBinding(
  buffer: EditorBuffer,
  resource: FileResource,
  actions: HTMLElement,
  review: Review,
): CurrentFileReviewBinding {
  if (!buffer.language.markdown || buffer.content === null) return NO_REVIEW;
  const documentReview = review.document({ resource, relative: resource.relativePath });
  const feedback = document.createElement("button");
  feedback.type = "button";
  feedback.textContent = "Feedback";
  feedback.setAttribute("aria-label", "View Markdown feedback");
  feedback.addEventListener("click", () => documentReview.openFeedback());
  actions.append(feedback);

  return {
    options: {
      onSelectionChange: (selection) => documentReview.selection(selection),
      onCommentActivate: (id) => documentReview.openFeedback(id),
    },
    connect: (mounted) =>
      mounted.editor
        ? documentReview.connect((tags) => mounted.editor?.setCommentTags(tags))
        : () => {},
  };
}
