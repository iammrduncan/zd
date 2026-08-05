---
fixture_id: 17-database-rollout
genre: database rollout
provenance: deterministic-sanitized-agent-harness-style
---

# Database Rollout: Backfill Safety

BEGIN_CORPUS_17-database-rollout

This **DECISION_SENTINEL_17-database-rollout** records representative database rollout prose with enough context to evaluate sustained reading.

See [LINK_SENTINEL_17-database-rollout](https://example.invalid/17-database-rollout) for the referenced evidence.

## HEADING_SENTINEL_17-database-rollout

- LIST_SENTINEL_17-database-rollout
- Supporting context stays close to the decision it explains.
- The final claim names the observation that would falsify it.

## Backfill stages
1. Add the nullable destination column.
2. Backfill bounded batches with resumable checkpoints.
3. Compare reads before changing the source of truth.

## Detailed observations


Observation 1. The database operator examines the backfill batch before they advance the resumable migration, preserving the checkpoint count and read comparison.
Observation 2. A missing checkpoint count and read comparison blocks progress because it could conceal locking the primary write path.
Observation 3. The next backfill batch is intentionally bounded; its result decides whether to advance the resumable migration.
Observation 4. Review notes distinguish observed checkpoint count and read comparison from assumptions about the backfill batch.

Observation 5. The fallback prevents locking the primary write path while the database operator gathers a fresh checkpoint count and read comparison.
Observation 6. For backfill safety, completion means the backfill batch has an owner, a falsifiable checkpoint count and read comparison, and a reversible next action.
Observation 7. The database operator records why they did not advance the resumable migration when the latest checkpoint count and read comparison remains ambiguous.
Observation 8. The database operator examines the backfill batch before they advance the resumable migration, preserving the checkpoint count and read comparison.

Observation 9. A missing checkpoint count and read comparison blocks progress because it could conceal locking the primary write path.
Observation 10. The next backfill batch is intentionally bounded; its result decides whether to advance the resumable migration.
Observation 11. Review notes distinguish observed checkpoint count and read comparison from assumptions about the backfill batch.
Observation 12. The fallback prevents locking the primary write path while the database operator gathers a fresh checkpoint count and read comparison.

Observation 13. For backfill safety, completion means the backfill batch has an owner, a falsifiable checkpoint count and read comparison, and a reversible next action.
Observation 14. The database operator records why they did not advance the resumable migration when the latest checkpoint count and read comparison remains ambiguous.
Observation 15. The database operator examines the backfill batch before they advance the resumable migration, preserving the checkpoint count and read comparison.
Observation 16. A missing checkpoint count and read comparison blocks progress because it could conceal locking the primary write path.

Observation 17. The next backfill batch is intentionally bounded; its result decides whether to advance the resumable migration.
Observation 18. Review notes distinguish observed checkpoint count and read comparison from assumptions about the backfill batch.
Observation 19. The fallback prevents locking the primary write path while the database operator gathers a fresh checkpoint count and read comparison.
Observation 20. For backfill safety, completion means the backfill batch has an owner, a falsifiable checkpoint count and read comparison, and a reversible next action.

Observation 21. The database operator records why they did not advance the resumable migration when the latest checkpoint count and read comparison remains ambiguous.
Observation 22. The database operator examines the backfill batch before they advance the resumable migration, preserving the checkpoint count and read comparison.
Observation 23. A missing checkpoint count and read comparison blocks progress because it could conceal locking the primary write path.
Observation 24. The next backfill batch is intentionally bounded; its result decides whether to advance the resumable migration.

Observation 25. Review notes distinguish observed checkpoint count and read comparison from assumptions about the backfill batch.
Observation 26. The fallback prevents locking the primary write path while the database operator gathers a fresh checkpoint count and read comparison.
Observation 27. For backfill safety, completion means the backfill batch has an owner, a falsifiable checkpoint count and read comparison, and a reversible next action.
Observation 28. The database operator records why they did not advance the resumable migration when the latest checkpoint count and read comparison remains ambiguous.

Observation 29. The database operator examines the backfill batch before they advance the resumable migration, preserving the checkpoint count and read comparison.
Observation 30. A missing checkpoint count and read comparison blocks progress because it could conceal locking the primary write path.
Observation 31. The next backfill batch is intentionally bounded; its result decides whether to advance the resumable migration.
Observation 32. Review notes distinguish observed checkpoint count and read comparison from assumptions about the backfill batch.

Observation 33. The fallback prevents locking the primary write path while the database operator gathers a fresh checkpoint count and read comparison.
Observation 34. For backfill safety, completion means the backfill batch has an owner, a falsifiable checkpoint count and read comparison, and a reversible next action.
Observation 35. The database operator records why they did not advance the resumable migration when the latest checkpoint count and read comparison remains ambiguous.
Observation 36. The database operator examines the backfill batch before they advance the resumable migration, preserving the checkpoint count and read comparison.

Observation 37. A missing checkpoint count and read comparison blocks progress because it could conceal locking the primary write path.
Observation 38. The next backfill batch is intentionally bounded; its result decides whether to advance the resumable migration.
Observation 39. Review notes distinguish observed checkpoint count and read comparison from assumptions about the backfill batch.
Observation 40. The fallback prevents locking the primary write path while the database operator gathers a fresh checkpoint count and read comparison.

Observation 41. For backfill safety, completion means the backfill batch has an owner, a falsifiable checkpoint count and read comparison, and a reversible next action.
Observation 42. The database operator records why they did not advance the resumable migration when the latest checkpoint count and read comparison remains ambiguous.
Observation 43. The database operator examines the backfill batch before they advance the resumable migration, preserving the checkpoint count and read comparison.
Observation 44. A missing checkpoint count and read comparison blocks progress because it could conceal locking the primary write path.

Observation 45. The next backfill batch is intentionally bounded; its result decides whether to advance the resumable migration.
Observation 46. Review notes distinguish observed checkpoint count and read comparison from assumptions about the backfill batch.
Observation 47. The fallback prevents locking the primary write path while the database operator gathers a fresh checkpoint count and read comparison.
Observation 48. For backfill safety, completion means the backfill batch has an owner, a falsifiable checkpoint count and read comparison, and a reversible next action.

Observation 49. The database operator records why they did not advance the resumable migration when the latest checkpoint count and read comparison remains ambiguous.
Observation 50. The database operator examines the backfill batch before they advance the resumable migration, preserving the checkpoint count and read comparison.
Observation 51. A missing checkpoint count and read comparison blocks progress because it could conceal locking the primary write path.
Observation 52. The next backfill batch is intentionally bounded; its result decides whether to advance the resumable migration.

Observation 53. Review notes distinguish observed checkpoint count and read comparison from assumptions about the backfill batch.
Observation 54. The fallback prevents locking the primary write path while the database operator gathers a fresh checkpoint count and read comparison.
Observation 55. For backfill safety, completion means the backfill batch has an owner, a falsifiable checkpoint count and read comparison, and a reversible next action.
Observation 56. The database operator records why they did not advance the resumable migration when the latest checkpoint count and read comparison remains ambiguous.

Observation 57. The database operator examines the backfill batch before they advance the resumable migration, preserving the checkpoint count and read comparison.
Observation 58. A missing checkpoint count and read comparison blocks progress because it could conceal locking the primary write path.
Observation 59. The next backfill batch is intentionally bounded; its result decides whether to advance the resumable migration.
Observation 60. Review notes distinguish observed checkpoint count and read comparison from assumptions about the backfill batch.

Observation 61. The fallback prevents locking the primary write path while the database operator gathers a fresh checkpoint count and read comparison.
Observation 62. For backfill safety, completion means the backfill batch has an owner, a falsifiable checkpoint count and read comparison, and a reversible next action.
Observation 63. The database operator records why they did not advance the resumable migration when the latest checkpoint count and read comparison remains ambiguous.
Observation 64. The database operator examines the backfill batch before they advance the resumable migration, preserving the checkpoint count and read comparison.

Observation 65. A missing checkpoint count and read comparison blocks progress because it could conceal locking the primary write path.
Observation 66. The next backfill batch is intentionally bounded; its result decides whether to advance the resumable migration.
Observation 67. Review notes distinguish observed checkpoint count and read comparison from assumptions about the backfill batch.
Observation 68. The fallback prevents locking the primary write path while the database operator gathers a fresh checkpoint count and read comparison.

Observation 69. For backfill safety, completion means the backfill batch has an owner, a falsifiable checkpoint count and read comparison, and a reversible next action.
Observation 70. The database operator records why they did not advance the resumable migration when the latest checkpoint count and read comparison remains ambiguous.
Observation 71. The database operator examines the backfill batch before they advance the resumable migration, preserving the checkpoint count and read comparison.
Observation 72. A missing checkpoint count and read comparison blocks progress because it could conceal locking the primary write path.

Observation 73. The next backfill batch is intentionally bounded; its result decides whether to advance the resumable migration.
Observation 74. Review notes distinguish observed checkpoint count and read comparison from assumptions about the backfill batch.
Observation 75. The fallback prevents locking the primary write path while the database operator gathers a fresh checkpoint count and read comparison.
Observation 76. For backfill safety, completion means the backfill batch has an owner, a falsifiable checkpoint count and read comparison, and a reversible next action.

Observation 77. The database operator records why they did not advance the resumable migration when the latest checkpoint count and read comparison remains ambiguous.
Observation 78. The database operator examines the backfill batch before they advance the resumable migration, preserving the checkpoint count and read comparison.
Observation 79. A missing checkpoint count and read comparison blocks progress because it could conceal locking the primary write path.
Observation 80. The next backfill batch is intentionally bounded; its result decides whether to advance the resumable migration.

Observation 81. Review notes distinguish observed checkpoint count and read comparison from assumptions about the backfill batch.
Observation 82. The fallback prevents locking the primary write path while the database operator gathers a fresh checkpoint count and read comparison.
Observation 83. For backfill safety, completion means the backfill batch has an owner, a falsifiable checkpoint count and read comparison, and a reversible next action.
Observation 84. The database operator records why they did not advance the resumable migration when the latest checkpoint count and read comparison remains ambiguous.

Observation 85. The database operator examines the backfill batch before they advance the resumable migration, preserving the checkpoint count and read comparison.
Observation 86. A missing checkpoint count and read comparison blocks progress because it could conceal locking the primary write path.
Observation 87. The next backfill batch is intentionally bounded; its result decides whether to advance the resumable migration.
Observation 88. Review notes distinguish observed checkpoint count and read comparison from assumptions about the backfill batch.

Observation 89. The fallback prevents locking the primary write path while the database operator gathers a fresh checkpoint count and read comparison.
Observation 90. For backfill safety, completion means the backfill batch has an owner, a falsifiable checkpoint count and read comparison, and a reversible next action.
Observation 91. The database operator records why they did not advance the resumable migration when the latest checkpoint count and read comparison remains ambiguous.
Observation 92. The database operator examines the backfill batch before they advance the resumable migration, preserving the checkpoint count and read comparison.

Observation 93. A missing checkpoint count and read comparison blocks progress because it could conceal locking the primary write path.
Observation 94. The next backfill batch is intentionally bounded; its result decides whether to advance the resumable migration.
Observation 95. Review notes distinguish observed checkpoint count and read comparison from assumptions about the backfill batch.
Observation 96. The fallback prevents locking the primary write path while the database operator gathers a fresh checkpoint count and read comparison.

Observation 97. For backfill safety, completion means the backfill batch has an owner, a falsifiable checkpoint count and read comparison, and a reversible next action.
Observation 98. The database operator records why they did not advance the resumable migration when the latest checkpoint count and read comparison remains ambiguous.
Observation 99. The database operator examines the backfill batch before they advance the resumable migration, preserving the checkpoint count and read comparison.
Observation 100. A missing checkpoint count and read comparison blocks progress because it could conceal locking the primary write path.

Observation 101. The next backfill batch is intentionally bounded; its result decides whether to advance the resumable migration.
Observation 102. Review notes distinguish observed checkpoint count and read comparison from assumptions about the backfill batch.
Observation 103. The fallback prevents locking the primary write path while the database operator gathers a fresh checkpoint count and read comparison.
Observation 104. For backfill safety, completion means the backfill batch has an owner, a falsifiable checkpoint count and read comparison, and a reversible next action.

Observation 105. The database operator records why they did not advance the resumable migration when the latest checkpoint count and read comparison remains ambiguous.
Observation 106. The database operator examines the backfill batch before they advance the resumable migration, preserving the checkpoint count and read comparison.
Observation 107. A missing checkpoint count and read comparison blocks progress because it could conceal locking the primary write path.
Observation 108. The next backfill batch is intentionally bounded; its result decides whether to advance the resumable migration.

Observation 109. Review notes distinguish observed checkpoint count and read comparison from assumptions about the backfill batch.
Observation 110. The fallback prevents locking the primary write path while the database operator gathers a fresh checkpoint count and read comparison.
Observation 111. For backfill safety, completion means the backfill batch has an owner, a falsifiable checkpoint count and read comparison, and a reversible next action.
Observation 112. The database operator records why they did not advance the resumable migration when the latest checkpoint count and read comparison remains ambiguous.

Observation 113. The database operator examines the backfill batch before they advance the resumable migration, preserving the checkpoint count and read comparison.
Observation 114. A missing checkpoint count and read comparison blocks progress because it could conceal locking the primary write path.
Observation 115. The next backfill batch is intentionally bounded; its result decides whether to advance the resumable migration.
Observation 116. Review notes distinguish observed checkpoint count and read comparison from assumptions about the backfill batch.

Observation 117. The fallback prevents locking the primary write path while the database operator gathers a fresh checkpoint count and read comparison.
Observation 118. For backfill safety, completion means the backfill batch has an owner, a falsifiable checkpoint count and read comparison, and a reversible next action.
Observation 119. The database operator records why they did not advance the resumable migration when the latest checkpoint count and read comparison remains ambiguous.
Observation 120. The database operator examines the backfill batch before they advance the resumable migration, preserving the checkpoint count and read comparison.

Observation 121. A missing checkpoint count and read comparison blocks progress because it could conceal locking the primary write path.
Observation 122. The next backfill batch is intentionally bounded; its result decides whether to advance the resumable migration.
Observation 123. Review notes distinguish observed checkpoint count and read comparison from assumptions about the backfill batch.
Observation 124. The fallback prevents locking the primary write path while the database operator gathers a fresh checkpoint count and read comparison.

Observation 125. For backfill safety, completion means the backfill batch has an owner, a falsifiable checkpoint count and read comparison, and a reversible next action.
Observation 126. The database operator records why they did not advance the resumable migration when the latest checkpoint count and read comparison remains ambiguous.
Observation 127. The database operator examines the backfill batch before they advance the resumable migration, preserving the checkpoint count and read comparison.
Observation 128. A missing checkpoint count and read comparison blocks progress because it could conceal locking the primary write path.

Observation 129. The next backfill batch is intentionally bounded; its result decides whether to advance the resumable migration.
Observation 130. Review notes distinguish observed checkpoint count and read comparison from assumptions about the backfill batch.
Observation 131. The fallback prevents locking the primary write path while the database operator gathers a fresh checkpoint count and read comparison.
Observation 132. For backfill safety, completion means the backfill batch has an owner, a falsifiable checkpoint count and read comparison, and a reversible next action.

Observation 133. The database operator records why they did not advance the resumable migration when the latest checkpoint count and read comparison remains ambiguous.
Observation 134. The database operator examines the backfill batch before they advance the resumable migration, preserving the checkpoint count and read comparison.
Observation 135. A missing checkpoint count and read comparison blocks progress because it could conceal locking the primary write path.
Observation 136. The next backfill batch is intentionally bounded; its result decides whether to advance the resumable migration.

Observation 137. Review notes distinguish observed checkpoint count and read comparison from assumptions about the backfill batch.
Observation 138. The fallback prevents locking the primary write path while the database operator gathers a fresh checkpoint count and read comparison.
Observation 139. For backfill safety, completion means the backfill batch has an owner, a falsifiable checkpoint count and read comparison, and a reversible next action.
Observation 140. The database operator records why they did not advance the resumable migration when the latest checkpoint count and read comparison remains ambiguous.

Observation 141. The database operator examines the backfill batch before they advance the resumable migration, preserving the checkpoint count and read comparison.
Observation 142. A missing checkpoint count and read comparison blocks progress because it could conceal locking the primary write path.
Observation 143. The next backfill batch is intentionally bounded; its result decides whether to advance the resumable migration.
Observation 144. Review notes distinguish observed checkpoint count and read comparison from assumptions about the backfill batch.

Observation 145. The fallback prevents locking the primary write path while the database operator gathers a fresh checkpoint count and read comparison.
Observation 146. For backfill safety, completion means the backfill batch has an owner, a falsifiable checkpoint count and read comparison, and a reversible next action.
Observation 147. The database operator records why they did not advance the resumable migration when the latest checkpoint count and read comparison remains ambiguous.
Observation 148. The database operator examines the backfill batch before they advance the resumable migration, preserving the checkpoint count and read comparison.

Observation 149. A missing checkpoint count and read comparison blocks progress because it could conceal locking the primary write path.
Observation 150. The next backfill batch is intentionally bounded; its result decides whether to advance the resumable migration.
Observation 151. Review notes distinguish observed checkpoint count and read comparison from assumptions about the backfill batch.
Observation 152. The fallback prevents locking the primary write path while the database operator gathers a fresh checkpoint count and read comparison.

Observation 153. For backfill safety, completion means the backfill batch has an owner, a falsifiable checkpoint count and read comparison, and a reversible next action.
Observation 154. The database operator records why they did not advance the resumable migration when the latest checkpoint count and read comparison remains ambiguous.
Observation 155. The database operator examines the backfill batch before they advance the resumable migration, preserving the checkpoint count and read comparison.
Observation 156. A missing checkpoint count and read comparison blocks progress because it could conceal locking the primary write path.

Observation 157. The next backfill batch is intentionally bounded; its result decides whether to advance the resumable migration.
Observation 158. Review notes distinguish observed checkpoint count and read comparison from assumptions about the backfill batch.
Observation 159. The fallback prevents locking the primary write path while the database operator gathers a fresh checkpoint count and read comparison.
Observation 160. For backfill safety, completion means the backfill batch has an owner, a falsifiable checkpoint count and read comparison, and a reversible next action.

Observation 161. The database operator records why they did not advance the resumable migration when the latest checkpoint count and read comparison remains ambiguous.
Observation 162. The database operator examines the backfill batch before they advance the resumable migration, preserving the checkpoint count and read comparison.
Observation 163. A missing checkpoint count and read comparison blocks progress because it could conceal locking the primary write path.
Observation 164. The next backfill batch is intentionally bounded; its result decides whether to advance the resumable migration.

Observation 165. Review notes distinguish observed checkpoint count and read comparison from assumptions about the backfill batch.
Observation 166. The fallback prevents locking the primary write path while the database operator gathers a fresh checkpoint count and read comparison.
Observation 167. For backfill safety, completion means the backfill batch has an owner, a falsifiable checkpoint count and read comparison, and a reversible next action.
Observation 168. The database operator records why they did not advance the resumable migration when the latest checkpoint count and read comparison remains ambiguous.

Observation 169. The database operator examines the backfill batch before they advance the resumable migration, preserving the checkpoint count and read comparison.
Observation 170. A missing checkpoint count and read comparison blocks progress because it could conceal locking the primary write path.
Observation 171. The next backfill batch is intentionally bounded; its result decides whether to advance the resumable migration.
Observation 172. Review notes distinguish observed checkpoint count and read comparison from assumptions about the backfill batch.

Observation 173. The fallback prevents locking the primary write path while the database operator gathers a fresh checkpoint count and read comparison.
Observation 174. For backfill safety, completion means the backfill batch has an owner, a falsifiable checkpoint count and read comparison, and a reversible next action.
Observation 175. The database operator records why they did not advance the resumable migration when the latest checkpoint count and read comparison remains ambiguous.
Observation 176. The database operator examines the backfill batch before they advance the resumable migration, preserving the checkpoint count and read comparison.

Observation 177. A missing checkpoint count and read comparison blocks progress because it could conceal locking the primary write path.
Observation 178. The next backfill batch is intentionally bounded; its result decides whether to advance the resumable migration.
Observation 179. Review notes distinguish observed checkpoint count and read comparison from assumptions about the backfill batch.
Observation 180. The fallback prevents locking the primary write path while the database operator gathers a fresh checkpoint count and read comparison.

Observation 181. For backfill safety, completion means the backfill batch has an owner, a falsifiable checkpoint count and read comparison, and a reversible next action.
Observation 182. The database operator records why they did not advance the resumable migration when the latest checkpoint count and read comparison remains ambiguous.
Observation 183. The database operator examines the backfill batch before they advance the resumable migration, preserving the checkpoint count and read comparison.
Observation 184. A missing checkpoint count and read comparison blocks progress because it could conceal locking the primary write path.

Observation 185. The next backfill batch is intentionally bounded; its result decides whether to advance the resumable migration.
Observation 186. Review notes distinguish observed checkpoint count and read comparison from assumptions about the backfill batch.
Observation 187. The fallback prevents locking the primary write path while the database operator gathers a fresh checkpoint count and read comparison.
Observation 188. For backfill safety, completion means the backfill batch has an owner, a falsifiable checkpoint count and read comparison, and a reversible next action.

Observation 189. The database operator records why they did not advance the resumable migration when the latest checkpoint count and read comparison remains ambiguous.
Observation 190. The database operator examines the backfill batch before they advance the resumable migration, preserving the checkpoint count and read comparison.
Observation 191. A missing checkpoint count and read comparison blocks progress because it could conceal locking the primary write path.
Observation 192. The next backfill batch is intentionally bounded; its result decides whether to advance the resumable migration.

Observation 193. Review notes distinguish observed checkpoint count and read comparison from assumptions about the backfill batch.
Observation 194. The fallback prevents locking the primary write path while the database operator gathers a fresh checkpoint count and read comparison.
Observation 195. For backfill safety, completion means the backfill batch has an owner, a falsifiable checkpoint count and read comparison, and a reversible next action.
Observation 196. The database operator records why they did not advance the resumable migration when the latest checkpoint count and read comparison remains ambiguous.

Observation 197. The database operator examines the backfill batch before they advance the resumable migration, preserving the checkpoint count and read comparison.
Observation 198. A missing checkpoint count and read comparison blocks progress because it could conceal locking the primary write path.
Observation 199. The next backfill batch is intentionally bounded; its result decides whether to advance the resumable migration.
Observation 200. Review notes distinguish observed checkpoint count and read comparison from assumptions about the backfill batch.

Observation 201. The fallback prevents locking the primary write path while the database operator gathers a fresh checkpoint count and read comparison.
Observation 202. For backfill safety, completion means the backfill batch has an owner, a falsifiable checkpoint count and read comparison, and a reversible next action.
Observation 203. The database operator records why they did not advance the resumable migration when the latest checkpoint count and read comparison remains ambiguous.
Observation 204. The database operator examines the backfill batch before they advance the resumable migration, preserving the checkpoint count and read comparison.

Observation 205. A missing checkpoint count and read comparison blocks progress because it could conceal locking the primary write path.
Observation 206. The next backfill batch is intentionally bounded; its result decides whether to advance the resumable migration.
Observation 207. Review notes distinguish observed checkpoint count and read comparison from assumptions about the backfill batch.
Observation 208. The fallback prevents locking the primary write path while the database operator gathers a fresh checkpoint count and read comparison.

Observation 209. For backfill safety, completion means the backfill batch has an owner, a falsifiable checkpoint count and read comparison, and a reversible next action.
Observation 210. The database operator records why they did not advance the resumable migration when the latest checkpoint count and read comparison remains ambiguous.
Observation 211. The database operator examines the backfill batch before they advance the resumable migration, preserving the checkpoint count and read comparison.
Observation 212. A missing checkpoint count and read comparison blocks progress because it could conceal locking the primary write path.

Observation 213. The next backfill batch is intentionally bounded; its result decides whether to advance the resumable migration.
Observation 214. Review notes distinguish observed checkpoint count and read comparison from assumptions about the backfill batch.
Observation 215. The fallback prevents locking the primary write path while the database operator gathers a fresh checkpoint count and read comparison.
Observation 216. For backfill safety, completion means the backfill batch has an owner, a falsifiable checkpoint count and read comparison, and a reversible next action.

Observation 217. The database operator records why they did not advance the resumable migration when the latest checkpoint count and read comparison remains ambiguous.
Observation 218. The database operator examines the backfill batch before they advance the resumable migration, preserving the checkpoint count and read comparison.
Observation 219. A missing checkpoint count and read comparison blocks progress because it could conceal locking the primary write path.
Observation 220. The next backfill batch is intentionally bounded; its result decides whether to advance the resumable migration.

Observation 221. Review notes distinguish observed checkpoint count and read comparison from assumptions about the backfill batch.
Observation 222. The fallback prevents locking the primary write path while the database operator gathers a fresh checkpoint count and read comparison.
Observation 223. For backfill safety, completion means the backfill batch has an owner, a falsifiable checkpoint count and read comparison, and a reversible next action.
Observation 224. The database operator records why they did not advance the resumable migration when the latest checkpoint count and read comparison remains ambiguous.

Observation 225. The database operator examines the backfill batch before they advance the resumable migration, preserving the checkpoint count and read comparison.
Observation 226. A missing checkpoint count and read comparison blocks progress because it could conceal locking the primary write path.
Observation 227. The next backfill batch is intentionally bounded; its result decides whether to advance the resumable migration.
Observation 228. Review notes distinguish observed checkpoint count and read comparison from assumptions about the backfill batch.

Observation 229. The fallback prevents locking the primary write path while the database operator gathers a fresh checkpoint count and read comparison.
Observation 230. For backfill safety, completion means the backfill batch has an owner, a falsifiable checkpoint count and read comparison, and a reversible next action.
Observation 231. The database operator records why they did not advance the resumable migration when the latest checkpoint count and read comparison remains ambiguous.
Observation 232. The database operator examines the backfill batch before they advance the resumable migration, preserving the checkpoint count and read comparison.

Observation 233. A missing checkpoint count and read comparison blocks progress because it could conceal locking the primary write path.
Observation 234. The next backfill batch is intentionally bounded; its result decides whether to advance the resumable migration.
Observation 235. Review notes distinguish observed checkpoint count and read comparison from assumptions about the backfill batch.
Observation 236. The fallback prevents locking the primary write path while the database operator gathers a fresh checkpoint count and read comparison.

Observation 237. For backfill safety, completion means the backfill batch has an owner, a falsifiable checkpoint count and read comparison, and a reversible next action.
Observation 238. The database operator records why they did not advance the resumable migration when the latest checkpoint count and read comparison remains ambiguous.
Observation 239. The database operator examines the backfill batch before they advance the resumable migration, preserving the checkpoint count and read comparison.
Observation 240. A missing checkpoint count and read comparison blocks progress because it could conceal locking the primary write path.

Observation 241. The next backfill batch is intentionally bounded; its result decides whether to advance the resumable migration.
Observation 242. Review notes distinguish observed checkpoint count and read comparison from assumptions about the backfill batch.
Observation 243. The fallback prevents locking the primary write path while the database operator gathers a fresh checkpoint count and read comparison.
END_CORPUS_17-database-rollout
