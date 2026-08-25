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
 * "Shape" as a suffix says a value has structure, which every value has.
 *
 * The capital S and the required prefix matter: this is about the `UserShape`
 * habit, not about the word. A geometry `class Shape` is the thing itself.
 */

import { advice } from "../shared.mjs";

const SHAPE_SUFFIX = /.+Shapes?$/;

export default {
  meta: { docs: { description: "Disallow Shape as a suffix in declared names." } },
  create(context) {
    const check = (identifier) => {
      if (!identifier || identifier.type !== "Identifier") return;
      if (!SHAPE_SUFFIX.test(identifier.name)) return;
      context.report({
        node: identifier,
        message: advice(
          `\`${identifier.name}\` names the value as having structure, which every value has.`,
          "name what it is, not that it is shaped.",
          "do not swap it for another placeholder such as Data, Info, or Object.",
        ),
      });
    };

    return {
      VariableDeclarator: (node) => check(node.id),
      FunctionDeclaration: (node) => check(node.id),
      ClassDeclaration: (node) => check(node.id),
      TSInterfaceDeclaration: (node) => check(node.id),
      TSTypeAliasDeclaration: (node) => check(node.id),
      TSEnumDeclaration: (node) => check(node.id),
    };
  },
};
