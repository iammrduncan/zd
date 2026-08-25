class Base { render(): string { throw new Error("Base.render must be overridden by a subclass"); } }
export function parse(input: string) { throw new ParseError(`unexpected token at ${input.length}`); }
export function noop() {}
