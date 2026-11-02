import type { Page } from "playwright-core";

export type SnapshotElement = {
  ref: string;
  role: string;
  name: string;
  href?: string;
  type?: string;
};

export type PageSnapshot = {
  url: string;
  title: string;
  text: string;
  elements: SnapshotElement[];
};

export const MAX_SNAPSHOT_TEXT = 20_000;
export const MAX_SNAPSHOT_ELEMENTS = 300;

const TRUNCATION_MARKER = "...[truncated]";

const truncate = (value: string, max: number): string => {
  if (value.length <= max) {
    return value;
  }
  return `${value.slice(0, Math.max(0, max - TRUNCATION_MARKER.length))}${TRUNCATION_MARKER}`;
};

const singleLine = (value: string): string => value.replace(/\s+/g, " ").trim();

const normalizeName = (value: string): string =>
  truncate(singleLine(value), 200);

export const formatPageSnapshot = (snapshot: PageSnapshot): string => {
  const elements = snapshot.elements.slice(0, MAX_SNAPSHOT_ELEMENTS);
  const lines = [
    `URL: ${snapshot.url}`,
    `Title: ${snapshot.title}`,
    "Text:",
    truncate(snapshot.text, MAX_SNAPSHOT_TEXT) || "(empty)",
    "",
    "Interactive elements:",
  ];
  if (elements.length === 0) {
    lines.push("(none)");
  } else {
    for (const element of elements) {
      const parts = [
        element.ref,
        element.role,
        normalizeName(element.name) || "(unnamed)",
      ];
      if (element.type) {
        parts.push(`type=${singleLine(element.type)}`);
      }
      if (element.href) {
        parts.push(`href=${truncate(singleLine(element.href), 200)}`);
      }
      lines.push(parts.join(" | "));
    }
    if (snapshot.elements.length > MAX_SNAPSHOT_ELEMENTS) {
      lines.push(TRUNCATION_MARKER);
    }
  }
  return lines.join("\n");
};

