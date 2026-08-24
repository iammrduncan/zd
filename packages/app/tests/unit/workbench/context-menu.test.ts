import { afterEach, describe, expect, it } from "vitest";

import { closeContextMenu, openContextMenu } from "@/workbench/context-menu";

function menu(label: string): HTMLElement {
  const element = document.createElement("div");
  element.setAttribute("role", "menu");
  element.id = `${label}-menu`;
  for (const item of ["one", "two", "three"]) {
    const button = document.createElement("button");
    button.setAttribute("role", "menuitem");
    button.textContent = `${label}-${item}`;
    element.append(button);
  }
  return element;
}

describe("shared context-menu mechanics", () => {
  afterEach(() => {
    closeContextMenu();
    document.body.replaceChildren();
  });

  it("coordinates one menu, roves items, and restores focus on Escape", () => {
    const firstAnchor = document.createElement("button");
    const secondAnchor = document.createElement("button");
    document.body.append(firstAnchor, secondAnchor);
    const first = menu("first");
    openContextMenu({
      host: document.body,
      menu: first,
      anchor: firstAnchor,
      inlineStart: 0,
      blockStart: 0,
    });
    expect(document.activeElement?.textContent).toBe("first-one");

    const second = menu("second");
    openContextMenu({
      host: document.body,
      menu: second,
      anchor: secondAnchor,
      inlineStart: 0,
      blockStart: 0,
    });
    expect(first.isConnected).toBe(false);
    second.dispatchEvent(new KeyboardEvent("keydown", { key: "End", bubbles: true }));
    expect(document.activeElement?.textContent).toBe("second-three");
    second.dispatchEvent(new KeyboardEvent("keydown", { key: "Home", bubbles: true }));
    expect(document.activeElement?.textContent).toBe("second-one");

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(second.isConnected).toBe(false);
    expect(document.activeElement).toBe(secondAnchor);
  });
});
