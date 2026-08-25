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
 * A suppression with no stated reason.
 *
 *   // @ts-expect-error
 *   // eslint-disable-next-line no-explicit-any
 *
 * A suppression is a claim: *the checker is wrong here.* Unaccompanied, it is a
 * claim with no evidence — the same defect the prose rules catch, expressed in
 * code. It is also the cheapest escape hatch an agent has, which is exactly why
 * it needs to cost one sentence.
 *
 * The rule never forbids suppressing. It requires the reason, because a
 * suppression nobody can evaluate is one nobody will ever remove.
 */

const DIRECTIVE =
  /^\s*(@ts-expect-error|@ts-ignore|@ts-nocheck|eslint-disable-next-line|eslint-disable-line|eslint-disable|oxlint-disable-next-line|oxlint-disable-line|oxlint-disable|biome-ignore|istanbul ignore|c8 ignore|v8 ignore)\b/;

/** Directives that name the rules they suppress before any explanation. */
const CARRIES_RULE_LIST = /^(eslint|oxlint|biome)/;

const MINIMUM_WORDS = 3;

export default {
  meta: {
    docs: { description: "Require a suppression comment to say why the checker is wrong." },
  },

  create(context) {
    return {
      Program() {
        for (const comment of context.sourceCode.getAllComments()) {
          const hit = DIRECTIVE.exec(comment.value);
          if (!hit) continue;

          const directive = hit[1];
          let residue = comment.value.slice(hit[0].length);

          // `-- reason` is the conventional separator once rules are listed.
          const separated = residue.indexOf("--");
          if (separated !== -1) residue = residue.slice(separated + 2);
          else if (CARRIES_RULE_LIST.test(directive)) {
            residue = residue.replace(/^[\s:]*[@a-z0-9/_-]+(\s*,\s*[@a-z0-9/_-]+)*/i, "");
          }

          const words = residue.replace(/[^\p{L}\p{N}\s'-]/gu, " ").split(/\s+/).filter((w) => w.length > 1);
          if (words.length >= MINIMUM_WORDS) continue;

          context.report({
            loc: comment.loc,
            message:
              `\`${directive}\` suppresses a checker without saying why it is wrong here. ` +
              `Do: add the reason after the directive — what the checker cannot see, in at least ${MINIMUM_WORDS} words. ` +
              "Never: pad it with words that restate the directive; a reason nobody can evaluate is one nobody will remove.",
          });
        }
      },
    };
  },
};
