// @ts-expect-error
const a = wrong();
// eslint-disable-next-line no-console
console.log("x");
// oxlint-disable-next-line no-explicit-any
function f(p: any) { return p; }
