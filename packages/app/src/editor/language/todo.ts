import { LanguageSupport, StreamLanguage, type StringStream } from "@codemirror/language";

interface TodoState {
  completed: boolean;
}

function priorityToken(priority: string): string {
  if (priority === "A") return "keyword";
  if (priority === "B") return "typeName";
  if (priority === "C") return "variableName.function";
  return "number";
}

const todo = StreamLanguage.define<TodoState>({
  name: "todo",
  startState: () => ({ completed: false }),
  token(stream: StringStream, state: TodoState) {
    if (stream.sol()) state.completed = /^x\s/.test(stream.string);
    if (state.completed) {
      stream.skipToEnd();
      return "lineComment";
    }
    if (stream.eatSpace()) return null;

    const priority = stream.match(/^\(([A-Z])\)(?=\s)/);
    if (priority && typeof priority !== "boolean") return priorityToken(priority[1] ?? "");
    if (stream.match(/^\d{4}-\d{2}-\d{2}(?=\s|$)/)) return "number";
    if (stream.match(/^\+[A-Za-z0-9_-]+/)) return "typeName";
    if (stream.match(/^@[A-Za-z0-9_-]+/)) return "variableName.function";
    if (stream.match(/^https?:\/\/\S+/)) return "url";

    stream.next();
    return null;
  },
});

export function todoLanguage(): LanguageSupport {
  return new LanguageSupport(todo);
}
