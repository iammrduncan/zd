export function parseProcessTable(source) {
  const processes = [];
  for (const line of source.split(/\r?\n/u)) {
    const match = /^\s*(\d+)\s+(\d+)\s+(.+)$/u.exec(line);
    if (!match) continue;
    processes.push({
      command: match[3],
      parentPid: Number(match[2]),
      pid: Number(match[1]),
    });
  }
  return processes;
}

export function parseLsofListeners(source) {
  const ports = [];
  for (const line of source.split(/\r?\n/u)) {
    const match = /^n127\.0\.0\.1:(\d+)$/u.exec(line);
    if (!match) continue;
    const port = Number(match[1]);
    if (Number.isInteger(port) && port > 0 && port <= 65_535) ports.push(port);
  }
  return [...new Set(ports)].sort((left, right) => left - right);
}
