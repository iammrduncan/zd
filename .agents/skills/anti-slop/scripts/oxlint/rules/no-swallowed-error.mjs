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
 * An error caught and thrown away.
 *
 * Two shapes, both of which destroy the only evidence anyone will ever have
 * about a failure:
 *
 *   catch (e) { }              the failure never happened, as far as the logs know
 *   catch (e) { return null }  the error was named, then ignored
 *
 * The second is the tell. Binding the error means the author intended to use it.
 * A catch that never mentions its own binding and never rethrows discarded
 * something on purpose and left no note.
 *
 * `catch { return fallback }` with no binding is left alone: that is a
 * deliberate, readable fallback, not a swallowed error.
 */

export default {
  meta: {
    docs: { description: "Reject a catch block that discards the error it caught." },
  },

  create(context) {
    const source = context.sourceCode;

    return {
      CatchClause(node) {
        const body = node.body.body;

        if (body.length === 0) {
          context.report({
            node,
            message:
              "This catch block is empty, so the failure leaves no trace anywhere. " +
              "Do: log the error, rethrow it, or return a value that records that it happened. " +
              "Never: leave the block empty with a comment saying the error is safe to ignore — say it in the returned value.",
          });
          return;
        }

        // Only judge a catch that bound the error. An unbound `catch {}` with a
        // real body is a deliberate fallback.
        if (!node.param || node.param.type !== "Identifier") return;

        const name = node.param.name;
        const bodyText = source.getText(node.body);
        const used = new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(
          bodyText.slice(bodyText.indexOf("{") + 1),
        );
        if (used) return;
        if (/\bthrow\b/.test(bodyText)) return;

        context.report({
          node,
          message:
            `\`${name}\` is bound here and never used, so the reason for the failure is discarded. ` +
            "Do: include the error in what you log, return, or throw. " +
            `Never: drop the binding to silence this rule — write \`catch {}\` only when the error genuinely does not matter.`,
        });
      },
    };
  },
};
