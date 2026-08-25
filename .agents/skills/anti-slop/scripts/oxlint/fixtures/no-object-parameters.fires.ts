export function merge(target: object, source: object) { return { ...target, ...source }; }
export const apply = (patch: object) => patch;
function third(name: string, bag: object) { return bag; }
