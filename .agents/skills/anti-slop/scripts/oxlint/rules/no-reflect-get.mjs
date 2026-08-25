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
 * `Reflect.get` reads a property the type system cannot check.
 */

import { advice } from "../shared.mjs";

export default {
  meta: { docs: { description: "Disallow Reflect.get, which reads past the type system." } },
  create(context) {
    return {
      CallExpression(node) {
        const callee = node.callee;
        if (
          callee.type !== "MemberExpression" ||
          callee.computed ||
          callee.object.type !== "Identifier" ||
          callee.object.name !== "Reflect" ||
          callee.property.type !== "Identifier" ||
          callee.property.name !== "get"
        ) {
          return;
        }
        context.report({
          node,
          message: advice(
            "`Reflect.get` reads a property the type system cannot check.",
            "access the property directly, or narrow the object before reading it.",
            "do not assert the result back to the type you wanted — that is the same gap with a label on it.",
          ),
        });
      },
    };
  },
};
