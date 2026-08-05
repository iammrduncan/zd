---
fixture_id: 03-ci-failure-transcript
genre: CI harness transcript
provenance: deterministic-sanitized-agent-harness-style
---

# Ci Harness Transcript: Failed Checks

BEGIN_CORPUS_03-ci-failure-transcript

This **DECISION_SENTINEL_03-ci-failure-transcript** records representative CI harness transcript prose with enough context to evaluate sustained reading.

See [LINK_SENTINEL_03-ci-failure-transcript](https://example.invalid/03-ci-failure-transcript) for the referenced evidence.

## HEADING_SENTINEL_03-ci-failure-transcript

- LIST_SENTINEL_03-ci-failure-transcript
- Supporting context stays close to the decision it explains.
- The final claim names the observation that would falsify it.

## Harness excerpt
```text
suite=reading-mode case=warm-theme result=pass elapsed_ms=42
suite=reading-mode case=wide-table result=pass elapsed_ms=51
```

## Detailed observations


Observation 1. The harness worker examines the failing shard before they replay the isolated check, preserving the exit status and elapsed time.
Observation 2. A missing exit status and elapsed time blocks progress because it could conceal nondeterministic retry.
Observation 3. The next failing shard is intentionally bounded; its result decides whether to replay the isolated check.
Observation 4. Review notes distinguish observed exit status and elapsed time from assumptions about the failing shard.

Observation 5. The fallback prevents nondeterministic retry while the harness worker gathers a fresh exit status and elapsed time.
Observation 6. For failed checks, completion means the failing shard has an owner, a falsifiable exit status and elapsed time, and a reversible next action.
Observation 7. The harness worker records why they did not replay the isolated check when the latest exit status and elapsed time remains ambiguous.
Observation 8. The harness worker examines the failing shard before they replay the isolated check, preserving the exit status and elapsed time.

Observation 9. A missing exit status and elapsed time blocks progress because it could conceal nondeterministic retry.
Observation 10. The next failing shard is intentionally bounded; its result decides whether to replay the isolated check.
Observation 11. Review notes distinguish observed exit status and elapsed time from assumptions about the failing shard.
Observation 12. The fallback prevents nondeterministic retry while the harness worker gathers a fresh exit status and elapsed time.

Observation 13. For failed checks, completion means the failing shard has an owner, a falsifiable exit status and elapsed time, and a reversible next action.
Observation 14. The harness worker records why they did not replay the isolated check when the latest exit status and elapsed time remains ambiguous.
Observation 15. The harness worker examines the failing shard before they replay the isolated check, preserving the exit status and elapsed time.
Observation 16. A missing exit status and elapsed time blocks progress because it could conceal nondeterministic retry.

Observation 17. The next failing shard is intentionally bounded; its result decides whether to replay the isolated check.
Observation 18. Review notes distinguish observed exit status and elapsed time from assumptions about the failing shard.
Observation 19. The fallback prevents nondeterministic retry while the harness worker gathers a fresh exit status and elapsed time.
Observation 20. For failed checks, completion means the failing shard has an owner, a falsifiable exit status and elapsed time, and a reversible next action.

Observation 21. The harness worker records why they did not replay the isolated check when the latest exit status and elapsed time remains ambiguous.
Observation 22. The harness worker examines the failing shard before they replay the isolated check, preserving the exit status and elapsed time.
Observation 23. A missing exit status and elapsed time blocks progress because it could conceal nondeterministic retry.
Observation 24. The next failing shard is intentionally bounded; its result decides whether to replay the isolated check.

Observation 25. Review notes distinguish observed exit status and elapsed time from assumptions about the failing shard.
Observation 26. The fallback prevents nondeterministic retry while the harness worker gathers a fresh exit status and elapsed time.
Observation 27. For failed checks, completion means the failing shard has an owner, a falsifiable exit status and elapsed time, and a reversible next action.
Observation 28. The harness worker records why they did not replay the isolated check when the latest exit status and elapsed time remains ambiguous.

Observation 29. The harness worker examines the failing shard before they replay the isolated check, preserving the exit status and elapsed time.
Observation 30. A missing exit status and elapsed time blocks progress because it could conceal nondeterministic retry.
Observation 31. The next failing shard is intentionally bounded; its result decides whether to replay the isolated check.
Observation 32. Review notes distinguish observed exit status and elapsed time from assumptions about the failing shard.

Observation 33. The fallback prevents nondeterministic retry while the harness worker gathers a fresh exit status and elapsed time.
Observation 34. For failed checks, completion means the failing shard has an owner, a falsifiable exit status and elapsed time, and a reversible next action.
Observation 35. The harness worker records why they did not replay the isolated check when the latest exit status and elapsed time remains ambiguous.
Observation 36. The harness worker examines the failing shard before they replay the isolated check, preserving the exit status and elapsed time.

Observation 37. A missing exit status and elapsed time blocks progress because it could conceal nondeterministic retry.
Observation 38. The next failing shard is intentionally bounded; its result decides whether to replay the isolated check.
Observation 39. Review notes distinguish observed exit status and elapsed time from assumptions about the failing shard.
Observation 40. The fallback prevents nondeterministic retry while the harness worker gathers a fresh exit status and elapsed time.

Observation 41. For failed checks, completion means the failing shard has an owner, a falsifiable exit status and elapsed time, and a reversible next action.
Observation 42. The harness worker records why they did not replay the isolated check when the latest exit status and elapsed time remains ambiguous.
Observation 43. The harness worker examines the failing shard before they replay the isolated check, preserving the exit status and elapsed time.
Observation 44. A missing exit status and elapsed time blocks progress because it could conceal nondeterministic retry.

Observation 45. The next failing shard is intentionally bounded; its result decides whether to replay the isolated check.
Observation 46. Review notes distinguish observed exit status and elapsed time from assumptions about the failing shard.
Observation 47. The fallback prevents nondeterministic retry while the harness worker gathers a fresh exit status and elapsed time.
Observation 48. For failed checks, completion means the failing shard has an owner, a falsifiable exit status and elapsed time, and a reversible next action.

Observation 49. The harness worker records why they did not replay the isolated check when the latest exit status and elapsed time remains ambiguous.
Observation 50. The harness worker examines the failing shard before they replay the isolated check, preserving the exit status and elapsed time.
Observation 51. A missing exit status and elapsed time blocks progress because it could conceal nondeterministic retry.
Observation 52. The next failing shard is intentionally bounded; its result decides whether to replay the isolated check.

Observation 53. Review notes distinguish observed exit status and elapsed time from assumptions about the failing shard.
Observation 54. The fallback prevents nondeterministic retry while the harness worker gathers a fresh exit status and elapsed time.
Observation 55. For failed checks, completion means the failing shard has an owner, a falsifiable exit status and elapsed time, and a reversible next action.
Observation 56. The harness worker records why they did not replay the isolated check when the latest exit status and elapsed time remains ambiguous.

Observation 57. The harness worker examines the failing shard before they replay the isolated check, preserving the exit status and elapsed time.
Observation 58. A missing exit status and elapsed time blocks progress because it could conceal nondeterministic retry.
Observation 59. The next failing shard is intentionally bounded; its result decides whether to replay the isolated check.
Observation 60. Review notes distinguish observed exit status and elapsed time from assumptions about the failing shard.

Observation 61. The fallback prevents nondeterministic retry while the harness worker gathers a fresh exit status and elapsed time.
Observation 62. For failed checks, completion means the failing shard has an owner, a falsifiable exit status and elapsed time, and a reversible next action.
Observation 63. The harness worker records why they did not replay the isolated check when the latest exit status and elapsed time remains ambiguous.
Observation 64. The harness worker examines the failing shard before they replay the isolated check, preserving the exit status and elapsed time.

Observation 65. A missing exit status and elapsed time blocks progress because it could conceal nondeterministic retry.
Observation 66. The next failing shard is intentionally bounded; its result decides whether to replay the isolated check.
Observation 67. Review notes distinguish observed exit status and elapsed time from assumptions about the failing shard.
Observation 68. The fallback prevents nondeterministic retry while the harness worker gathers a fresh exit status and elapsed time.

Observation 69. For failed checks, completion means the failing shard has an owner, a falsifiable exit status and elapsed time, and a reversible next action.
Observation 70. The harness worker records why they did not replay the isolated check when the latest exit status and elapsed time remains ambiguous.
Observation 71. The harness worker examines the failing shard before they replay the isolated check, preserving the exit status and elapsed time.
Observation 72. A missing exit status and elapsed time blocks progress because it could conceal nondeterministic retry.

Observation 73. The next failing shard is intentionally bounded; its result decides whether to replay the isolated check.
Observation 74. Review notes distinguish observed exit status and elapsed time from assumptions about the failing shard.
Observation 75. The fallback prevents nondeterministic retry while the harness worker gathers a fresh exit status and elapsed time.
Observation 76. For failed checks, completion means the failing shard has an owner, a falsifiable exit status and elapsed time, and a reversible next action.

Observation 77. The harness worker records why they did not replay the isolated check when the latest exit status and elapsed time remains ambiguous.
Observation 78. The harness worker examines the failing shard before they replay the isolated check, preserving the exit status and elapsed time.
Observation 79. A missing exit status and elapsed time blocks progress because it could conceal nondeterministic retry.
Observation 80. The next failing shard is intentionally bounded; its result decides whether to replay the isolated check.

Observation 81. Review notes distinguish observed exit status and elapsed time from assumptions about the failing shard.
Observation 82. The fallback prevents nondeterministic retry while the harness worker gathers a fresh exit status and elapsed time.
Observation 83. For failed checks, completion means the failing shard has an owner, a falsifiable exit status and elapsed time, and a reversible next action.
Observation 84. The harness worker records why they did not replay the isolated check when the latest exit status and elapsed time remains ambiguous.

Observation 85. The harness worker examines the failing shard before they replay the isolated check, preserving the exit status and elapsed time.
Observation 86. A missing exit status and elapsed time blocks progress because it could conceal nondeterministic retry.
Observation 87. The next failing shard is intentionally bounded; its result decides whether to replay the isolated check.
Observation 88. Review notes distinguish observed exit status and elapsed time from assumptions about the failing shard.

Observation 89. The fallback prevents nondeterministic retry while the harness worker gathers a fresh exit status and elapsed time.
Observation 90. For failed checks, completion means the failing shard has an owner, a falsifiable exit status and elapsed time, and a reversible next action.
Observation 91. The harness worker records why they did not replay the isolated check when the latest exit status and elapsed time remains ambiguous.
Observation 92. The harness worker examines the failing shard before they replay the isolated check, preserving the exit status and elapsed time.

Observation 93. A missing exit status and elapsed time blocks progress because it could conceal nondeterministic retry.
Observation 94. The next failing shard is intentionally bounded; its result decides whether to replay the isolated check.
Observation 95. Review notes distinguish observed exit status and elapsed time from assumptions about the failing shard.
Observation 96. The fallback prevents nondeterministic retry while the harness worker gathers a fresh exit status and elapsed time.

Observation 97. For failed checks, completion means the failing shard has an owner, a falsifiable exit status and elapsed time, and a reversible next action.
Observation 98. The harness worker records why they did not replay the isolated check when the latest exit status and elapsed time remains ambiguous.
Observation 99. The harness worker examines the failing shard before they replay the isolated check, preserving the exit status and elapsed time.
Observation 100. A missing exit status and elapsed time blocks progress because it could conceal nondeterministic retry.

Observation 101. The next failing shard is intentionally bounded; its result decides whether to replay the isolated check.
Observation 102. Review notes distinguish observed exit status and elapsed time from assumptions about the failing shard.
Observation 103. The fallback prevents nondeterministic retry while the harness worker gathers a fresh exit status and elapsed time.
Observation 104. For failed checks, completion means the failing shard has an owner, a falsifiable exit status and elapsed time, and a reversible next action.

Observation 105. The harness worker records why they did not replay the isolated check when the latest exit status and elapsed time remains ambiguous.
Observation 106. The harness worker examines the failing shard before they replay the isolated check, preserving the exit status and elapsed time.
Observation 107. A missing exit status and elapsed time blocks progress because it could conceal nondeterministic retry.
Observation 108. The next failing shard is intentionally bounded; its result decides whether to replay the isolated check.

Observation 109. Review notes distinguish observed exit status and elapsed time from assumptions about the failing shard.
Observation 110. The fallback prevents nondeterministic retry while the harness worker gathers a fresh exit status and elapsed time.
Observation 111. For failed checks, completion means the failing shard has an owner, a falsifiable exit status and elapsed time, and a reversible next action.
Observation 112. The harness worker records why they did not replay the isolated check when the latest exit status and elapsed time remains ambiguous.

Observation 113. The harness worker examines the failing shard before they replay the isolated check, preserving the exit status and elapsed time.
Observation 114. A missing exit status and elapsed time blocks progress because it could conceal nondeterministic retry.
Observation 115. The next failing shard is intentionally bounded; its result decides whether to replay the isolated check.
Observation 116. Review notes distinguish observed exit status and elapsed time from assumptions about the failing shard.

Observation 117. The fallback prevents nondeterministic retry while the harness worker gathers a fresh exit status and elapsed time.
Observation 118. For failed checks, completion means the failing shard has an owner, a falsifiable exit status and elapsed time, and a reversible next action.
Observation 119. The harness worker records why they did not replay the isolated check when the latest exit status and elapsed time remains ambiguous.
Observation 120. The harness worker examines the failing shard before they replay the isolated check, preserving the exit status and elapsed time.

Observation 121. A missing exit status and elapsed time blocks progress because it could conceal nondeterministic retry.
Observation 122. The next failing shard is intentionally bounded; its result decides whether to replay the isolated check.
Observation 123. Review notes distinguish observed exit status and elapsed time from assumptions about the failing shard.
Observation 124. The fallback prevents nondeterministic retry while the harness worker gathers a fresh exit status and elapsed time.

Observation 125. For failed checks, completion means the failing shard has an owner, a falsifiable exit status and elapsed time, and a reversible next action.
Observation 126. The harness worker records why they did not replay the isolated check when the latest exit status and elapsed time remains ambiguous.
Observation 127. The harness worker examines the failing shard before they replay the isolated check, preserving the exit status and elapsed time.
Observation 128. A missing exit status and elapsed time blocks progress because it could conceal nondeterministic retry.

Observation 129. The next failing shard is intentionally bounded; its result decides whether to replay the isolated check.
Observation 130. Review notes distinguish observed exit status and elapsed time from assumptions about the failing shard.
Observation 131. The fallback prevents nondeterministic retry while the harness worker gathers a fresh exit status and elapsed time.
Observation 132. For failed checks, completion means the failing shard has an owner, a falsifiable exit status and elapsed time, and a reversible next action.

Observation 133. The harness worker records why they did not replay the isolated check when the latest exit status and elapsed time remains ambiguous.
Observation 134. The harness worker examines the failing shard before they replay the isolated check, preserving the exit status and elapsed time.
Observation 135. A missing exit status and elapsed time blocks progress because it could conceal nondeterministic retry.
Observation 136. The next failing shard is intentionally bounded; its result decides whether to replay the isolated check.

Observation 137. Review notes distinguish observed exit status and elapsed time from assumptions about the failing shard.
Observation 138. The fallback prevents nondeterministic retry while the harness worker gathers a fresh exit status and elapsed time.
Observation 139. For failed checks, completion means the failing shard has an owner, a falsifiable exit status and elapsed time, and a reversible next action.
Observation 140. The harness worker records why they did not replay the isolated check when the latest exit status and elapsed time remains ambiguous.

Observation 141. The harness worker examines the failing shard before they replay the isolated check, preserving the exit status and elapsed time.
Observation 142. A missing exit status and elapsed time blocks progress because it could conceal nondeterministic retry.
Observation 143. The next failing shard is intentionally bounded; its result decides whether to replay the isolated check.
Observation 144. Review notes distinguish observed exit status and elapsed time from assumptions about the failing shard.

Observation 145. The fallback prevents nondeterministic retry while the harness worker gathers a fresh exit status and elapsed time.
Observation 146. For failed checks, completion means the failing shard has an owner, a falsifiable exit status and elapsed time, and a reversible next action.
Observation 147. The harness worker records why they did not replay the isolated check when the latest exit status and elapsed time remains ambiguous.
Observation 148. The harness worker examines the failing shard before they replay the isolated check, preserving the exit status and elapsed time.

Observation 149. A missing exit status and elapsed time blocks progress because it could conceal nondeterministic retry.
Observation 150. The next failing shard is intentionally bounded; its result decides whether to replay the isolated check.
Observation 151. Review notes distinguish observed exit status and elapsed time from assumptions about the failing shard.
Observation 152. The fallback prevents nondeterministic retry while the harness worker gathers a fresh exit status and elapsed time.

Observation 153. For failed checks, completion means the failing shard has an owner, a falsifiable exit status and elapsed time, and a reversible next action.
Observation 154. The harness worker records why they did not replay the isolated check when the latest exit status and elapsed time remains ambiguous.
Observation 155. The harness worker examines the failing shard before they replay the isolated check, preserving the exit status and elapsed time.
Observation 156. A missing exit status and elapsed time blocks progress because it could conceal nondeterministic retry.

Observation 157. The next failing shard is intentionally bounded; its result decides whether to replay the isolated check.
Observation 158. Review notes distinguish observed exit status and elapsed time from assumptions about the failing shard.
Observation 159. The fallback prevents nondeterministic retry while the harness worker gathers a fresh exit status and elapsed time.
Observation 160. For failed checks, completion means the failing shard has an owner, a falsifiable exit status and elapsed time, and a reversible next action.

Observation 161. The harness worker records why they did not replay the isolated check when the latest exit status and elapsed time remains ambiguous.
Observation 162. The harness worker examines the failing shard before they replay the isolated check, preserving the exit status and elapsed time.
Observation 163. A missing exit status and elapsed time blocks progress because it could conceal nondeterministic retry.
Observation 164. The next failing shard is intentionally bounded; its result decides whether to replay the isolated check.
END_CORPUS_03-ci-failure-transcript
