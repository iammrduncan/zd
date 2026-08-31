import type { Platform } from "@/platform";

type Connector = (secret: string) => Promise<Platform>;

function problem(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

export function mountServedUnlock(host: HTMLElement, connect: Connector): Promise<Platform> {
  const section = document.createElement("section");
  section.className = "zd-served-unlock";
  section.setAttribute("aria-labelledby", "zd-served-unlock-title");

  const title = document.createElement("h1");
  title.id = "zd-served-unlock-title";
  title.textContent = "Connect to zd";
  const instructions = document.createElement("p");
  instructions.textContent = "Enter the process secret printed beside the served-host URL.";
  const form = document.createElement("form");
  const label = document.createElement("label");
  label.htmlFor = "zd-served-secret";
  label.textContent = "Process secret";
  const input = document.createElement("input");
  input.id = "zd-served-secret";
  input.name = "secret";
  input.type = "password";
  input.autocomplete = "off";
  input.autocapitalize = "none";
  input.spellcheck = false;
  input.required = true;
  const submit = document.createElement("button");
  submit.type = "submit";
  submit.textContent = "Unlock";
  const status = document.createElement("p");
  status.className = "zd-served-unlock-status";
  status.setAttribute("role", "status");
  form.append(label, input, submit, status);
  section.append(title, instructions, form);
  host.replaceChildren(section);
  input.focus();

  return new Promise<Platform>((resolve) => {
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      if (input.disabled || input.value.length === 0) return;
      const secret = input.value;
      input.value = "";
      input.disabled = true;
      submit.disabled = true;
      status.textContent = "Connecting…";
      void connect(secret)
        .then(resolve)
        .catch((cause: unknown) => {
          status.textContent = `zd could not unlock: ${problem(cause)}`;
          input.disabled = false;
          submit.disabled = false;
          input.focus();
        });
    });
  });
}

export function isServedPage(documentRoot: Document = document): boolean {
  return documentRoot.querySelector('meta[name="zd-served-host"][content="1"]') !== null;
}
