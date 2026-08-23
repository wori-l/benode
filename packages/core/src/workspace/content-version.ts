export async function createContentVersion(
  content: string,
): Promise<string> {
  const digest = new Uint8Array(
    await globalThis.crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(content),
    ),
  );
  return "sha256:" + [...digest]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}