export const capturePageSnapshot = async (
  page: Page,
): Promise<PageSnapshot> => {
  const captured = await page.evaluate((maxElements) => {
    (globalThis as { __name?: (target: unknown) => unknown }).__name ??= (
      target: unknown,
    ) => target;
    const SELECTOR =
      'a[href], button, input, select, textarea, summary, [role], [tabindex], [contenteditable="true"]';
    const INTERACTIVE_TAGS = new Set([
      "a",
      "button",
      "input",
      "select",
      "textarea",
      "summary",
    ]);
    const INTERACTIVE_ROLES = new Set([
      "button",
      "link",
      "textbox",
      "searchbox",
      "checkbox",
      "radio",
      "combobox",
      "listbox",
      "option",
      "menuitem",
      "menuitemcheckbox",
      "menuitemradio",
      "tab",
      "switch",
      "spinbutton",
      "slider",
      "treeitem",
      "gridcell",
    ]);

    document.querySelectorAll("[data-browser-chan-ref]").forEach((element) => {
      element.removeAttribute("data-browser-chan-ref");
    });

    const isRelevant = (element: HTMLElement): boolean => {
      const tag = element.tagName.toLowerCase();
      if (INTERACTIVE_TAGS.has(tag) || element.isContentEditable) {
        return true;
      }
      const explicit = element.getAttribute("role")?.trim().split(/\s+/)[0];
      if (explicit) {
        return INTERACTIVE_ROLES.has(explicit);
      }
      const tabIndex = element.getAttribute("tabindex");
      return tabIndex === null || Number(tabIndex) >= 0;
    };

    const isVisible = (element: HTMLElement): boolean => {
      if (element.hidden || element.closest("[hidden]")) {
        return false;
      }
      if (element.closest('[aria-hidden="true"]')) {
        return false;
      }
      const rect = element.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) {
        return false;
      }
      const style = getComputedStyle(element);
      return (
        style.display !== "none" &&
        style.visibility !== "hidden" &&
        style.visibility !== "collapse" &&
        style.opacity !== "0"
      );
    };

    const normalizedText = (element: Element | null): string =>
      (element?.textContent ?? "").replace(/\s+/g, " ").trim();

    const labelledByText = (element: HTMLElement): string => {
      const ids = (element.getAttribute("aria-labelledby") ?? "").split(/\s+/);
      return ids
        .filter((id) => id.length > 0)
        .map((id) => normalizedText(document.getElementById(id)))
        .filter((text) => text.length > 0)
        .join(" ");
    };

    const labelsText = (element: HTMLElement): string => {
      if (!("labels" in element)) {
        return "";
      }
      const labels = (element as HTMLInputElement).labels;
      if (!labels) {
        return "";
      }
      return Array.from(labels)
        .map((label) => normalizedText(label))
        .filter((text) => text.length > 0)
        .join(" ");
    };

    const roleOf = (element: HTMLElement): string => {
      const explicit = element.getAttribute("role")?.trim().split(/\s+/)[0];
      if (explicit) {
        return explicit;
      }
      const tag = element.tagName.toLowerCase();
      if (tag === "a") {
        return "link";
      }
      if (tag === "button" || tag === "summary") {
        return "button";
      }
      if (tag === "select") {
        return (element as HTMLSelectElement).multiple ? "listbox" : "combobox";
      }
      if (tag === "textarea") {
        return "textbox";
      }
      if (tag === "input") {
        const type = (element as HTMLInputElement).type;
        const roles: Record<string, string> = {
          checkbox: "checkbox",
          radio: "radio",
          button: "button",
          submit: "button",
          reset: "button",
          image: "button",
          search: "searchbox",
          range: "slider",
          number: "spinbutton",
          file: "button",
          color: "button",
        };
        return roles[type] ?? "textbox";
      }
      if (element.isContentEditable) {
        return "textbox";
      }
      return "generic";
    };

    const nameOf = (element: HTMLElement): string => {
      const ariaLabel = element.getAttribute("aria-label")?.trim();
      if (ariaLabel) {
        return ariaLabel;
      }
      const labelledBy = labelledByText(element);
      if (labelledBy) {
        return labelledBy;
      }
      const labels = labelsText(element);
      if (labels) {
        return labels;
      }
      const alt = element.getAttribute("alt");
      if (alt) {
        return alt;
      }
      const title = element.getAttribute("title");
      if (title) {
        return title;
      }
      const placeholder = element.getAttribute("placeholder");
      if (placeholder) {
        return placeholder;
      }
      if (element instanceof HTMLInputElement) {
        const buttonTypes = new Set(["button", "submit", "reset"]);
        if (buttonTypes.has(element.type) && element.value) {
          return element.value;
        }
      }
      const innerText = (element as HTMLElement).innerText ?? "";
      if (innerText.trim()) {
        return innerText;
      }
      return element.getAttribute("name") ?? "";
    };

    const elements: SnapshotElement[] = [];
    for (const element of Array.from(
      document.querySelectorAll<HTMLElement>(SELECTOR),
    )) {
      if (elements.length >= maxElements) {
        break;
      }
      if (!isVisible(element) || !isRelevant(element)) {
        continue;
      }
      if (element instanceof HTMLInputElement && element.type === "hidden") {
        continue;
      }
      const index = elements.length + 1;
      const ref = `e${index}`;
      element.setAttribute("data-browser-chan-ref", ref);
      const href =
        element instanceof HTMLAnchorElement
          ? element.href.slice(0, 200)
          : undefined;
      const type =
        element instanceof HTMLInputElement ? element.type : undefined;
      elements.push({
        ref,
        role: roleOf(element),
        name: nameOf(element),
        ...(href ? { href } : {}),
        ...(type ? { type } : {}),
      });
    }

    return {
      url: location.href,
      title: document.title,
      text: document.body?.innerText ?? "",
      elements,
    };
  }, MAX_SNAPSHOT_ELEMENTS);

  return {
    url: captured.url,
    title: captured.title,
    text: truncate(captured.text, MAX_SNAPSHOT_TEXT),
    elements: captured.elements
      .slice(0, MAX_SNAPSHOT_ELEMENTS)
      .map((element) => ({
        ref: element.ref,
        role: element.role,
        name: truncate(element.name, 200),
        ...(element.href ? { href: truncate(element.href, 200) } : {}),
        ...(element.type ? { type: element.type } : {}),
      })),
  };
};
