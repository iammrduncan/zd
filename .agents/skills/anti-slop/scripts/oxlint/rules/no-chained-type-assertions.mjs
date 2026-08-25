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
 * A chained assertion tells the compiler to stop checking, twice.
 *
 * `payload as unknown as User` launders a value through a top type so the second
 * assertion has nothing left to object to. It is the shape a cast takes when the
 * direct cast would not compile.
 */

import { advice, unwrapType } from "../shared.mjs";

const ASSERTION = new Set(["TSAsExpression", "TSTypeAssertion"]);

export default {
  meta: { docs: { description: "Disallow a type assertion applied to another type assertion." } },
  create(context) {
    return {
      TSAsExpression(node) {
        let inner = node.expression;
        while (inner && inner.type === "ParenthesizedExpression") inner = inner.expression;
        if (!inner || !ASSERTION.has(inner.type)) return;

        const through = unwrapType(inner.typeAnnotation);
        const laundered =
          through && (through.type === "TSUnknownKeyword" || through.type === "TSAnyKeyword");
        context.report({
          node,
          message: advice(
            laundered
              ? "This assertion launders the value through a top type so the second one cannot fail."
              : "This is a type assertion applied to another type assertion.",
            "parse or validate the value at the boundary and return the type you actually have.",
            "do not split it across two statements — the same evidence is discarded either way.",
          ),
        });
      },
    };
  },
};
