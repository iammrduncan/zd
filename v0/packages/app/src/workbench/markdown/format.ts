import type { Editor, MarkdownFormat } from "@/editor";
import { register, type Chord } from "../shortcuts";

interface FormatCommand {
  readonly id: string;
  readonly format: MarkdownFormat;
  readonly chord: Chord;
  readonly description: string;
}

const FORMAT_COMMANDS: readonly FormatCommand[] = [
  {
    id: "document.formatBold",
    format: "bold",
    chord: { key: "b", mod: true, alt: true },
    description: "Make the selected Markdown bold",
  },
  {
    id: "document.formatItalic",
    format: "italic",
    chord: { key: "i", mod: true },
    description: "Make the selected Markdown italic",
  },
  {
    id: "document.formatCode",
    format: "code",
    chord: { key: "c", mod: true, shift: true },
    description: "Make the selected Markdown inline code",
  },
  {
    id: "document.formatLink",
    format: "link",
    chord: { key: "k", mod: true },
    description: "Make the selected URL a Markdown link",
  },
];

/** Put Markdown formatting into the one visible shortcut registry. */
export function registerMarkdownFormatting(
  currentEditor: () => Editor | null,
  available: () => boolean,
): (() => void)[] {
  return FORMAT_COMMANDS.map((command) =>
    register({
      id: command.id,
      category: "Editor/Reading",
      chord: command.chord,
      description: command.description,
      available,
      run: () => currentEditor()?.format(command.format) ?? false,
    }),
  );
}
