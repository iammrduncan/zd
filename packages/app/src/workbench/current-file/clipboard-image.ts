function segments(path: string): string[] {
  return path.split(/[\\/]/).filter((segment) => segment.length > 0 && segment !== ".");
}

/** Build a project-relative Markdown image link from the open document to a native-owned target. */
export function screenshotLink(documentPath: string, imagePath: string): string {
  const from = segments(documentPath).slice(0, -1);
  const to = segments(imagePath);
  let common = 0;
  while (common < from.length && common < to.length && from[common] === to[common]) {
    common += 1;
  }
  const relative = [
    ...Array.from({ length: from.length - common }, () => ".."),
    ...to.slice(common),
  ].join("/");
  return `![Screenshot](${relative})`;
}
