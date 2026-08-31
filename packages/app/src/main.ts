import "./design/index.css";

import { connectServedPlatform, detectPlatform } from "./platform";
import { isServedPage, mountServedUnlock } from "./platform/served-unlock";
import { bootWorkbench } from "./workbench/boot";

const host = document.getElementById("zd");
if (!host) throw new Error("index.html is missing the #zd host element");

async function start(workbenchHost: HTMLElement): Promise<void> {
  const platform = isServedPage()
    ? await mountServedUnlock(workbenchHost, connectServedPlatform)
    : detectPlatform();
  await bootWorkbench(workbenchHost, platform);
}

void start(host);
