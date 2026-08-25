export function decode(raw: string): unknown { return JSON.parse(raw); }
export const load = (): any => fetchThing();
function inner(): unknown { return 1; }
