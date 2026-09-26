import { parentPort } from "node:worker_threads";

parentPort.on("message", ({ id, type }) => {
  if (type === "load") {
    parentPort.postMessage({ id, result: "ready" });
    return;
  }

  if (type === "generate") {
    const stopAt = Date.now() + 350;
    while (Date.now() < stopAt) {
      // Mimic synchronous native inference without blocking the test's main thread.
    }
    parentPort.postMessage({
      id,
      result: [{ generated_text: "RUN TESTS | The agent runs tests in an isolated worker." }],
    });
  }
});
