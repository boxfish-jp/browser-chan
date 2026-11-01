import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import {
  link,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { homedir, hostname, tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { promisify } from "node:util";
import {
  exportProfile,
  importProfile,
  isChromiumProfileEntry,
  isProfileLocked,
  isSafeArchiveEntry,
  ProfileArchiveError,
  ProfileLockedError,
  parseSingletonLockTarget,
  validateProfileArchive,
} from "./archive.js";

const execFileAsync = promisify(execFile);

const makeProfile = async (root: string): Promise<string> => {
  const profileDir = join(root, "profile");
  await mkdir(join(profileDir, "Default"), { recursive: true });
  await mkdir(join(profileDir, "Default", "Cache"), { recursive: true });
  await mkdir(join(profileDir, "Default", "Service Worker", "CacheStorage"), {
    recursive: true,
  });
  await mkdir(join(profileDir, "Default", "Service Worker", "ScriptCache"), {
    recursive: true,
  });
  await writeFile(join(profileDir, "Local State"), "{}");
  await writeFile(join(profileDir, "Default", "Preferences"), "{}");
  await writeFile(join(profileDir, "Default", "Cache", "cache.bin"), "cache");
  await writeFile(
    join(profileDir, "Default", "Service Worker", "CacheStorage", "cache"),
    "cache",
  );
  await writeFile(
    join(profileDir, "Default", "Service Worker", "ScriptCache", "script"),
    "cache",
  );
  return profileDir;
};

const listArchive = async (archive: string): Promise<string[]> => {
  const { stdout } = await execFileAsync("tar", ["-tzf", archive]);
  return stdout.split("\n").filter((line) => line.length > 0);
};

describe("isSafeArchiveEntry", () => {
  it("通常の相対パスを受け入れる", () => {
    assert.equal(isSafeArchiveEntry("./Default/Preferences"), true);
    assert.equal(isSafeArchiveEntry("Local State"), true);
  });

  it("絶対パスを拒否する", () => {
    assert.equal(isSafeArchiveEntry("/etc/passwd"), false);
  });

  it("親ディレクトリ参照を拒否する", () => {
    assert.equal(isSafeArchiveEntry("../../etc/passwd"), false);
    assert.equal(isSafeArchiveEntry("./Default/../../escape"), false);
  });

  it("Windowsドライブパスを拒否する", () => {
    assert.equal(isSafeArchiveEntry("C:/Windows/system.ini"), false);
    assert.equal(isSafeArchiveEntry("C:\\Windows\\system.ini"), false);
  });

  it("NUL文字を含むパスを拒否する", () => {
    assert.equal(isSafeArchiveEntry("Default/Preferences\0.txt"), false);
  });
});

describe("isChromiumProfileEntry", () => {
  it("Local StateとDefault配下を受け入れる", () => {
    assert.equal(isChromiumProfileEntry("Local State"), true);
    assert.equal(isChromiumProfileEntry("./Local State"), true);
    assert.equal(isChromiumProfileEntry("./Default/"), true);
    assert.equal(isChromiumProfileEntry("Default"), true);
  });

  it("その他のファイルを拒否する", () => {
    assert.equal(isChromiumProfileEntry("readme.txt"), false);
    assert.equal(isChromiumProfileEntry("./Other/Preferences"), false);
  });
});

describe("parseSingletonLockTarget", () => {
  it("hostname-pid形式を解析する", () => {
    assert.deepEqual(parseSingletonLockTarget("my-host-1234"), {
      hostname: "my-host",
      pid: 1234,
    });
  });

  it("PIDを含まないtargetを拒否する", () => {
    assert.equal(parseSingletonLockTarget("my-host"), null);
    assert.equal(parseSingletonLockTarget("my-host-not-a-pid"), null);
    assert.equal(parseSingletonLockTarget(null), null);
  });
});

describe("isProfileLocked", () => {
  it("SingletonLockがなければCookieだけではロックと判定しない", async () => {
    const root = await mkdtemp(join(tmpdir(), "browser-chan-archive-"));
    try {
      const profileDir = join(root, "profile");
      await mkdir(profileDir);
      await writeFile(join(profileDir, "SingletonCookie"), "cookie");
      assert.equal(await isProfileLocked(profileDir), false);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

describe("validateProfileArchive", () => {
  it("symlinkを含むアーカイブを拒否する", async () => {
    const root = await mkdtemp(join(tmpdir(), "browser-chan-archive-"));
    try {
      const source = join(root, "source");
      await mkdir(source);
      await writeFile(join(source, "target.txt"), "target");
      await symlink("target.txt", join(source, "link.txt"));
      const archive = join(root, "symlink.tar.gz");
      await execFileAsync("tar", ["-C", source, "-czf", archive, "link.txt"]);
      await assert.rejects(
        validateProfileArchive(archive),
        ProfileArchiveError,
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("hardlinkを含むアーカイブを拒否する", async () => {
    const root = await mkdtemp(join(tmpdir(), "browser-chan-archive-"));
    try {
      const source = join(root, "source");
      await mkdir(source);
      await writeFile(join(source, "file.txt"), "file");
      await link(join(source, "file.txt"), join(source, "hard.txt"));
      const archive = join(root, "hardlink.tar.gz");
      await execFileAsync("tar", [
        "-C",
        source,
        "-czf",
        archive,
        "file.txt",
        "hard.txt",
      ]);
      await assert.rejects(
        validateProfileArchive(archive),
        ProfileArchiveError,
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("展開後サイズが上限を超えるアーカイブを拒否する", async () => {
    const root = await mkdtemp(join(tmpdir(), "browser-chan-archive-"));
    try {
      const profileDir = await makeProfile(root);
      const archive = join(root, "profile.tar.gz");
      await exportProfile({ profileDir, output: archive });
      await assert.rejects(
        validateProfileArchive(archive, undefined, 1),
        ProfileArchiveError,
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

describe("exportProfile", () => {
  it("キャッシュとSingletonロックを除いてアーカイブを作る", async () => {
    const root = await mkdtemp(join(tmpdir(), "browser-chan-archive-"));
    try {
      const profileDir = await makeProfile(root);
      await symlink(`${hostname()}-999999`, join(profileDir, "SingletonLock"));
      const archive = join(root, "profile.tar.gz");
      await exportProfile({ profileDir, output: archive });
      const entries = await listArchive(archive);
      assert.equal(
        entries.some((entry) => entry.includes("Preferences")),
        true,
      );
      assert.equal(
        entries.some((entry) => entry.includes("Cache")),
        false,
      );
      assert.equal(
        entries.some((entry) => entry.includes("Singleton")),
        false,
      );
      assert.equal((await validateProfileArchive(archive)) > 0, true);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("profileDir内の出力を拒否する", async () => {
    const root = await mkdtemp(join(tmpdir(), "browser-chan-archive-"));
    try {
      const profileDir = await makeProfile(root);
      await assert.rejects(
        exportProfile({
          profileDir,
          output: join(profileDir, "export.tar.gz"),
        }),
        ProfileArchiveError,
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("forceなしで既存出力を拒否する", async () => {
    const root = await mkdtemp(join(tmpdir(), "browser-chan-archive-"));
    try {
      const profileDir = await makeProfile(root);
      const archive = join(root, "profile.tar.gz");
      await writeFile(archive, "existing");
      await assert.rejects(
        exportProfile({ profileDir, output: archive }),
        ProfileArchiveError,
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

describe("importProfile", () => {
  it("既存プロファイルをバックアップして置き換える", async () => {
    const root = await mkdtemp(join(tmpdir(), "browser-chan-archive-"));
    try {
      const source = await makeProfile(root);
      const archive = join(root, "profile.tar.gz");
      await exportProfile({ profileDir: source, output: archive });
      const destination = join(root, "destination");
      await mkdir(destination);
      await writeFile(join(destination, "old-marker"), "old");

      const result = await importProfile({ profileDir: destination, archive });
      assert.equal(result.profileDir, destination);
      assert.notEqual(result.backupDir, null);
      assert.equal(
        await readFile(join(destination, "Default", "Preferences"), "utf8"),
        "{}",
      );
      const backupEntries = await readdir(result.backupDir ?? "");
      assert.equal(backupEntries.includes("old-marker"), true);
      const destinationEntries = await readdir(destination);
      assert.equal(destinationEntries.includes("old-marker"), false);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("forceなしでロック中のprofileDirを拒否する", async () => {
    const root = await mkdtemp(join(tmpdir(), "browser-chan-archive-"));
    try {
      const source = await makeProfile(root);
      const archive = join(root, "profile.tar.gz");
      await exportProfile({ profileDir: source, output: archive });
      const destination = join(root, "destination");
      await mkdir(destination);
      await symlink(
        `${hostname()}-${process.pid}`,
        join(destination, "SingletonLock"),
      );
      await assert.rejects(
        importProfile({ profileDir: destination, archive }),
        ProfileLockedError,
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("壊れたアーカイブを拒否する", async () => {
    const root = await mkdtemp(join(tmpdir(), "browser-chan-archive-"));
    try {
      const destination = join(root, "destination");
      const archive = join(root, "broken.tar.gz");
      await writeFile(archive, "not a tar archive");
      await assert.rejects(
        importProfile({ profileDir: destination, archive }),
        ProfileArchiveError,
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("symlinkのprofileDirを拒否する", async () => {
    const root = await mkdtemp(join(tmpdir(), "browser-chan-archive-"));
    try {
      const source = await makeProfile(root);
      const archive = join(root, "profile.tar.gz");
      await exportProfile({ profileDir: source, output: archive });
      const target = join(root, "target");
      await mkdir(target);
      const linkDir = join(root, "profile-link");
      await symlink(target, linkDir);
      await assert.rejects(
        importProfile({ profileDir: linkDir, archive }),
        ProfileArchiveError,
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("rootとホームディレクトリをインポート先に拒否する", async () => {
    const root = await mkdtemp(join(tmpdir(), "browser-chan-archive-"));
    try {
      const archive = join(root, "profile.tar.gz");
      await assert.rejects(
        importProfile({ profileDir: "/", archive }),
        ProfileArchiveError,
      );
      await assert.rejects(
        importProfile({ profileDir: homedir(), archive }),
        ProfileArchiveError,
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("Chromiumプロファイルを含まないアーカイブを拒否する", async () => {
    const root = await mkdtemp(join(tmpdir(), "browser-chan-archive-"));
    try {
      const source = join(root, "source");
      await mkdir(source);
      await writeFile(join(source, "readme.txt"), "hello");
      const archive = join(root, "profile.tar.gz");
      await execFileAsync("tar", ["-C", source, "-czf", archive, "readme.txt"]);
      await assert.rejects(
        importProfile({ profileDir: join(root, "destination"), archive }),
        ProfileArchiveError,
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
