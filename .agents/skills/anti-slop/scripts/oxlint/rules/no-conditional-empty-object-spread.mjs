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
 * Spreading an empty object to omit a field makes the field's presence invisible
 * to the type. The type says optional; the code says conditional; nothing
 * connects the two.
 */

import { advice } from "../shared.mjs";

const isEmptyObject = (node) =>
  node && node.type === "ObjectExpression" && (node.properties ?? []).length === 0;

export default {
  meta: { docs: { description: "Disallow conditional spreads that fall back to an empty object." } },
  create(context) {
    return {
      SpreadElement(node) {
        let argument = node.argument;
        while (argument && argument.type === "ParenthesizedExpression") argument = argument.expression;
        if (!argument || argument.type !== "ConditionalExpression") return;
        if (!isEmptyObject(argument.consequent) && !isEmptyObject(argument.alternate)) return;
        context.report({
          node,
          message: advice(
            "Spreading an empty object hides whether the field is there at all.",
            "make the field optional in the type and set it explicitly to `undefined` when it does not apply.",
            "do not nest the conditional deeper — the type still cannot see which branch ran.",
          ),
        });
      },
    };
  },
};
