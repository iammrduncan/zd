import type { Unmount } from "./runtime";

const FILES_SUPPRESSED_QUERY = "(max-width: 58.25rem)";
const THREADS_COLLAPSED_QUERY = "(max-width: 50rem)";
const THREADS_HIDDEN_QUERY = "(max-width: 40rem)";

export interface ResponsiveRegions {
  readonly filesSuppressed: () => boolean;
  readonly filesOpen: () => boolean;
  readonly toggleFiles: () => boolean;
  readonly closeFiles: () => boolean;
  readonly syncVisibility: (threadsHidden: boolean, filesHidden: boolean) => void;
  readonly dispose: Unmount;
}

/** Own viewport-derived presentation without mutating durable region preferences. */
export function mountResponsiveRegions(
  shell: HTMLElement,
  threads: HTMLElement,
  files: HTMLElement,
  filesFocusTarget: HTMLElement,
  centreFocusTarget: () => HTMLElement,
): ResponsiveRegions {
  if (typeof window.matchMedia !== "function") {
    shell.dataset.responsiveThreads = "full";
    shell.dataset.responsiveFiles = "available";
    shell.dataset.responsiveFilesOpen = "false";
    return {
      filesSuppressed: () => false,
      filesOpen: () => false,
      toggleFiles: () => false,
      closeFiles: () => false,
      syncVisibility: () => {},
      dispose: () => {},
    };
  }

  const filesMedia = window.matchMedia(FILES_SUPPRESSED_QUERY);
  const collapsedMedia = window.matchMedia(THREADS_COLLAPSED_QUERY);
  const hiddenMedia = window.matchMedia(THREADS_HIDDEN_QUERY);
  let temporaryFilesOpen = false;
  let durableThreadsHidden = false;
  let durableFilesHidden = false;
  let filesReturnFocus: HTMLElement | null = null;
  let threadsReturnFocus: HTMLElement | null = null;

  const effectiveThreadsHidden = () => durableThreadsHidden || hiddenMedia.matches;
  const effectiveFilesHidden = () =>
    !temporaryFilesOpen && (durableFilesHidden || filesMedia.matches);

  const applyAccessibility = () => {
    const threadsHidden = effectiveThreadsHidden();
    const filesHidden = effectiveFilesHidden();
    threads.inert = threadsHidden;
    files.inert = filesHidden;
    threads.setAttribute("aria-hidden", String(threadsHidden));
    files.setAttribute("aria-hidden", String(filesHidden));
  };

  const closeFiles = (): boolean => {
    if (!temporaryFilesOpen) return false;
    temporaryFilesOpen = false;
    shell.dataset.responsiveFilesOpen = "false";
    applyAccessibility();
    centreFocusTarget().focus({ preventScroll: true });
    return true;
  };

  const toggleFiles = (): boolean => {
    if (!filesMedia.matches) return false;
    if (temporaryFilesOpen) return closeFiles();
    filesReturnFocus =
      document.activeElement instanceof HTMLElement ? document.activeElement : centreFocusTarget();
    temporaryFilesOpen = true;
    shell.dataset.responsiveFilesOpen = "true";
    applyAccessibility();
    queueMicrotask(() => filesFocusTarget.focus({ preventScroll: true }));
    return true;
  };

  const reconcile = () => {
    shell.dataset.responsiveFiles = filesMedia.matches ? "suppressed" : "available";
    shell.dataset.responsiveThreads = hiddenMedia.matches
      ? "hidden"
      : collapsedMedia.matches
        ? "collapsed"
        : "full";

    if (!filesMedia.matches && temporaryFilesOpen) {
      temporaryFilesOpen = false;
      shell.dataset.responsiveFilesOpen = "false";
      if (filesReturnFocus?.isConnected) filesReturnFocus.focus({ preventScroll: true });
      filesReturnFocus = null;
    }

    const active = document.activeElement;
    if (effectiveFilesHidden() && active instanceof HTMLElement && files.contains(active)) {
      filesReturnFocus = active;
      centreFocusTarget().focus({ preventScroll: true });
    }
    if (effectiveThreadsHidden() && active instanceof HTMLElement && threads.contains(active)) {
      threadsReturnFocus = active;
      centreFocusTarget().focus({ preventScroll: true });
    } else if (!effectiveThreadsHidden() && threadsReturnFocus?.isConnected) {
      threadsReturnFocus.focus({ preventScroll: true });
      threadsReturnFocus = null;
    }
    applyAccessibility();
  };

  const syncVisibility = (threadsHidden: boolean, filesHidden: boolean) => {
    durableThreadsHidden = threadsHidden;
    durableFilesHidden = filesHidden;
    applyAccessibility();
  };
  const medias = [filesMedia, collapsedMedia, hiddenMedia];
  medias.forEach((media) => media.addEventListener("change", reconcile));
  shell.dataset.responsiveFilesOpen = "false";
  reconcile();

  return {
    filesSuppressed: () => filesMedia.matches,
    filesOpen: () => temporaryFilesOpen,
    toggleFiles,
    closeFiles,
    syncVisibility,
    dispose: () => medias.forEach((media) => media.removeEventListener("change", reconcile)),
  };
}
