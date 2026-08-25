const out = Reflect.apply(handler, ctx, args);
const again = Reflect.apply(fn, null, [1, 2]);
export const third = Reflect.apply(render, view, params);
