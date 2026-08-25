/*
 * MIT License
 *
 * Copyright (c) 2026 Shannon Duncan, shannon@iammrduncan.com. Aliases: shadowcodex, iamMrDuncan
 *
 * ========================================================================
 * Upstream Components Copyright Notices
 * ========================================================================
 * Copyright (c) 2026 Dillon Mulroy
 *
 * ========================================================================
 * License Text
 * ========================================================================
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */

/**
 * An explicit top-type annotation that throws away evidence the value carries.
 *
 *   const config: unknown = { host: "localhost" };
 *
 * The initialiser says exactly what this is. The annotation says nothing, and
 * every later use has to re-establish what was already known here.
 */

import { advice, isTopType } from "../shared.mjs";

/** An initialiser whose type is evident from the expression itself. */
const KNOWN = new Set([
  "ObjectExpression",
  "ArrayExpression",
  "Literal",
  "TemplateLiteral",
  "ArrowFunctionExpression",
  "FunctionExpression",
  "ClassExpression",
  "NewExpression",
]);

export function isKnownValue(node) {
  if (!node) return false;
  let current = node;
  while (current.type === "ParenthesizedExpression") current = current.expression;
  if (current.type === "TSAsExpression") return isKnownValue(current.expression);
  if (current.type === "UnaryExpression") return isKnownValue(current.argument);
  return KNOWN.has(current.type);
}

export default {
  meta: { docs: { description: "Disallow widening a known value to unknown or any." } },
  create(context) {
    return {
      VariableDeclarator(node) {
        const annotation = node.id && node.id.typeAnnotation && node.id.typeAnnotation.typeAnnotation;
        if (!annotation || !isTopType(annotation)) return;
        if (!isKnownValue(node.init)) return;
        context.report({
          node,
          message: advice(
            "This annotation discards what the initialiser already establishes.",
            "annotate the type the value actually has, or drop the annotation and let it be inferred.",
            "do not assert it back later — that is the widening and the undo, in two places.",
          ),
        });
      },
    };
  },
};
