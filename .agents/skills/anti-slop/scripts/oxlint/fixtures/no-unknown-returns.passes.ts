export function decode(raw: string): Payload { return schema.parse(JSON.parse(raw)); }
export const load = (): Thing => fetchThing();
function inner(): number { return 1; }
