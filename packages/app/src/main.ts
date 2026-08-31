import "./design/index.css";

import { connectServedPlatform, detectPlatform } from "./platform";
import { isServedPage, mountServedLimits, mountServedUnlock } from "./platform/served-unlock";
import { bootWorkbench } from "./workbench/boot";

const host = document.getElementById("zd");
if (!host) throw new Error("index.html is missing the #zd host element");

async function start(workbenchHost: HTMLElement): Promise<void> {
  const served = isServedPage();
  const platform = served
    ? await mountServedUnlock(workbenchHost, connectServedPlatform)
    : detectPlatform();
  await bootWorkbench(workbenchHost, platform);
  if (served && workbenchHost.querySelector(".zd-workbench")) {
    mountServedLimits(workbenchHost);
  }
}

void start(host);
