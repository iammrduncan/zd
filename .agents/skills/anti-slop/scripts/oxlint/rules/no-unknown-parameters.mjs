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
 * An `unknown` parameter accepts anything and makes the body re-derive what it got.
 */

import { advice, isTopType } from "../shared.mjs";

export default {
  meta: { docs: { description: "Disallow parameters annotated as unknown or any." } },
  create(context) {
    const check = (node) => {
      for (const parameter of node.params ?? []) {
        const target =
          parameter.type === "AssignmentPattern" ? parameter.left
          : parameter.type === "RestElement" ? parameter.argument
          : parameter;
        const annotation = target && target.typeAnnotation && target.typeAnnotation.typeAnnotation;
        if (!annotation || !isTopType(annotation)) continue;
        context.report({
          node: target,
          message: advice(
            "This parameter accepts anything, so the body has to re-derive what it was given.",
            "take the type the caller already has, and validate at the entry point instead.",
            "do not widen the caller to match — the evidence exists at the call site, keep it.",
          ),
        });
      }
    };
    return {
      FunctionDeclaration: check,
      FunctionExpression: check,
      ArrowFunctionExpression: check,
      TSDeclareFunction: check,
    };
  },
};
