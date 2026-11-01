import type { Hono } from "hono";
import type { BrowserSession } from "../browser/session.js";

const NICO_LIVE_URL = "https://live.nicovideo.jp/watch/user/98746932";
const FAILED_MESSAGE = "Failed to get data from the page";

type NicoData = {
  nicoWsurl: string;
  vposBaseTime: number;
  liveId: string;
};

export type LegacyRoutesOptions = {
  session: BrowserSession;
};

export const registerLegacyRoutes = (
  app: Hono,
  options: LegacyRoutesOptions,
): void => {
  app.get("/", async (c) => {
    try {
      const result = await options.session.withScratchPage(
        async (page): Promise<NicoData | null> => {
          await page.goto(NICO_LIVE_URL);
          const data = await page.evaluate(() => {
            const scriptTag = document.getElementById("embedded-data");
            return scriptTag ? scriptTag.getAttribute("data-props") : null;
          });
          if (!data) {
            return null;
          }
          const jsonData = JSON.parse(data);
          return {
            nicoWsurl: jsonData.site.relive.webSocketUrl as string,
            vposBaseTime: jsonData.program.vposBaseTime as number,
            liveId: jsonData.program.nicoliveProgramId as string,
          };
        },
      );
      if (!result) {
        console.error(FAILED_MESSAGE);
        return c.text(FAILED_MESSAGE);
      }
      console.log(result);
      return c.text(JSON.stringify(result));
    } catch (error) {
      console.error(
        FAILED_MESSAGE,
        error instanceof Error ? error.message : String(error),
      );
      return c.text(FAILED_MESSAGE);
    }
  });

  app.get("/hand", async (c) => {
    console.log("🚀 GUI ブラウザを起動します。手動でログインしてください。");
    console.log(
      "   完了後、ブラウザウィンドウを閉じるとスクリプトが終了します。",
    );
    try {
      await options.session.openHeaded("https://google.com");
      console.log("✅ ログイン状態をプロファイルに保存しました。");
      console.log(`📁 保存先: ${options.session.profileDir}`);
      return c.text("ok");
    } catch (error) {
      console.error(
        "GUI ブラウザの起動に失敗しました。",
        error instanceof Error ? error.message : String(error),
      );
      return c.text("Failed to open the browser", 500);
    }
  });
};
