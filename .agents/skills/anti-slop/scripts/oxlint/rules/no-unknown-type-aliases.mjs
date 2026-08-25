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
 * An alias for `unknown` makes the absence of a type look like a type.
 */

import { advice, isTopType } from "../shared.mjs";

export default {
  meta: { docs: { description: "Disallow type aliases that resolve to unknown or any." } },
  create(context) {
    return {
      TSTypeAliasDeclaration(node) {
        if (!isTopType(node.typeAnnotation)) return;
        context.report({
          node,
          message: advice(
            `\`${node.id && node.id.name}\` gives a name to a type that asserts nothing.`,
            "define the shape, or delete the alias so the top type is visible where it is used.",
            "do not rename it to something reassuring — a named top type is harder to find than a bare one.",
          ),
        });
      },
    };
  },
};
