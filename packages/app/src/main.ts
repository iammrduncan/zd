import "./design/index.css";

import {
  connectDesktopServedPlatform,
  connectServedPlatform,
  detectPlatform,
  isTauriWindow,
} from "./platform";
import { mountDesktopStartup } from "./platform/desktop-startup";
import { isServedPage, mountServedLimits, mountServedUnlock } from "./platform/served-unlock";
import { bootWorkbench } from "./workbench/boot";

const host = document.getElementById("zd");
if (!host) throw new Error("index.html is missing the #zd host element");

async function start(workbenchHost: HTMLElement): Promise<void> {
  const served = isServedPage();
  const desktop = isTauriWindow();
  if (desktop && !served) {
    mountDesktopStartup(workbenchHost);
    return;
  }
  const platform = served
    ? desktop
      ? await connectDesktopServedPlatform()
      : await mountServedUnlock(workbenchHost, connectServedPlatform)
    : detectPlatform();
  await bootWorkbench(workbenchHost, platform);
  if (served && workbenchHost.querySelector(".zd-workbench")) {
    mountServedLimits(workbenchHost);
  }
}

void start(host);
