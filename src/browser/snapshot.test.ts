import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { PageSnapshot, SnapshotElement } from "./snapshot.js";
import {
  formatPageSnapshot,
  MAX_SNAPSHOT_ELEMENTS,
  MAX_SNAPSHOT_TEXT,
} from "./snapshot.js";

const snapshotOf = (
  elements: SnapshotElement[],
  text = "hello",
): PageSnapshot => ({
  url: "https://example.com/",
  title: "Example",
  text,
  elements,
});

describe("formatPageSnapshot", () => {
  it("要素をrefとroleと名前の行で整形する", () => {
    const formatted = formatPageSnapshot(
      snapshotOf([
        {
          ref: "e1",
          role: "link",
          name: "ログイン",
          href: "https://example.com/login",
        },
      ]),
    );
    assert.match(formatted, /^URL: https:\/\/example\.com\/$/m);
    assert.match(formatted, /^Title: Example$/m);
    assert.match(formatted, /^Text:$/m);
    assert.match(formatted, /^Interactive elements:$/m);
    assert.match(
      formatted,
      /^e1 \| link \| ログイン \| href=https:\/\/example\.com\/login$/m,
    );
  });

  it("本文が20000文字を超えると切り詰める", () => {
    const text = "a".repeat(MAX_SNAPSHOT_TEXT + 100);
    const formatted = formatPageSnapshot(snapshotOf([], text));
    assert.match(formatted, /\.\.\.\[truncated\]/);
    assert.equal(formatted.includes(text), false);
  });

  it("要素数が300を超えると切り詰める", () => {
    const elements = Array.from(
      { length: MAX_SNAPSHOT_ELEMENTS + 5 },
      (_, index) => ({
        ref: `e${index + 1}`,
        role: "button",
        name: `ボタン${index + 1}`,
      }),
    );
    const formatted = formatPageSnapshot(snapshotOf(elements));
    assert.match(formatted, /e300 \| button \| ボタン300/);
    assert.equal(formatted.includes("e301 |"), false);
  });

  it("inputのvalueを出力せずpasswordはtypeだけを表示する", () => {
    const element = {
      ref: "e1",
      role: "textbox",
      name: "パスワード",
      type: "password",
      value: "hunter2",
    } as SnapshotElement;
    const formatted = formatPageSnapshot(snapshotOf([element]));
    assert.match(formatted, /^e1 \| textbox \| パスワード \| type=password$/m);
    assert.equal(formatted.includes("hunter2"), false);
    assert.equal(formatted.includes("value="), false);
  });
});
