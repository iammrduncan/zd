// the router guarantees this param exists before the handler runs
const user = payload as User;
// the queue only ever carries orders on this topic
const order = blob as Order;
const mode = "fast" as const;
