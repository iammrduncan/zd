import { expect, test, type Page } from "@playwright/test";

import { sameColour } from "../colour";

declare global {
  interface Window {
    projectFixture: {
      calls: string[];
    };
  }
}

async function mountFixture(page: Page): Promise<void> {
  await page.goto("/");
  await page.evaluate(async () => {
    const modulePath = "/src/projects/index.ts";
    const { ProjectsController, mountProjectList } = (await import(
      /* @vite-ignore */ modulePath
    )) as typeof import("../../../src/projects");
    const calls: string[] = [];
    const listeners = new Set<
      (next: import("../../../src/projects").ProjectWorkbenchSnapshot) => void
    >();
    let snapshot: import("../../../src/projects").ProjectWorkbenchSnapshot = {
      projects: [
        {
          id: "alpha",
          name: "Alpha",
          root: "/work/alpha",
          order: 0,
          availability: "available",
          worktrees: [
            {
              id: "alpha-root",
              name: "main",
              root: "/work/alpha",
              availability: "available",
            },
          ],
          recovery: null,
        },
        {
          id: "beta",
          name: "Beta",
          root: "/work/beta-old",
          order: 1,
          availability: "missing",
          worktrees: [
            {
              id: "beta-root",
              name: "main",
              root: "/work/beta-old",
              availability: "missing",
            },
          ],
          recovery: {
            kind: "moved",
            summary: "Folder moved since it was approved.",
            actionLabel: "Locate folder",
          },
        },
        {
          id: "gamma",
          name: "Gamma",
          root: "/work/gamma",
          order: 2,
          availability: "available",
          worktrees: [
            {
              id: "gamma-root",
              name: "main",
              root: "/work/gamma",
              availability: "available",
            },
          ],
          recovery: null,
        },
      ],
      active: {
        projectId: "alpha",
        projectRoot: "/work/alpha",
        worktreeId: "alpha-root",
        worktreeRoot: "/work/alpha",
        threadId: "alpha-thread",
        fileId: "alpha-file",
      },
    };
    const publish = () => listeners.forEach((listener) => listener(snapshot));
    const adapter: import("../../../src/projects").ProjectWorkbenchAdapter = {
      snapshot: () => snapshot,
      subscribe: (listener) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      chooseProject: async () => {
        calls.push("choose");
        return {
          id: "delta",
          name: "Delta",
          root: "/work/delta",
          availability: "available",
          worktrees: [
            {
              id: "delta-root",
              name: "main",
              root: "/work/delta",
              availability: "available",
            },
          ],
        };
      },
      acceptChosenProject: async (grant) => {
        calls.push(`accept:${grant.id}`);
        return { status: "committed" };
      },
      activateProject: async (projectId) => {
        calls.push(`activate:${projectId}`);
        const project = snapshot.projects.find(({ id }) => id === projectId)!;
        const worktree = project.worktrees[0]!;
        snapshot = {
          ...snapshot,
          active: {
            projectId,
            projectRoot: project.root,
            worktreeId: worktree.id,
            worktreeRoot: worktree.root,
            threadId: null,
            fileId: null,
          },
        };
        publish();
        return { status: "committed" };
      },
      reorderProjects: async (orderedIds) => {
        calls.push(`reorder:${orderedIds.join(",")}`);
        snapshot = {
          ...snapshot,
          projects: orderedIds.map((id, order) => ({
            ...snapshot.projects.find((project) => project.id === id)!,
            order,
          })),
        };
        publish();
        return { status: "committed" };
      },
      removeProject: async (projectId) => {
        calls.push(`remove:${projectId}`);
        return { status: "committed" };
      },
      recoverProject: async (projectId) => {
        calls.push(`recover:${projectId}`);
        snapshot = {
          ...snapshot,
          projects: snapshot.projects.map((project) =>
            project.id === projectId
              ? { ...project, availability: "available", recovery: null }
              : project,
          ),
        };
        publish();
        return { status: "committed" };
      },
    };

    const host = document.createElement("aside");
    host.id = "project-fixture";
    host.style.width = "236px";
    document.body.replaceChildren(host);
    mountProjectList(host, new ProjectsController(adapter), {
      renderChildren: (project, childHost, actionHost) => {
        childHost.textContent = `${project.id} thread · idle`;
        const createThread = document.createElement("button");
        createThread.type = "button";
        createThread.className = "zd-thread-create-action";
        createThread.dataset.threadCreate = project.id;
        createThread.setAttribute("aria-label", `New terminal in ${project.name}`);
        createThread.textContent = "+";
        createThread.addEventListener("click", () => calls.push(`create:${project.id}`));
        actionHost.append(createThread);
      },
    });
    window.projectFixture = { calls };
  });
}

