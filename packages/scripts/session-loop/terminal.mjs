import console from "node:console";
import process from "node:process";

const ANSI = {
  boldCyan: "\u001b[1;36m",
  cyan: "\u001b[36m",
  dim: "\u001b[2m",
  reset: "\u001b[0m",
  underlineCyan: "\u001b[4;36m",
  yellow: "\u001b[38;5;220m",
};

export function terminalColorsEnabled() {
  if (process.env.FORCE_COLOR !== undefined) return process.env.FORCE_COLOR !== "0";
  return Boolean(
    process.stdout.isTTY && process.env.TERM !== "dumb" && process.env.NO_COLOR === undefined,
  );
}

function styleInlineMarkdown(text) {
  return text
    .replace(
      /\[([^\]]+)]\(([^)]+)\)/g,
      `${ANSI.underlineCyan}$1${ANSI.reset} ${ANSI.dim}($2)${ANSI.reset}`,
    )
    .replace(/\*\*([^*]+)\*\*/g, `\u001b[1m$1${ANSI.reset}`)
    .replace(/`([^`]+)`/g, `${ANSI.yellow}$1${ANSI.reset}`);
}

export function renderTerminalMarkdown(markdown) {
  let inCodeBlock = false;

  return markdown
    .split("\n")
    .map((line) => {
      const fence = /^```\s*(.*)$/.exec(line);
      if (fence) {
        inCodeBlock = !inCodeBlock;
        const language = fence[1] ? ` ${fence[1]}` : "";
        const border = inCodeBlock ? `┌─${language}` : "└─";
        return `${ANSI.cyan}${border}${ANSI.reset}`;
      }
      if (inCodeBlock)
        return `${ANSI.dim}${ANSI.cyan}│${ANSI.reset} ${ANSI.dim}${line}${ANSI.reset}`;

      const heading = /^#{1,6}\s+(.+)$/.exec(line);
      if (heading) return `${ANSI.boldCyan}${heading[1]}${ANSI.reset}`;

      const bullet = /^(\s*)[-*+]\s+(.+)$/.exec(line);
      if (bullet) {
        return `${bullet[1]}${ANSI.cyan}•${ANSI.reset} ${styleInlineMarkdown(bullet[2])}`;
      }

      const numbered = /^(\s*)(\d+)\.\s+(.+)$/.exec(line);
      if (numbered) {
        return `${numbered[1]}${ANSI.boldCyan}${numbered[2]}.${ANSI.reset} ${styleInlineMarkdown(numbered[3])}`;
      }

      const quote = /^>\s?(.*)$/.exec(line);
      if (quote)
        return `${ANSI.cyan}│${ANSI.reset} ${ANSI.dim}${styleInlineMarkdown(quote[1])}${ANSI.reset}`;

      if (/^\s*(?:---+|___+|\*\*\*+)\s*$/.test(line)) {
        return `${ANSI.dim}${"─".repeat(48)}${ANSI.reset}`;
      }
      return styleInlineMarkdown(line);
    })
    .join("\n");
}

export function printCodexOutput(title, message) {
  if (!message) return;

  if (!terminalColorsEnabled()) {
    console.log(`\n--- ${title} ---\n${message}`);
    return;
  }

  const width = Math.max(48, Math.min(process.stdout.columns ?? 80, 100));
  const prefix = `── ${title} `;
  const divider = prefix + "─".repeat(Math.max(2, width - prefix.length));
  console.log(`\n${ANSI.dim}${ANSI.cyan}${divider}${ANSI.reset}`);
  console.log(renderTerminalMarkdown(message));
}
