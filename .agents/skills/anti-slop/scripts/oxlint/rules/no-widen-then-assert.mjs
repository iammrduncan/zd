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
 * A value widened to a top type, then asserted back.
 *
 *   const raw: unknown = { id: "1" };
 *   const user = raw as User;
 *
 * Both halves are visible in one file: the evidence was there, it was thrown
 * away, and the assertion puts back a claim that is no longer checked. A value
 * that was never known — `JSON.parse` output, say — is a different problem, and
 * `require-safety-comment-for-type-assertion` covers it.
 */

import { advice, isTopType, resolveVariable, soleDeclarator, unwrapType } from "../shared.mjs";
import { isKnownValue } from "./no-known-value-widening.mjs";

const isConstAssertion = (type) => {
  const t = unwrapType(type);
  return !!t && t.type === "TSTypeReference" && t.typeName && t.typeName.name === "const";
};

export default {
  meta: { docs: { description: "Disallow asserting a value back after widening it." } },
  create(context) {
    const source = context.sourceCode;
    return {
      TSAsExpression(node) {
        if (isConstAssertion(node.typeAnnotation)) return;
        let target = node.expression;
        while (target && target.type === "ParenthesizedExpression") target = target.expression;
        if (!target || target.type !== "Identifier") return;

        const variable = resolveVariable(source, target);
        const declarator = soleDeclarator(variable);
        if (!declarator) return;

        const annotation =
          declarator.id && declarator.id.typeAnnotation && declarator.id.typeAnnotation.typeAnnotation;
        if (!annotation || !isTopType(annotation)) return;
        if (!isKnownValue(declarator.init)) return;

        context.report({
          node,
          message: advice(
            `\`${target.name}\` was widened where it was declared, and is asserted back here.`,
            "delete the widening annotation and let the value keep the type it already had.",
            "do not move the assertion closer to the declaration — remove the round trip, not its distance.",
          ),
        });
      },
    };
  },
};
