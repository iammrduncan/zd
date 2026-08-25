/*
 * MIT License
 *
 * Copyright (c) 2026 Shannon Duncan, shannon@iammrduncan.com. Aliases: shadowcodex, iamMrDuncan
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
 * A test that was committed switched off.
 *
 * `.skip` leaves a suite that reads as covered and is not. `.only` is worse: it
 * silently disables *every other test in the run*, so a green suite can mean one
 * assertion passed. Both are evidence theatre, and both survive review because
 * the diff looks like a one-character change.
 */

const RUNNERS = new Set(["it", "test", "describe", "suite", "context", "bench", "assert"]);
const DISABLING = new Set(["skip", "todo", "failing"]);
const EXCLUSIVE = new Set(["only"]);
const PREFIXED = new Map([
  ["xit", "skip"], ["xdescribe", "skip"], ["xtest", "skip"], ["xcontext", "skip"],
  ["fit", "only"], ["fdescribe", "only"], ["ftest", "only"],
]);

export default {
  meta: {
    docs: { description: "Reject a test committed in a skipped or exclusive state." },
  },

  create(context) {
    const skipped = (node, name) =>
      context.report({
        node,
        message:
          `\`${name}\` is committed switched off, so this suite reads as covered and is not. ` +
          "Do: finish the test, or delete it and record why in the change description. " +
          "Never: leave it skipped to make the run green.",
      });

    const exclusive = (node, name) =>
      context.report({
        node,
        message:
          `\`${name}\` silently disables every other test in this run, so a green suite proves almost nothing. ` +
          "Do: remove it before committing. " +
          "Never: keep it because the full suite is slow — narrow the run from the command line instead.",
      });

    return {
      CallExpression(node) {
        const callee = node.callee;

        // it.skip(...), describe.only(...), test.todo(...)
        if (
          callee.type === "MemberExpression" &&
          callee.property.type === "Identifier" &&
          callee.object.type === "Identifier" &&
          RUNNERS.has(callee.object.name)
        ) {
          const name = `${callee.object.name}.${callee.property.name}`;
          if (DISABLING.has(callee.property.name)) skipped(node, name);
          else if (EXCLUSIVE.has(callee.property.name)) exclusive(node, name);
          return;
        }

        // xit(...), fdescribe(...)
        if (callee.type === "Identifier" && PREFIXED.has(callee.name)) {
          if (PREFIXED.get(callee.name) === "only") exclusive(node, callee.name);
          else skipped(node, callee.name);
        }
      },
    };
  },
};
