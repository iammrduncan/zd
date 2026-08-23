/** Accept a terminal-owned title only when it is safe to retain as compact UI text. */
export function boundedAutomaticName(value: string): string | null {
  const hasControlCharacter = [...value].some((character) => {
    const codePoint = character.codePointAt(0)!;
    return codePoint <= 31 || codePoint === 127;
  });
  if (hasControlCharacter) return null;
  const normalized = value.trim().replace(/\s+/gu, " ");
  return normalized.length > 0 && normalized.length <= 160 ? normalized : null;
}
