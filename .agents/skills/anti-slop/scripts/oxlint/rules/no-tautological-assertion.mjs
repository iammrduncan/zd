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
 * An assertion that cannot fail.
 *
 * `expect(true).toBe(true)` runs, passes, and proves nothing. It is the purest
 * form of evidence theatre: coverage counts it, the suite goes green, and no
 * behaviour was ever checked. Agents produce these when asked to add a test for
 * code they cannot exercise.
 */

const SELF_COMPARING_MATCHERS = new Set([
  "toBe", "toEqual", "toStrictEqual", "toMatchObject", "toContain", "toBeCloseTo",
]);
const ALWAYS_TRUE_MATCHERS = new Set(["toBeTruthy", "toBeDefined"]);
const ASSERT_PAIRWISE = new Set([
  "equal", "strictEqual", "deepEqual", "deepStrictEqual", "notEqual", "notStrictEqual", "is",
]);
const ASSERT_UNARY = new Set(["ok", "isTrue", "isOk", "assert"]);

/** A literal that is always truthy, so asserting on it decides nothing. */
function isConstantTruthy(node) {
  if (!node) return false;
  if (node.type === "Literal") return Boolean(node.value) && node.value !== "";
  if (node.type === "TemplateLiteral") return node.expressions.length === 0 && node.quasis.some((q) => q.value.raw.length > 0);
  if (node.type === "ObjectExpression" || node.type === "ArrayExpression") return true;
  return false;
}

export default {
  meta: {
    docs: { description: "Reject an assertion whose outcome is fixed before it runs." },
  },

  create(context) {
    const source = context.sourceCode;
    const textOf = (node) => (node ? source.getText(node).replace(/\s+/g, " ").trim() : "");

    const report = (node, detail) =>
      context.report({
        node,
        message:
          `${detail} This assertion cannot fail, so it is evidence of nothing. ` +
          "Do: assert the behaviour the code under test actually produces, or delete the test. " +
          "Never: keep it to hold the coverage number up.",
      });

    return {
      CallExpression(node) {
        const callee = node.callee;

        // expect(A).matcher(B)
        if (
          callee.type === "MemberExpression" &&
          callee.property.type === "Identifier" &&
          callee.object.type === "CallExpression" &&
          callee.object.callee.type === "Identifier" &&
          callee.object.callee.name === "expect"
        ) {
          const actual = callee.object.arguments[0];
          const expected = node.arguments[0];
          const matcher = callee.property.name;

          if (SELF_COMPARING_MATCHERS.has(matcher) && actual && expected && textOf(actual) === textOf(expected)) {
            report(node, `\`${textOf(actual)}\` is compared against itself.`);
            return;
          }
          if (ALWAYS_TRUE_MATCHERS.has(matcher) && isConstantTruthy(actual)) {
            report(node, `\`${textOf(actual)}\` is a constant.`);
          }
          return;
        }

        // assert.equal(A, A) and friends
        if (
          callee.type === "MemberExpression" &&
          callee.property.type === "Identifier" &&
          callee.object.type === "Identifier" &&
          /^(assert|chai|should)$/i.test(callee.object.name)
        ) {
          const method = callee.property.name;
          const [first, second] = node.arguments;
          if (ASSERT_PAIRWISE.has(method) && first && second && textOf(first) === textOf(second)) {
            report(node, `\`${textOf(first)}\` is compared against itself.`);
            return;
          }
          if (ASSERT_UNARY.has(method) && isConstantTruthy(first)) {
            report(node, `\`${textOf(first)}\` is a constant.`);
          }
          return;
        }

        // assert(true)
        if (callee.type === "Identifier" && callee.name === "assert" && isConstantTruthy(node.arguments[0])) {
          report(node, `\`${textOf(node.arguments[0])}\` is a constant.`);
        }
      },
    };
  },
};
