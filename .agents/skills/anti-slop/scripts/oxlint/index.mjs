/**
 * anti-slop — an Oxlint plugin.
 *
 * Twenty rules, one idea: **reject what looks like evidence and is not.**
 *
 * Five are about evidence theatre in tests and error handling:
 *
 *   no-tautological-assertion    an assertion that cannot fail
 *   no-disabled-test             a test committed switched off
 *   no-swallowed-error           a failure caught and discarded
 *   no-placeholder-body          a stub with a finished-looking signature
 *   require-suppression-reason   a claim the checker is wrong, with no reason
 *
 * Fifteen are about evidence thrown away in the type system. They are adapted
 * from dmmulroy/anti-slop, carry its MIT license in each rule file, and need no
 * dependency beyond Oxlint itself.
 *
 * Wiring, in the target project's oxlint config:
 *
 *   {
 *     "jsPlugins": ["./tools/anti-slop/index.mjs"],
 *     "rules": { "anti-slop/no-unknown-returns": "error" }
 *   }
 *
 * Every rule is independently toggleable, and none is on until it is named.
 */

import noChainedTypeAssertions from "./rules/no-chained-type-assertions.mjs";
import noConditionalEmptyObjectSpread from "./rules/no-conditional-empty-object-spread.mjs";
import noDisabledTest from "./rules/no-disabled-test.mjs";
import noKnownValueWidening from "./rules/no-known-value-widening.mjs";
import noModuleMocking from "./rules/no-module-mocking.mjs";
import noObjectParameters from "./rules/no-object-parameters.mjs";
import noPlaceholderBody from "./rules/no-placeholder-body.mjs";
import noReflectApply from "./rules/no-reflect-apply.mjs";
import noReflectGet from "./rules/no-reflect-get.mjs";
import noRuntimeTypeof from "./rules/no-runtime-typeof.mjs";
import noShapeInSymbolNames from "./rules/no-shape-in-symbol-names.mjs";
import noSwallowedError from "./rules/no-swallowed-error.mjs";
import noTautologicalAssertion from "./rules/no-tautological-assertion.mjs";
import noUnknownParameters from "./rules/no-unknown-parameters.mjs";
import noUnknownReturns from "./rules/no-unknown-returns.mjs";
import noUnknownTypeAliases from "./rules/no-unknown-type-aliases.mjs";
import noUnsafeDictionaryType from "./rules/no-unsafe-dictionary-type.mjs";
import noWidenThenAssert from "./rules/no-widen-then-assert.mjs";
import requireSafetyCommentForTypeAssertion from "./rules/require-safety-comment-for-type-assertion.mjs";
import requireSuppressionReason from "./rules/require-suppression-reason.mjs";

export const RULES = {
  "no-chained-type-assertions": noChainedTypeAssertions,
  "no-conditional-empty-object-spread": noConditionalEmptyObjectSpread,
  "no-disabled-test": noDisabledTest,
  "no-known-value-widening": noKnownValueWidening,
  "no-module-mocking": noModuleMocking,
  "no-object-parameters": noObjectParameters,
  "no-placeholder-body": noPlaceholderBody,
  "no-reflect-apply": noReflectApply,
  "no-reflect-get": noReflectGet,
  "no-runtime-typeof": noRuntimeTypeof,
  "no-shape-in-symbol-names": noShapeInSymbolNames,
  "no-swallowed-error": noSwallowedError,
  "no-tautological-assertion": noTautologicalAssertion,
  "no-unknown-parameters": noUnknownParameters,
  "no-unknown-returns": noUnknownReturns,
  "no-unknown-type-aliases": noUnknownTypeAliases,
  "no-unsafe-dictionary-type": noUnsafeDictionaryType,
  "no-widen-then-assert": noWidenThenAssert,
  "require-safety-comment-for-type-assertion": requireSafetyCommentForTypeAssertion,
  "require-suppression-reason": requireSuppressionReason,
};

export default {
  meta: { name: "anti-slop" },
  rules: RULES,
};
