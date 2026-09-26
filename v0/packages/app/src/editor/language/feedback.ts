import {
  HighlightStyle,
  LanguageSupport,
  StreamLanguage,
  syntaxHighlighting,
  type StringStream,
} from "@codemirror/language";
import { Tag, tags } from "@lezer/highlight";

const newFeedback = Tag.define("newFeedback", tags.inserted);
const addressedFeedback = Tag.define("addressedFeedback", tags.comment);
const activeFeedback = Tag.define("activeFeedback", tags.changed);

type FeedbackSection = "new" | "addressed" | null;

interface FeedbackState {
  section: FeedbackSection;
}

const feedback = StreamLanguage.define<FeedbackState>({
  name: "feedback",
  startState: () => ({ section: null }),
  tokenTable: {
    newFeedback,
    addressedFeedback,
    activeFeedback,
  },
  token(stream: StringStream, state: FeedbackState) {
    if (stream.sol()) {
      if (stream.match(/^<=== New Feedback ===>\s*$/)) {
        state.section = "new";
        return "newFeedback";
      }
      if (stream.match(/^<=== Feedback Addressed ===>\s*$/)) {
        state.section = "addressed";
        return "addressedFeedback";
      }
      if (stream.peek() === "\\") {
        stream.skipToEnd();
        return "activeFeedback";
      }
    }

    stream.skipToEnd();
    if (state.section === "new") return "newFeedback";
    if (state.section === "addressed") return "addressedFeedback";
    return null;
  },
});

const feedbackHighlighting = HighlightStyle.define([
  { tag: newFeedback, class: "zd-feedback-new" },
  { tag: addressedFeedback, class: "zd-feedback-addressed" },
  { tag: activeFeedback, class: "zd-feedback-progress" },
]);

export function feedbackLanguage(): LanguageSupport {
  return new LanguageSupport(feedback, syntaxHighlighting(feedbackHighlighting));
}
