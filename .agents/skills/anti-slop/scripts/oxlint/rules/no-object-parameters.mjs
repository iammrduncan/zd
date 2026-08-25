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
 * `object` says only that the value is not a primitive.
 */

import { advice, unwrapType } from "../shared.mjs";

export default {
  meta: { docs: { description: "Disallow parameters annotated as the bare object type." } },
  create(context) {
    const check = (node) => {
      for (const parameter of node.params ?? []) {
        const target =
          parameter.type === "AssignmentPattern" ? parameter.left
          : parameter.type === "RestElement" ? parameter.argument
          : parameter;
        const annotation = target && target.typeAnnotation && target.typeAnnotation.typeAnnotation;
        const resolved = annotation && unwrapType(annotation);
        if (!resolved || resolved.type !== "TSObjectKeyword") continue;
        context.report({
          node: target,
          message: advice(
            "`object` says only that this is not a primitive.",
            "state the properties the function actually reads.",
            "do not reach into it with a cast in the body — that is the same claim, made later and less visibly.",
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
