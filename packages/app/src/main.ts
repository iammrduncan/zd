import "./design/index.css";

import { detectPlatform } from "./platform";
import { bootWorkbench } from "./workbench/boot";

const host = document.getElementById("zd");
if (!host) throw new Error("index.html is missing the #zd host element");

const platform = detectPlatform();
void bootWorkbench(host, platform);
