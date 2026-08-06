import "./design/index.css";

import { detectPlatform, trackAppPresence } from "./platform";
import { boot } from "./suite/boot";
import { register } from "./suite/registry";
import { md } from "./miniapps/md";

// Every mini app registers here. `zd td` is one more line when it lands.
register(md);

const host = document.getElementById("zd");
if (!host) throw new Error("index.html is missing the #zd host element");

const platform = detectPlatform();
trackAppPresence(platform.kind);
void boot(host, platform);
