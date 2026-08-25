/**
 * Shared predicates for the TypeScript rules.
 *
 * Kept beside index.mjs rather than inside rules/, because every file in rules/
 * is a rule: the suite requires a fixture pair and a Do:/Never: message for each
 * one, and a helper module would fail both.
 */

/** Strip parentheses from a type node. */
export function unwrapType(type) {
  let current = type;
  while (current && current.type === "TSParenthesizedType") current = current.typeAnnotation;
  return current;
}

/** Strip parentheses, assertions, and non-null from an expression. */
export function unwrapExpression(node) {
  let current = node;
  while (
    current &&
    (current.type === "ParenthesizedExpression" ||
      current.type === "TSAsExpression" ||
      current.type === "TSSatisfiesExpression" ||
      current.type === "TSTypeAssertion" ||
      current.type === "TSNonNullExpression")
  ) {
    current = current.expression;
  }
  return current;
}

/** `unknown` or `any`: the two types that assert nothing about a value. */
export function isTopType(type) {
  const t = unwrapType(type);
  return !!t && (t.type === "TSUnknownKeyword" || t.type === "TSAnyKeyword");
}

export function typeReferenceName(type) {
  const t = unwrapType(type);
  return t && t.type === "TSTypeReference" && t.typeName && t.typeName.type === "Identifier"
    ? t.typeName.name
    : null;
}

/** A key type broad enough that the dictionary constrains nothing useful. */
export function isBroadKeyType(type) {
  const t = unwrapType(type);
  if (!t) return false;
  if (t.type === "TSStringKeyword" || t.type === "TSNumberKeyword" || t.type === "TSSymbolKeyword") return true;
  if (t.type === "TSUnionType") return t.types.every(isBroadKeyType);
  return typeReferenceName(t) === "PropertyKey";
}

/** Walk the scope chain for the binding an identifier refers to. */
export function resolveVariable(sourceCode, identifier) {
  let scope = sourceCode.getScope ? sourceCode.getScope(identifier) : null;
  while (scope) {
    const found = scope.set && scope.set.get(identifier.name);
    if (found) return found;
    scope = scope.upper;
  }
  return null;
}

/** The single declarator a variable came from, when it has exactly one. */
export function soleDeclarator(variable) {
  if (!variable || !variable.defs || variable.defs.length !== 1) return null;
  const definition = variable.defs[0];
  return definition && definition.type === "Variable" && definition.node.type === "VariableDeclarator"
    ? definition.node
    : null;
}

export const FUNCTION_TYPES = new Set([
  "ArrowFunctionExpression",
  "FunctionDeclaration",
  "FunctionExpression",
  "TSDeclareFunction",
  "TSEmptyBodyFunctionExpression",
]);

/** The nearest enclosing function, or null at the top level. */
export function enclosingFunction(node) {
  let current = node.parent;
  while (current && current.type !== "Program") {
    if (FUNCTION_TYPES.has(current.type)) return current;
    current = current.parent;
  }
  return null;
}

/** A rule message: what is wrong, the fix, and the cheap fix named so it is not taken. */
export const advice = (detail, doThis, neverThis) => `${detail} Do: ${doThis} Never: ${neverThis}`;
