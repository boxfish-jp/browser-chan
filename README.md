# browser-chan

永続 Chromium プロファイルを 1 プロセスで共有し、MCP（Streamable HTTP）と既存の HTTP API から操作するブラウザサーバです。ニコニコ生放送の `GET /` も提供し、プロファイルの作成・export・import は CLI で行います。

## 動作環境

- Nix（flakes を有効にした状態）。
- `x86_64-linux` / `aarch64-linux`。`x86_64-linux` のみ動作確認済みです。
- Home Manager（Linux の systemd user service で常駐させる場合）。
- Chromium はこの flake が `playwright-driver` から用意します。利用者が別途インストールする必要はありません。
- `edit` は X11 または Wayland のデスクトップが必要です。
- MCP クライアントはこのリポジトリに含みません。DSH を使う場合は `@deepseek-ai/dsh-mcp-client` を利用者側の設定に追加します。
- 動作確認済み: Node.js `24.18.0`、pnpm `11.13.1`、Playwright `1.61.1`、DSH `0.2.1-rc.3`。

## 最小の使い方

`nix run` でサーバを起動します。

```sh
nix run
```

常駐させる場合は Home Manager module を使います。設定は [Home Manager module](#home-manager-module) を参照してください。

MCP サーバの待ち受けアドレスは `BROWSER_CHAN_HOST` で決まり、既定は `127.0.0.1` です。DSH の URL は、待ち受けているアドレスかホスト名に合わせてください。既定なら `http://127.0.0.1:3000/mcp`、`localhost` なら `http://localhost:3000/mcp`、`::1` なら `http://[::1]:3000/mcp` です。

別マシンから接続するために `BROWSER_CHAN_HOST=0.0.0.0` や `::` で待ち受ける場合は、接続元から見えるマシンの IP アドレスかホスト名を DSH に設定してください（例: `http://192.0.2.10:3000/mcp`）。[セキュリティ](#セキュリティ) の注意も読んでください。

DSH のプロファイルにある `cordis.patch.yml` に次のエントリを追加します。`serverName: browser` によりツールは `mcp__browser__*` として見えます。

```yaml
- id: mcp-browser
  name: '@deepseek-ai/dsh-mcp-client'
  config:
    serverName: browser
    transport: streamable-http
    url: http://127.0.0.1:3000/mcp
    failOnStartupError: true
```

### プロファイルの流れ

Home Manager のユーザーサービスでサーバを動かしている場合の例です。ローカルの Linux PC でログイン済みプロファイルを作り、サーバへ移します。

```sh
# ローカル PC: Chromium を開いてログインする
nix run .#edit

# ローカル PC: アーカイブを作る
nix run .#export -- -o browser-chan-profile.tar.gz

# ローカル PC: サーバへ送る
scp -p browser-chan-profile.tar.gz server:/tmp/
rm browser-chan-profile.tar.gz
```

```sh
# サーバのユーザーシェル: サービスを止めて取り込む
systemctl --user stop browser-chan
browser-chan-import --profile-dir "$HOME/.local/share/browser-chan" /tmp/browser-chan-profile.tar.gz
rm /tmp/browser-chan-profile.tar.gz
systemctl --user start browser-chan
```

`browser-chan-import` は Home Manager module が `home.packages` に入れます。`systemctl --user` と `browser-chan-import` は、サーバにログインしたユーザーのシェルで実行してください。`browser-chan-import` が PATH に無い場合は、サーバに browser-chan のチェックアウトがあるときに、そのディレクトリで `nix run .#import -- --profile-dir "$HOME/.local/share/browser-chan" /tmp/browser-chan-profile.tar.gz` を使います。

サーバのプロファイルを書き出す場合も、同じユーザーでサービスを止めてから実行します。

```sh
# サーバのユーザーシェル
systemctl --user stop browser-chan
browser-chan-export --profile-dir "$HOME/.local/share/browser-chan" -o /tmp/server-profile.tar.gz
systemctl --user start browser-chan
```

`browser-chan-export` も PATH に無い場合は、サーバのチェックアウトで `nix run .#export -- --profile-dir "$HOME/.local/share/browser-chan" -o /tmp/server-profile.tar.gz` を使います。

```sh
# ローカル PC
scp -p server:/tmp/server-profile.tar.gz .
ssh server rm /tmp/server-profile.tar.gz
```

import は自動では行いません。`tar.gz` を明示指定して手動で反映します。zip は扱いません。

## コマンド

| コマンド | 用途 |
| --- | --- |
| `nix run` / `nix run .#default` | MCP サーバと HTTP サーバを起動する（既定） |
| `nix run .#edit` | ローカルで Chromium を開き、プロファイルを保存する |
| `nix run .#export` | プロファイルを `tar.gz` に書き出す |
| `nix run .#import` | `tar.gz` をプロファイルディレクトリへ取り込む |

Nix で導入した場合は `browser-chan`、`browser-chan-export`、`browser-chan-import` も使えます。GUI の `edit` は browser-chan のチェックアウトで `nix run .#edit` を実行してください。

主なオプションです。

| オプション | 対象 | 意味 |
| --- | --- | --- |
| `--force` | edit / export / import | ロック中でも `edit` を開き、`import` で置き換え、既存の export 出力を上書きする |
| `--profile-dir <dir>` | edit / export / import | プロファイルの保存先 |
| `-o, --output <file>` | export | 出力ファイル名 |

## 破壊的挙動

- `import` は既存のプロファイルを `<profileDir>.backup-<timestamp>` に rename して残し、その後に新しいプロファイルを配置します。`profileDir` が symlink の場合は拒否します。
- `--force` がない場合、ブラウザがプロファイルをロックしている間は `edit` / `export` / `import` が失敗します。
- import したプロファイルの所有者は実行ユーザーになります。Home Manager のユーザーサービスでは root は不要です。root で実行した場合だけ、既存プロファイルの所有者、なければ親ディレクトリの所有者に合わせます。

## セキュリティ

- 認証はありません。`/mcp` に到達できる相手はブラウザを操作できます。到達範囲は `BROWSER_CHAN_HOST` の待ち受けアドレスと、前段のプロキシやファイアウォールの設定で決まります。
- 前段のプロキシやファイアウォールで絞っていない限り、`0.0.0.0` などで待ち受けると同一ネットワークの誰でもブラウザを操作できます。ブラウザ操作権限そのものなので、信頼できるネットワークに限ってください。
- リバースプロキシや `tailscale serve` を前段に置く場合は、前段の ACL で絞ってください。
- 同一マシンの他プロセスや他ユーザーからもアクセスできます。信頼できる利用者だけがログインするマシンで動かしてください。
- export / import する `tar.gz` は Cookie を含みます。`600` で扱い、Nix store に置かず、不要になったら削除してください。

## Home Manager module

flake の input に追加し、`homeManagerModules.default` を import します。`/path/to/browser-chan` は実際のパスに置き換えます。

```nix
# flake.nix
inputs = {
  browser-chan.url = "path:/path/to/browser-chan";
};
```

```nix
# home.nix
{ inputs, ... }:
{
  imports = [ inputs.browser-chan.homeManagerModules.default ];

  services.browser-chan = {
    enable = true;
    host = "127.0.0.1";
    port = 3000;
  };
}
```

`home-manager` は利用者の flake に追加済みとします。`inputs` は `homeManagerConfiguration` の `extraSpecialArgs` などで Home Manager module へ渡します。`host` は待ち受けアドレスで、既定は `127.0.0.1` です。`0.0.0.0` などを指定すると、他のホストからもアクセスできます。

`profileDir` の既定は `~/.local/share/browser-chan` です。`profileDir` を変更した場合は、`browser-chan-import` / `browser-chan-export` にも `--profile-dir <dir>` を渡してください。`home.packages` に `browser-chan` と CLI 群が入ります。GUI の `edit` は、browser-chan のチェックアウトで `nix run .#edit`、input 経由なら `nix run /path/to/browser-chan#edit` を使います。

サービスは systemd user service として動きます。

```sh
systemctl --user start browser-chan
systemctl --user status browser-chan
systemctl --user restart browser-chan
```

ログインしていない間も動かす場合は linger を有効にします。NixOS では `users.users.<name>.linger = true`（`<name>` はユーザー名）、それ以外では `loginctl enable-linger "$USER"` を設定します。

## Docker

docker compose は `network_mode: host` で起動し、コンテナ内も既定で `127.0.0.1:3000` で待ち受けます。`docker compose up` で起動し、DSH からは `http://127.0.0.1:3000/mcp` に接続します。

プロファイルは `./browser-profile` に bind mount されます。コンテナは root で動くため、ホスト側で export / import する場合は `docker compose down` の後に `sudo chown -R "$(id -u):$(id -g)" ./browser-profile` で所有者を戻し、`nix run .#export -- --profile-dir ./browser-profile` を実行してください。

## HTTP API

- `GET /` はニコニコ生放送のページを開き、`{ nicoWsurl, vposBaseTime, liveId }` を `text/plain` の JSON で返します。
- `GET /healthz` は `{ status: "ok", browserOpen: boolean }` を返します。
- プロファイルの export / import は CLI の `export` / `import` を使います。
