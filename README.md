# browser-chan

永続 Chromium プロファイルを 1 プロセスで共有し、MCP（Streamable HTTP）と既存の HTTP API から操作するブラウザサーバです。ニコニコ生放送の `GET /` は従来どおり残し、プロファイルの作成・export・import をローカルとサーバの両方で行えます。

## 動作環境

- Nix（flakes を有効にした状態）。
- `x86_64-linux` / `aarch64-linux`。`x86_64-linux` のみ動作確認済みです。
- Chromium はこの flake が `playwright-driver` から用意します。利用者が別途インストールする必要はありません。
- `profile-edit` は X11 または Wayland のデスクトップが必要です。
- MCP クライアントはこのリポジトリに含みません。DSH を使う場合は `@deepseek-ai/dsh-mcp-client` を利用者側の設定に追加します。
- 動作確認済み: Node.js `24.18.0`、pnpm `11.13.1`、Playwright `1.61.1`、DSH `0.2.1-rc.3`。

## 最小の使い方

トークンをファイルに保存し、サーバを起動します。`127.0.0.1` 以外で待ち受ける場合はトークンが必須です。

```sh
install -d -m 700 "$HOME/.config/browser-chan"
openssl rand -hex 32 > "$HOME/.config/browser-chan/mcp-token"
chmod 600 "$HOME/.config/browser-chan/mcp-token"

BROWSER_CHAN_HOST=0.0.0.0 \
BROWSER_CHAN_MCP_TOKEN_FILE="$HOME/.config/browser-chan/mcp-token" \
nix run
```

DSH と MCP サーバが同一ホストなら `BROWSER_CHAN_HOST=127.0.0.1` と `http://127.0.0.1:3000/mcp` を使います。別ホストの場合は、サーバ側を `0.0.0.0` または Tailscale の IP で待ち受け、DSH 側からはその IP か hostname を指定します。IP リテラルの Host は自動で許可されます。FQDN やリバースプロキシ経由の hostname は `BROWSER_CHAN_MCP_ALLOWED_HOSTS` に追加してください。

DSH のプロファイルにある `cordis.patch.yml` に次のエントリを追加します。`serverName: browser` によりツールは `mcp__browser__*` として見えます。

```yaml
- id: mcp-browser
  name: '@deepseek-ai/dsh-mcp-client'
  config:
    serverName: browser
    transport: streamable-http
    url: http://<browser-server>:3000/mcp
    headers:
      Authorization: !!js '`Bearer ${process.env.BROWSER_CHAN_MCP_TOKEN}`'
    failOnStartupError: true
```

`<browser-server>` はサーバの IP か hostname に置き換えます。DSH と MCP サーバが同一ホストなら、`url: http://127.0.0.1:3000/mcp` を使います。`BROWSER_CHAN_MCP_TOKEN` は DSH を起動するシェルにもエクスポートしてください。サーバ側で `BROWSER_CHAN_MCP_TOKEN_FILE` を使う場合も、DSH 側には同じ値を `BROWSER_CHAN_MCP_TOKEN` として渡します。

### プロファイルの流れ

ローカル Linux PC でログイン済みプロファイルを作り、サーバへ送ります。

```sh
# ローカル PC: Chromium を開いてログインする
nix run .#profile-edit

# ローカル PC: アーカイブを作る
nix run .#profile-export -- -o browser-chan-profile.tar.gz

# サーバへ送る（サーバのブラウザは閉じられます）
BROWSER_CHAN_MCP_TOKEN=... nix run .#profile-import -- \
  --server http://server.example:3000 browser-chan-profile.tar.gz
```

サーバのプロファイルをローカルへ戻す場合は、`profile-export` に `--server` を付けます。

```sh
BROWSER_CHAN_MCP_TOKEN=... nix run .#profile-export -- \
  --server http://server.example:3000 -o server-profile.tar.gz
```

## コマンド

| コマンド | 用途 |
| --- | --- |
| `nix run` / `nix run .#default` | MCP サーバと HTTP サーバを起動する（既定） |
| `nix run .#profile-edit` | ローカルで Chromium を開き、プロファイルを保存する |
| `nix run .#profile-export` | プロファイルを `tar.gz` に書き出す |
| `nix run .#profile-import` | プロファイルをサーバまたはローカルの保存先へ取り込む |

