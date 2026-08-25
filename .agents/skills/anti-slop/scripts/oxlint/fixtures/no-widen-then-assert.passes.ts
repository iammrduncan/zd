const raw: unknown = JSON.parse(text);
const user = parseUser(raw);
const known = { id: "1" };
const same = known;
