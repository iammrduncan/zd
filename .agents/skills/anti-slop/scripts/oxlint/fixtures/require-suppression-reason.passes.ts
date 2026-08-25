// @ts-expect-error the vendor SDK ships wrong types for this overload
const a = wrong();
// eslint-disable-next-line no-console -- this is the CLI banner, stdout is the product
console.log("x");
// oxlint-disable-next-line no-explicit-any -- the protocol payload is genuinely untyped
function f(p: any) { return p; }
