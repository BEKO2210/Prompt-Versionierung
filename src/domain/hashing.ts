import { createHash } from "node:crypto";

// Canonical content hash for a prompt version.
//
// Two versions produce the same hash iff their semantic content is the
// same. The hash is informational (not unique in the DB): a revert is
// intentionally allowed to reproduce a prior hash.

export interface HashableContent {
  title: string;
  body: string;
  messages?: ReadonlyArray<{ role: string; content: string }> | null | undefined;
}

const SEP = "\x1f"; // unit separator — cannot appear in normal text input

function nfc(s: string): string {
  return s.normalize("NFC");
}

function canonicalMessages(
  messages: HashableContent["messages"],
): string {
  if (!messages || messages.length === 0) return "";
  return messages
    .map((m) => `${nfc(m.role)}${SEP}${nfc(m.content)}`)
    .join(SEP);
}

export function contentHash(content: HashableContent): string {
  const hasher = createHash("sha256");
  hasher.update(nfc(content.title));
  hasher.update(SEP);
  hasher.update(nfc(content.body));
  hasher.update(SEP);
  hasher.update(canonicalMessages(content.messages ?? null));
  return hasher.digest("hex");
}

export function sameContent(a: HashableContent, b: HashableContent): boolean {
  return contentHash(a) === contentHash(b);
}
