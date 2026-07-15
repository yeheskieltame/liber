import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { findBackupFile, readBackupFile, createBackupFile, updateBackupFile } from "./googleDrive.js";

test("findBackupFile returns null when no backup file exists", async () => {
  const fakeFetch = mock.fn(async () => new Response(JSON.stringify({ files: [] }), { status: 200 }));
  const result = await findBackupFile("token123", fakeFetch as typeof fetch);
  assert.equal(result, null);
});

test("findBackupFile returns the file id when a backup exists", async () => {
  const fakeFetch = mock.fn(async (url: string, init?: RequestInit) => {
    assert.ok(url.startsWith("https://www.googleapis.com/drive/v3/files?"));
    assert.equal((init?.headers as Record<string, string>).Authorization, "Bearer token123");
    return new Response(
      JSON.stringify({ files: [{ id: "file-1", name: "liber-wallet-backup.json" }] }),
      { status: 200 }
    );
  });
  const result = await findBackupFile("token123", fakeFetch as typeof fetch);
  assert.deepEqual(result, { fileId: "file-1" });
});

test("readBackupFile fetches and parses the file content", async () => {
  const fakeFetch = mock.fn(async (url: string, init?: RequestInit) => {
    assert.equal(url, "https://www.googleapis.com/drive/v3/files/file-1?alt=media");
    assert.equal((init?.headers as Record<string, string>).Authorization, "Bearer token123");
    return new Response(JSON.stringify({ version: 1, salt: "s", iv: "i", ciphertext: "c" }), { status: 200 });
  });
  const result = await readBackupFile<{ version: number; salt: string; iv: string; ciphertext: string }>(
    "file-1",
    "token123",
    fakeFetch as typeof fetch
  );
  assert.deepEqual(result, { version: 1, salt: "s", iv: "i", ciphertext: "c" });
});

test("createBackupFile posts a multipart request and returns the new file id", async () => {
  const fakeFetch = mock.fn(async (url: string, init?: RequestInit) => {
    assert.equal(url, "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart");
    assert.equal(init?.method, "POST");
    assert.match((init?.headers as Record<string, string>)["Content-Type"], /^multipart\/related/);
    return new Response(JSON.stringify({ id: "new-file-1" }), { status: 200 });
  });
  const result = await createBackupFile(
    { version: 1, salt: "s", iv: "i", ciphertext: "c" },
    "token123",
    fakeFetch as typeof fetch
  );
  assert.deepEqual(result, { fileId: "new-file-1" });
});

test("updateBackupFile patches the existing file's content", async () => {
  const fakeFetch = mock.fn(async (url: string, init?: RequestInit) => {
    assert.equal(url, "https://www.googleapis.com/upload/drive/v3/files/file-1?uploadType=media");
    assert.equal(init?.method, "PATCH");
    return new Response(JSON.stringify({ id: "file-1" }), { status: 200 });
  });
  const result = await updateBackupFile(
    "file-1",
    { version: 1, salt: "s", iv: "i", ciphertext: "c" },
    "token123",
    fakeFetch as typeof fetch
  );
  assert.deepEqual(result, { fileId: "file-1" });
});
