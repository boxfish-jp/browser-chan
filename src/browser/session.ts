import { type BrowserContext, chromium, type Page } from "playwright-core";
import { capturePageSnapshot, formatPageSnapshot } from "./snapshot.js";

const NAVIGATION_TIMEOUT_MS = 30_000;
const ACTION_TIMEOUT_MS = 10_000;
const MAX_WAIT_MS = 45_000;
const REF_PATTERN = /^e\d{1,5}$/;
const BROWSER_ARGS = [
  "--no-sandbox",
  "--disable-gpu",
  "--disable-dev-shm-usage",
];
const VIEWPORT = { width: 1280, height: 900 };

export type BrowserSessionOptions = {
  profileDir: string;
};

export type TabAction = "list" | "new" | "select" | "close";

export type TabInfo = {
  index: number;
  url: string;
  title: string;
  active: boolean;
};

const parseHttpUrl = (url: string): string => {
  const parsed = new URL(url);
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(`Only http and https URLs are allowed: ${url}`);
  }
  return parsed.toString();
};

const TRUNCATION_MARKER = "...[truncated]";

const truncate = (value: string, max: number): string =>
  value.length <= max
    ? value
    : `${value.slice(0, Math.max(0, max - TRUNCATION_MARKER.length))}${TRUNCATION_MARKER}`;

const stringifyEvaluateResult = (value: unknown): string => {
  const json = JSON.stringify(value);
  return truncate(json ?? "undefined", 50_000);
};

export class BrowserSession {
  private readonly _profileDir: string;
  private _context: BrowserContext | null = null;
  private _activePage: Page | null = null;
  private _queue: Promise<unknown> = Promise.resolve();

  constructor(options: BrowserSessionOptions) {
    this._profileDir = options.profileDir;
  }

  get browserOpen(): boolean {
    return this._context !== null;
  }

  get profileDir(): string {
    return this._profileDir;
  }

