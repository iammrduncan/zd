export function merge(target: Config, source: Partial<Config>) { return { ...target, ...source }; }
export const apply = (patch: Patch) => patch;
function third(name: string, bag: Bag) { return bag; }
