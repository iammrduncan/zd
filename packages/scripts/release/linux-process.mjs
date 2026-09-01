export function parseParentPid(status) {
  const match = /^PPid:\s+(\d+)$/mu.exec(status);
  return match ? Number(match[1]) : null;
}

export function parseTcpListeners(table, ownedInodes) {
  const ports = [];
  for (const line of table.split(/\r?\n/u).slice(1)) {
    const fields = line.trim().split(/\s+/u);
    if (fields.length < 10) continue;
    const [address, portHex] = (fields[1] ?? "").split(":");
    const state = fields[3];
    const inode = fields[9];
    if (address !== "0100007F" || state !== "0A" || !inode || !ownedInodes.has(inode)) continue;
    const port = Number.parseInt(portHex ?? "", 16);
    if (Number.isInteger(port) && port > 0 && port <= 65_535) ports.push(port);
  }
  return [...new Set(ports)].sort((left, right) => left - right);
}
