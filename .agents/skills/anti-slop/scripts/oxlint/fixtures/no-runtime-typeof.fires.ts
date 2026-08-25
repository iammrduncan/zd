function handle(v: string | number) { if (typeof v === "string") return v; return String(v); }
const check = (x: unknown) => (typeof x === "object" ? 1 : 0);
export function third(y: unknown) { return typeof y !== "undefined"; }