test("renders a compact accessible hierarchy with a selected project", async ({ page }) => {
  await mountFixture(page);

  await expect(page.locator("[data-project-id]")).toHaveCount(3);
  await expect(page.locator('[data-project-id="alpha"] .zd-project-children')).toContainText(
    "alpha thread · idle",
  );
  await expect(page.locator('[data-project-id="beta"]')).toContainText(
    "Folder moved since it was approved.",
  );
  await expect(page.locator('[data-project-id="alpha"] .zd-project-row')).toHaveAttribute(
    "aria-current",
    "true",
  );

  const metrics = await page
    .locator('[data-project-id="alpha"] .zd-project-row')
    .evaluate((row) => ({
      height: row.getBoundingClientRect().height,
      family: getComputedStyle(row).fontFamily,
      background: getComputedStyle(row).backgroundColor,
    }));
  expect(metrics.height).toBeGreaterThanOrEqual(22);
  expect(metrics.height).toBeLessThanOrEqual(24);
  expect(metrics.family).toContain("iA Writer Mono");
  expect(metrics.background).not.toBe("rgba(0, 0, 0, 0)");

  const resting = await page
    .locator(
      '[data-project-id="beta"] .zd-project-heading, [data-project-id="gamma"] .zd-project-heading',
    )
    .evaluateAll((headings) =>
      headings.map((heading) => getComputedStyle(heading).backgroundColor),
    );
  expect(resting).toHaveLength(2);
  for (const background of resting) {
    expect(background, "an open project header has no resting band").not.toBe("rgba(0, 0, 0, 0)");
    expect(sameColour(background, metrics.background), "inactive and active projects merge").toBe(
      false,
    );
  }
});

test("ordinary, modified-pointer, and keyboard activation share one transition", async ({
  page,
}) => {
  await mountFixture(page);
  const beta = page.locator('[data-project-id="beta"] .zd-project-row');
  const alpha = page.locator('[data-project-id="alpha"] .zd-project-row');

  await beta.click();
  await beta.click({ modifiers: ["Meta", "Shift"] });
  await alpha.focus();
  await alpha.press("Enter");

  await expect
    .poll(() => page.evaluate(() => window.projectFixture.calls))
    .toEqual(["activate:beta", "activate:beta", "activate:alpha"]);
});

test("new-thread stays contextual and project close lives in the right-click menu", async ({
  page,
}) => {
  await mountFixture(page);

  const betaHeading = page.locator('[data-project-id="beta"] .zd-project-heading');
  const createThread = page.locator('[data-project-id="beta"] [data-thread-create="beta"]');
  const contextualActions = page.locator('[data-project-id="beta"] .zd-project-actions');
  await page.mouse.move(800, 400);
  await expect(contextualActions).toHaveCSS("opacity", "0");
  await betaHeading.hover();
  await expect(contextualActions).toHaveCSS("opacity", "1");
  await expect(createThread).toBeVisible();
  await createThread.click();
  await page.mouse.move(800, 400);
  await createThread.focus();
  await expect(contextualActions).toHaveCSS("opacity", "1");

  await page.locator("[data-project-add]").click();
  await expect(page.locator("[data-project-remove]")).toHaveCount(0);
  await page.locator('[data-project-id="beta"] .zd-project-row').click({ button: "right" });
  const menu = page.getByRole("menu", { name: "Beta project actions" });
  await expect(menu).toBeVisible();
  await menu.getByRole("menuitem", { name: "Close Beta" }).click();

  await expect
    .poll(() => page.evaluate(() => window.projectFixture.calls))
    .toEqual(["create:beta", "choose", "accept:delta", "remove:beta"]);
  await expect(page.locator('[data-project-id="beta"]')).toHaveCount(1);
  await expect(page.locator('[data-project-id="delta"]')).toHaveCount(0);
});

test("drag reorder and unavailable recovery wait for adapter publication", async ({ page }) => {
  await mountFixture(page);
  const gamma = page.locator('[data-project-id="gamma"] .zd-project-row');
  const alpha = page.locator('[data-project-id="alpha"] .zd-project-row');

  await gamma.dragTo(alpha, { targetPosition: { x: 8, y: 2 } });
  await expect
    .poll(() =>
      page
        .locator("[data-project-id]")
        .evaluateAll((groups) => groups.map((group) => group.getAttribute("data-project-id"))),
    )
    .toEqual(["gamma", "alpha", "beta"]);

  await page.locator('[data-project-id="beta"] [data-project-recovery]').click();
  await expect(page.locator('[data-project-id="beta"] [data-project-recovery]')).toHaveCount(0);
  await expect
    .poll(() => page.evaluate(() => window.projectFixture.calls))
    .toContain("recover:beta");
});