  private _enqueue<T>(task: () => Promise<T>): Promise<T> {
    const run = this._queue.then(task, task);
    this._queue = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  private _pickPage(context: BrowserContext): Page | null {
    try {
      return (
        context
          .pages()
          .filter((page) => !page.isClosed())
          .at(-1) ?? null
      );
    } catch {
      return null;
    }
  }

  private async _closeContext(): Promise<void> {
    const context = this._context;
    this._context = null;
    this._activePage = null;
    if (context) {
      await context.close().catch(() => undefined);
    }
  }

  private async _openContext(headless: boolean): Promise<BrowserContext> {
    await this._closeContext();
    const context = await chromium.launchPersistentContext(this._profileDir, {
      headless,
      args: BROWSER_ARGS,
      acceptDownloads: true,
      viewport: VIEWPORT,
      ...(headless ? {} : { slowMo: 300 }),
    });
    this._context = context;
    context.on("close", () => {
      if (this._context === context) {
        this._context = null;
        this._activePage = null;
      }
    });
    this._activePage = this._pickPage(context) ?? (await context.newPage());
    return context;
  }

  private async _ensurePage(): Promise<Page> {
    if (!this._context) {
      await this._openContext(true);
    }
    const context = this._context;
    if (!context) {
      throw new Error("Browser context is not available");
    }
    if (this._activePage && !this._activePage.isClosed()) {
      return this._activePage;
    }
    this._activePage = this._pickPage(context) ?? (await context.newPage());
    return this._activePage;
  }

  private async _snapshot(page: Page): Promise<string> {
    return formatPageSnapshot(await capturePageSnapshot(page));
  }

  private _locator(page: Page, ref: string) {
    if (!REF_PATTERN.test(ref)) {
      throw new Error(`Invalid element ref: ${ref}`);
    }
    return page.locator(`[data-browser-chan-ref="${ref}"]`);
  }

  private _pages(context: BrowserContext): Page[] {
    return context.pages().filter((page) => !page.isClosed());
  }

  private _pageAt(context: BrowserContext, index: number | undefined): Page {
    const pages = this._pages(context);
    if (index === undefined || !Number.isInteger(index) || index < 1) {
      throw new Error("A 1-based tab index is required");
    }
    const page = pages[index - 1];
    if (!page) {
      throw new Error(`Tab ${index} does not exist`);
    }
    return page;
  }

  navigate(url: string): Promise<string> {
    return this._enqueue(async () => {
      const target = parseHttpUrl(url);
      const page = await this._ensurePage();
      await page.goto(target, {
        waitUntil: "domcontentloaded",
        timeout: NAVIGATION_TIMEOUT_MS,
      });
      return this._snapshot(page);
    });
  }

  snapshot(): Promise<string> {
    return this._enqueue(async () => {
      const page = await this._ensurePage();
      return this._snapshot(page);
    });
  }

  click(ref: string): Promise<string> {
    return this._enqueue(async () => {
      const page = await this._ensurePage();
      await this._locator(page, ref).click({ timeout: ACTION_TIMEOUT_MS });
      return this._snapshot(page);
    });
  }

  type(ref: string, text: string, submit = false): Promise<string> {
    return this._enqueue(async () => {
      const page = await this._ensurePage();
      const locator = this._locator(page, ref);
      await locator.fill(text, { timeout: ACTION_TIMEOUT_MS });
      if (submit) {
        await locator.press("Enter", { timeout: ACTION_TIMEOUT_MS });
      }
      return this._snapshot(page);
    });
  }

  select(ref: string, values: string[]): Promise<string> {
    return this._enqueue(async () => {
      const page = await this._ensurePage();
      await this._locator(page, ref).selectOption(values, {
        timeout: ACTION_TIMEOUT_MS,
      });
      return this._snapshot(page);
    });
  }

  pressKey(key: string): Promise<string> {
    return this._enqueue(async () => {
      const page = await this._ensurePage();
      await page.keyboard.press(key);
      return this._snapshot(page);
    });
  }

  waitFor(text: string, timeoutMs = ACTION_TIMEOUT_MS): Promise<string> {
    return this._enqueue(async () => {
      const page = await this._ensurePage();
      const timeout = Math.min(Math.max(Math.trunc(timeoutMs), 1), MAX_WAIT_MS);
      await page.waitForFunction(
        (needle) => (document.body?.innerText ?? "").includes(needle),
        text,
        { timeout },
      );
      return this._snapshot(page);
    });
  }

  evaluate(expression: string): Promise<string> {
    return this._enqueue(async () => {
      const page = await this._ensurePage();
      const result = await page.evaluate(expression);
      return stringifyEvaluateResult(result);
    });
  }

  screenshot(fullPage = false): Promise<Buffer> {
    return this._enqueue(async () => {
      const page = await this._ensurePage();
      return page.screenshot({ fullPage, type: "png" });
    });
  }

  tabs(action: TabAction, index?: number, url?: string): Promise<TabInfo[]> {
    return this._enqueue(async () => {
      const page = await this._ensurePage();
      let context = this._context;
      if (!context) {
        throw new Error("Browser context is not available");
      }
      if (action === "new") {
        const target = url ? parseHttpUrl(url) : null;
        const newPage = await context.newPage();
        if (target) {
          await newPage.goto(target, {
            waitUntil: "domcontentloaded",
            timeout: NAVIGATION_TIMEOUT_MS,
          });
        }
        this._activePage = newPage;
      } else if (action === "select") {
        const target = this._pageAt(context, index);
        this._activePage = target;
        await target.bringToFront();
      } else if (action === "close") {
        const target =
          index === undefined ? page : this._pageAt(context, index);
        await target.close();
        try {
          const remaining = this._pages(context);
          if (remaining.length === 0) {
            this._activePage = await context.newPage();
          } else if (this._activePage === target || !this._activePage) {
            this._activePage = remaining.at(-1) ?? null;
          }
        } catch {
          context = await this._openContext(true);
          this._activePage =
            this._pickPage(context) ?? (await context.newPage());
        }
      } else if (action !== "list") {
        throw new Error(`Unknown tabs action: ${action}`);
      }
      const pages = this._pages(context);
      return Promise.all(
        pages.map(async (tab, tabIndex) => ({
          index: tabIndex + 1,
          url: tab.url(),
          title: await tab.title().catch(() => ""),
          active: tab === this._activePage,
        })),
      );
    });
  }

  closeBrowser(): Promise<void> {
    return this._enqueue(async () => {
      await this._closeContext();
    });
  }

  closeContextNow(): Promise<void> {
    return this._closeContext();
  }

  withScratchPage<T>(task: (page: Page) => Promise<T>): Promise<T> {
    return this._enqueue(async () => {
      await this._ensurePage();
      const context = this._context;
      if (!context) {
        throw new Error("Browser context is not available");
      }
      const previous = this._activePage;
      const page = await context.newPage();
      try {
        return await task(page);
      } finally {
        if (!page.isClosed()) {
          await page.close().catch(() => undefined);
        }
        if (this._context !== context) {
          this._activePage = null;
        } else if (previous && !previous.isClosed()) {
          this._activePage = previous;
        } else {
          this._activePage = this._pickPage(context);
        }
      }
    });
  }

  withSuspended<T>(task: () => Promise<T>): Promise<T> {
    return this._enqueue(async () => {
      await this._closeContext();
      return task();
    });
  }

  openHeaded(startUrl: string): Promise<void> {
    return this._enqueue(async () => {
      const target = parseHttpUrl(startUrl);
      const context = await this._openContext(false);
      const page = await context.newPage();
      this._activePage = page;
      await page.goto(target, {
        waitUntil: "domcontentloaded",
        timeout: NAVIGATION_TIMEOUT_MS,
      });
      await new Promise<void>((resolve) => {
        context.once("close", () => resolve());
        if (this._context === null) {
          resolve();
        }
      });
    });
  }
}
