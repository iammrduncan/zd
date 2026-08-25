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
 * A `typeof` check narrows a representation without establishing a contract.
 *
 * Allowed inside a type guard — a function whose return type is a predicate —
 * because that is where the narrowing is being turned into a named contract
 * rather than used in place of one.
 */

import { advice, enclosingFunction } from "../shared.mjs";

const COMPARISON = new Set(["==", "===", "!=", "!=="]);

export default {
  meta: { docs: { description: "Disallow ad hoc typeof narrowing outside a type guard." } },
  create(context) {
    const insideTypeGuard = (node) => {
      const fn = enclosingFunction(node);
      return !!fn && !!fn.returnType && fn.returnType.typeAnnotation.type === "TSTypePredicate";
    };

    return {
      UnaryExpression(node) {
        if (node.operator !== "typeof") return;
        const parent = node.parent;
        if (!parent || parent.type !== "BinaryExpression" || !COMPARISON.has(parent.operator)) return;
        if (insideTypeGuard(node)) return;
        context.report({
          node: parent,
          message: advice(
            "This `typeof` check narrows a representation without establishing what the value is.",
            "parse the value at its boundary and branch on the domain type instead.",
            "do not add more `typeof` branches — each one re-derives what a parser would have settled once.",
          ),
        });
      },
    };
  },
};
