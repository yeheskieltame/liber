import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { backupToGoogleDrive, restoreFromGoogleDrive, checkExistingBackup } from "./driveBackup.js";
import { encrypt } from "./crypto.js";

test("backupToGoogleDrive creates a new file when none exists yet", async () => {
  const methods: string[] = [];
  const fakeFetch = mock.fn(async (url: string, init?: RequestInit) => {
    methods.push(init?.method ?? "GET");
    if (url.includes("q=name")) return new Response(JSON.stringify({ files: [] }), { status: 200 });
    return new Response(JSON.stringify({ id: "new-file-1" }), { status: 200 });
  });

  await backupToGoogleDrive("token123", "SGSECRETVALUE", "my-passphrase", fakeFetch as typeof fetch);

  assert.deepEqual(methods, ["GET", "POST"]);
});

test("backupToGoogleDrive updates the existing file when a backup is already there", async () => {
  const requests: { method: string; url: string }[] = [];
  const fakeFetch = mock.fn(async (url: string, init?: RequestInit) => {
    requests.push({ method: init?.method ?? "GET", url });
    if (url.includes("q=name")) {
      return new Response(
        JSON.stringify({ files: [{ id: "existing-1", name: "liber-wallet-backup.json" }] }),
        { status: 200 }
      );
    }
    return new Response(JSON.stringify({ id: "existing-1" }), { status: 200 });
  });

  await backupToGoogleDrive("token123", "SGSECRETVALUE", "my-passphrase", fakeFetch as typeof fetch);

  const patchRequest = requests.find((r) => r.method === "PATCH");
  assert.ok(patchRequest);
  assert.ok(patchRequest!.url.includes("existing-1"));
});

test("checkExistingBackup returns false when no backup file exists", async () => {
  const fakeFetch = mock.fn(async () => new Response(JSON.stringify({ files: [] }), { status: 200 }));
  const result = await checkExistingBackup("token123", fakeFetch as typeof fetch);
  assert.equal(result, false);
});

test("checkExistingBackup returns true when a backup file exists", async () => {
  const fakeFetch = mock.fn(async () =>
    new Response(JSON.stringify({ files: [{ id: "file-1", name: "liber-wallet-backup.json" }] }), { status: 200 })
  );
  const result = await checkExistingBackup("token123", fakeFetch as typeof fetch);
  assert.equal(result, true);
});

test("restoreFromGoogleDrive decrypts and returns the original secret key", async () => {
  const encrypted = await encrypt("GORIGINALSECRETVALUE", "my-passphrase");
  const fakeFetch = mock.fn(async (url: string) => {
    if (url.includes("q=name")) {
      return new Response(
        JSON.stringify({ files: [{ id: "file-1", name: "liber-wallet-backup.json" }] }),
        { status: 200 }
      );
    }
    return new Response(JSON.stringify({ version: 1, ...encrypted }), { status: 200 });
  });

  const result = await restoreFromGoogleDrive("token123", "my-passphrase", fakeFetch as typeof fetch);
  assert.equal(result, "GORIGINALSECRETVALUE");
});

test("restoreFromGoogleDrive throws a clear error when no backup exists", async () => {
  const fakeFetch = mock.fn(async () => new Response(JSON.stringify({ files: [] }), { status: 200 }));
  await assert.rejects(
    restoreFromGoogleDrive("token123", "my-passphrase", fakeFetch as typeof fetch),
    (err: Error) => {
      assert.equal(err.message, "No Liber backup found in this Google account.");
      return true;
    }
  );
});

test("restoreFromGoogleDrive throws when the stored backup version is newer than supported", async () => {
  const fakeFetch = mock.fn(async (url: string) => {
    if (url.includes("q=name")) {
      return new Response(
        JSON.stringify({ files: [{ id: "file-1", name: "liber-wallet-backup.json" }] }),
        { status: 200 }
      );
    }
    return new Response(JSON.stringify({ version: 2, salt: "s", iv: "i", ciphertext: "c" }), { status: 200 });
  });

  await assert.rejects(
    restoreFromGoogleDrive("token123", "any-passphrase", fakeFetch as typeof fetch),
    (err: Error) => {
      assert.equal(err.message, "This backup was made with a newer version of Liber.");
      return true;
    }
  );
});
