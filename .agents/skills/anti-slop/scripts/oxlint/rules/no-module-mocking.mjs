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
 * Module mocking replaces the thing under test with an assumption about it.
 */

import { advice } from "../shared.mjs";

const RUNNERS = new Set(["vi", "jest"]);
const MOCKERS = new Set(["mock", "doMock", "unstable_mockModule", "setMock"]);

export default {
  meta: { docs: { description: "Disallow Vitest and Jest module mocks." } },
  create(context) {
    return {
      CallExpression(node) {
        const callee = node.callee;
        if (
          callee.type !== "MemberExpression" ||
          callee.computed ||
          callee.object.type !== "Identifier" ||
          !RUNNERS.has(callee.object.name) ||
          callee.property.type !== "Identifier" ||
          !MOCKERS.has(callee.property.name)
        ) {
          return;
        }
        context.report({
          node,
          message: advice(
            `\`${callee.object.name}.${callee.property.name}\` replaces a module with an assumption about it.`,
            "inject the dependency, or test against a real implementation at the boundary.",
            "do not add more mocks to make the first one work — that is how a suite stops testing the system.",
          ),
        });
      },
    };
  },
};
