import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";
import { BrowserSession } from "./session.js";

const startServer = async (): Promise<{ server: Server; origin: string }> => {
  const server = createServer((request, response) => {
    const path = request.url ?? "/";
    if (path === "/slow") {
      setTimeout(() => {
        response.writeHead(200, { "Content-Type": "text/html" });
        response.end("<html><body>slow</body></html>");
      }, 200);
      return;
    }
    const body = path === "/a" ? "A" : path === "/b" ? "B" : "home";
    response.writeHead(200, { "Content-Type": "text/html" });
    response.end(`<html><body>${body}</body></html>`);
  });
  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Failed to start test server");
  }
  return { server, origin: `http://127.0.0.1:${address.port}` };
};

const withSession = async (
  run: (session: BrowserSession) => Promise<void>,
): Promise<void> => {
  const profileDir = await mkdtemp(join(tmpdir(), "browser-chan-session-"));
  const session = new BrowserSession({ profileDir });
  try {
    await run(session);
  } finally {
    await session.closeBrowser().catch(() => undefined);
    await rm(profileDir, { recursive: true, force: true });
  }
};

describe("BrowserSession", () => {
  let server: Server | null = null;
  let origin = "";

  before(async () => {
    const started = await startServer();
    server = started.server;
    origin = started.origin;
  });

  after(async () => {
    const running = server;
    if (!running) {
      return;
    }
    await new Promise<void>((resolve, reject) => {
      running.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  });

  it("初期状態ではブラウザを開かない", async () => {
    await withSession(async (session) => {
      assert.equal(session.browserOpen, false);
    });
  });

  it("snapshotでブラウザを開き、closeBrowserで閉じ、navigateで再度開く", async () => {
    await withSession(async (session) => {
      await session.snapshot();
      assert.equal(session.browserOpen, true);

      await session.closeBrowser();
      assert.equal(session.browserOpen, false);

      const snapshot = await session.navigate(`${origin}/a`);
      assert.equal(session.browserOpen, true);
      assert.match(snapshot, /A/);
    });
  });

  it("navigateはhttpとhttps以外のURLを拒否し、ブラウザを開かない", async () => {
    await withSession(async (session) => {
      await assert.rejects(
        session.navigate("ftp://example.com"),
        /Only http and https URLs are allowed/,
      );
      assert.equal(session.browserOpen, false);
    });
  });

  it("tabsはhttpとhttps以外のURLで新しいタブを開かない", async () => {
    await withSession(async (session) => {
      await assert.rejects(
        session.tabs("new", undefined, "ftp://example.com"),
        /Only http and https URLs are allowed/,
      );
      assert.equal(session.browserOpen, false);
    });
  });

  it("tabsで新しいタブを追加し、selectで1枚目を選択する", async () => {
    await withSession(async (session) => {
      await session.navigate(`${origin}/a`);

      const opened = await session.tabs("new", undefined, `${origin}/b`);
      assert.equal(opened.length, 2);
      assert.deepEqual(
        opened.map((tab) => tab.active),
        [false, true],
      );

      const selected = await session.tabs("select", 1);
      assert.equal(selected.length, 2);
      assert.equal(selected[0]?.active, true);
      assert.equal(selected[0]?.url, `${origin}/a`);
    });
  });

  it("tabsは0番目のタブを選択できない", async () => {
    await withSession(async (session) => {
      await session.snapshot();

      await assert.rejects(
        session.tabs("select", 0),
        /A 1-based tab index is required/,
      );
      assert.equal(session.browserOpen, true);
    });
  });

  it("tabsは存在しないタブを選択できない", async () => {
    await withSession(async (session) => {
      await session.snapshot();

      await assert.rejects(
        session.tabs("select", 99),
        /Tab 99 does not exist/,
      );
      assert.equal(session.browserOpen, true);
    });
  });

  it("tabsは存在しないタブを閉じられない", async () => {
    await withSession(async (session) => {
      await session.snapshot();

      await assert.rejects(
        session.tabs("close", 99),
        /Tab 99 does not exist/,
      );
      assert.equal(session.browserOpen, true);
    });
  });

  it("tabsは非activeのタブを閉じてもactiveを維持する", async () => {
    await withSession(async (session) => {
      await session.navigate(`${origin}/a`);
      await session.tabs("new", undefined, `${origin}/b`);
      await session.tabs("select", 1);

      const tabs = await session.tabs("close", 2);
      assert.equal(tabs.length, 1);
      assert.equal(tabs[0]?.url, `${origin}/a`);
      assert.equal(tabs[0]?.active, true);
    });
  });

  it("tabsはactiveのタブを閉じると残りのタブをactiveにする", async () => {
    await withSession(async (session) => {
      await session.navigate(`${origin}/a`);
      await session.tabs("new", undefined, `${origin}/b`);

      const tabs = await session.tabs("close");
      assert.equal(tabs.length, 1);
      assert.equal(tabs[0]?.url, `${origin}/a`);
      assert.equal(tabs[0]?.active, true);
    });
  });

  it("最後のタブを閉じても新しいタブを1枚残す", async () => {
    await withSession(async (session) => {
      await session.snapshot();

      const tabs = await session.tabs("close");
      assert.equal(tabs.length, 1);
      assert.equal(tabs[0]?.active, true);
      assert.equal(session.browserOpen, true);
    });
  });

  it("withScratchPageの後は元のタブに戻り、scratchを閉じる", async () => {
    await withSession(async (session) => {
      await session.navigate(`${origin}/a`);

      const scratchUrl = await session.withScratchPage(async (page) => {
        await page.goto(`${origin}/b`);
        return page.url();
      });
      assert.equal(scratchUrl, `${origin}/b`);

      const tabs = await session.tabs("list");
      assert.equal(tabs.length, 1);
      assert.equal(tabs[0]?.url, `${origin}/a`);
      assert.equal(tabs[0]?.active, true);
    });
  });

  it("withScratchPageはscratchが自分で閉じても元のタブに戻る", async () => {
    await withSession(async (session) => {
      await session.navigate(`${origin}/a`);

      await session.withScratchPage(async (page) => {
        await page.close();
      });

      const tabs = await session.tabs("list");
      assert.equal(tabs.length, 1);
      assert.equal(tabs[0]?.url, `${origin}/a`);
      assert.equal(tabs[0]?.active, true);
    });
  });

  it("外部からcontextを閉じるとbrowserOpenがfalseになり、次のnavigateで再オープンする", async () => {
    await withSession(async (session) => {
      await session.navigate(`${origin}/a`);

      await session.withScratchPage(async (page) => {
        await page.context().close();
      });
      assert.equal(session.browserOpen, false);

      const snapshot = await session.navigate(`${origin}/a`);
      assert.equal(session.browserOpen, true);
      assert.match(snapshot, /A/);
    });
  });

  it("withScratchPageのタスクが失敗しても元のタブに戻る", async () => {
    await withSession(async (session) => {
      await session.navigate(`${origin}/a`);

      await assert.rejects(
        session.withScratchPage(async () => {
          throw new Error("task failed");
        }),
        /task failed/,
      );

      const tabs = await session.tabs("list");
      assert.equal(tabs.length, 1);
      assert.equal(tabs[0]?.url, `${origin}/a`);
      assert.equal(tabs[0]?.active, true);
    });
  });

  it("withScratchPageで他のタブを閉じても新しいタブを1枚残す", async () => {
    await withSession(async (session) => {
      await session.navigate(`${origin}/a`);

      await session.withScratchPage(async (page) => {
        const others = page
          .context()
          .pages()
          .filter((tab) => tab !== page);
        await Promise.all(others.map((tab) => tab.close()));
      });

      assert.equal(session.browserOpen, true);
      const tabs = await session.tabs("list");
      assert.equal(tabs.length, 1);
      assert.equal(tabs[0]?.active, true);

      await session.closeBrowser();
      assert.equal(session.browserOpen, false);
    });
  });

  it("closeContextNowで即座にブラウザを閉じる", async () => {
    await withSession(async (session) => {
      await session.snapshot();
      assert.equal(session.browserOpen, true);

      const closing = session.closeContextNow();
      assert.equal(session.browserOpen, false);
      await closing;
    });
  });

  it("queueはnavigateをcloseBrowserより先に実行する", async () => {
    await withSession(async (session) => {
      const events: string[] = [];
      const navigation = session.navigate(`${origin}/slow`).then((snapshot) => {
        events.push("navigate");
        return snapshot;
      });
      const closing = session.closeBrowser().then(() => {
        events.push("close");
      });

      const snapshot = await navigation;
      await closing;

      assert.match(snapshot, /slow/);
      assert.deepEqual(events, ["navigate", "close"]);
      assert.equal(session.browserOpen, false);
    });
  });
});