Nix で導入した場合は `browser-chan`、`browser-chan-profile-edit`、`browser-chan-profile-export`、`browser-chan-profile-import` も使えます。

主なオプションです。

| オプション | 対象 | 意味 |
| --- | --- | --- |
| `--server <url>` | export / import | HTTP 経由でサーバとやり取りする |
| `--token <token>` | export / import | Bearer トークン。プロセス一覧に残るため、環境変数か `--token-file` を推奨 |
| `--token-file <file>` | export / import | トークンを書いたファイル |
| `--force` | profile-edit / export / import | ロック中のプロファイルを起動・置換し、既存の export 出力を上書きする |
| `--profile-dir <dir>` | 全体 | プロファイルの保存先 |
| `-o, --output <file>` | export | 出力ファイル名 |

`--token` はシェルの履歴や `ps` に残るため、常用は避けてください。

## 破壊的挙動

- `profile-import` は既存のプロファイルを `<profileDir>.backup-<timestamp>` に rename して残し、その後に新しいプロファイルを配置します。`profileDir` が symlink の場合は拒否します。
- `--force` を付けると、ロック中でも import し、既存の export 出力を上書きします。
- `--server` を付けた export / import は、サーバのブラウザを一時的に閉じます。次の操作でプロファイルから再起動します。
- ローカルで import する場合、展開したファイルの所有者は実行ユーザーになります。root で実行した場合だけ、元のディレクトリの uid / gid に合わせます。所有者を保ちたい場合は `--server` による remote import を推奨します。
- トークン未設定で loopback 以外（`0.0.0.0`、LAN IP、ホスト名など）を指定すると、サーバは起動時にエラーで終了します。
- 既定の bind は `127.0.0.1` です。`0.0.0.0` で待ち受けるときはトークンが必要です。
- 展開後 2GiB を超えるプロファイルは拒否します。`BROWSER_CHAN_PROFILE_MAX_EXTRACTED_BYTES` で変更できます。

## セキュリティ

- トークンは公開インターネットへ直接出さず、Tailscale、SSH トンネル、TLS の内側で使ってください。Bearer トークンは HTTP のままでは平文で流れます。
- トークンはブラウザ操作権限そのものです。漏れた場合はログイン済みプロファイルを操作されます。
- トークンファイルは `600` にし、リポジトリや Nix store に置かないでください。
- `/mcp` は Host と Origin を検査します。IP リテラルの Host は自動で許可され、FQDN は `BROWSER_CHAN_MCP_ALLOWED_HOSTS` にカンマ区切りで追加します。Origin 検査は常に行います。
- loopback で待ち受けていても、同一マシンの任意のページを信頼しないでください。DNS rebinding や同一マシンの他ユーザーからのアクセスを防ぐため、トークンを設定してください。
- export した `tar.gz` は Cookie を含みます。`600` で扱い、不要になったら削除してください。

## NixOS module

`mcpTokenFile` には、利用者が用意したトークンファイルのパスを指定します。次の例のパスはプレースホルダです。

```nix
services.browser-chan = {
  enable = true;
  host = "0.0.0.0";
  port = 3000;
  mcpTokenFile = "/run/secrets/browser-chan-token";
  # リバースプロキシや MagicDNS 名がホスト名と一致しない場合（任意）
  mcpAllowedHosts = [ "browser.example" ];
};
```

`host` が `127.0.0.1`、`::1`、`localhost` の場合は `mcpTokenFile` を省略できます。

## Docker

`BROWSER_CHAN_MCP_TOKEN` が必須です。`BROWSER_CHAN_MCP_TOKEN=... docker compose up` で起動します。コンテナ内の interface は NAT されるため、IP リテラルの Host は自動許可されますが、FQDN やリバースプロキシ経由の hostname は `BROWSER_CHAN_MCP_ALLOWED_HOSTS` に追加してください。

## HTTP API

- `GET /` はニコニコ生放送のページを開き、`{ nicoWsurl, vposBaseTime, liveId }` を `text/plain` の JSON で返します。既存互換のため認証なしです。
- `GET /hand` は GUI の Chromium を開きます。トークン設定時は Bearer 認証が必要です。
- `GET /healthz` は `{ status: "ok", browserOpen: boolean }` を返します。
- `POST /profile/import` と `GET /profile/export` は、それぞれ `application/gzip` のアーカイブを受け取り・返します。トークン設定時は Bearer 認証が必要です。
