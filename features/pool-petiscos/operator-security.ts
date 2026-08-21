import type { OperatorCredential } from "./types";

export const PIN_LENGTH = 6;
export const PIN_ITERATIONS = 210_000;
export const RECOVERY_KEY_GROUPS = 4;
export const RECOVERY_KEY_GROUP_LENGTH = 4;
export const RECOVERY_KEY_ITERATIONS = 310_000;

const RECOVERY_KEY_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

const COMMON_PINS = new Set([
  "000000",
  "111111",
  "123123",
  "123456",
  "222222",
  "333333",
  "444444",
  "555555",
  "654321",
  "666666",
  "777777",
  "888888",
  "999999",
]);

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(value: string) {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function derivePinHash(
  secret: string,
  salt: Uint8Array,
  iterations: number,
) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt: salt as BufferSource,
      iterations,
    },
    key,
    256,
  );
  return new Uint8Array(bits);
}

async function verifyCredentialSecret(
  secret: string,
  credential: OperatorCredential,
) {
  try {
    const actual = await derivePinHash(
      secret,
      base64ToBytes(credential.salt),
      credential.iterations,
    );
    const expected = base64ToBytes(credential.hash);
    if (actual.length !== expected.length) return false;
    let difference = 0;
    for (let index = 0; index < actual.length; index += 1) {
      difference |= actual[index] ^ expected[index];
    }
    return difference === 0;
  } catch {
    return false;
  }
}

export function sanitizePin(value: string) {
  return value.replace(/\D/g, "").slice(0, PIN_LENGTH);
}

export function validateOperatorPin(pin: string): string | null {
  if (!/^\d{6}$/.test(pin)) return "Use exatamente 6 números.";
  if (COMMON_PINS.has(pin)) return "Escolha um PIN menos comum.";
  if (/^(\d)\1{5}$/.test(pin)) return "Não repita o mesmo número.";
  if (/^(\d{2})\1{2}$/.test(pin) || /^(\d{3})\1$/.test(pin)) {
    return "Evite blocos repetidos, como 121212.";
  }
  const ascending = "0123456789012345";
  const descending = "9876543210987654";
  if (ascending.includes(pin) || descending.includes(pin)) {
    return "Evite sequências, como 123456 ou 654321.";
  }
  return null;
}

export async function createOperatorCredential(
  pin: string,
): Promise<OperatorCredential> {
  const validationError = validateOperatorPin(pin);
  if (validationError) throw new Error(validationError);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await derivePinHash(pin, salt, PIN_ITERATIONS);
  return {
    algorithm: "PBKDF2-SHA-256",
    iterations: PIN_ITERATIONS,
    salt: bytesToBase64(salt),
    hash: bytesToBase64(hash),
    updatedAt: Date.now(),
  };
}

export async function verifyOperatorPin(
  pin: string,
  credential: OperatorCredential,
) {
  if (!/^\d{6}$/.test(pin)) return false;
  return verifyCredentialSecret(pin, credential);
}

export function normalizeRecoveryKey(value: string) {
  const compact = value.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const maximumLength = RECOVERY_KEY_GROUPS * RECOVERY_KEY_GROUP_LENGTH;
  return compact
    .slice(0, maximumLength)
    .match(new RegExp(`.{1,${RECOVERY_KEY_GROUP_LENGTH}}`, "g"))
    ?.join("-") ?? "";
}

function compactRecoveryKey(value: string) {
  return normalizeRecoveryKey(value).replaceAll("-", "");
}

export function isCompleteRecoveryKey(value: string) {
  return (
    compactRecoveryKey(value).length ===
    RECOVERY_KEY_GROUPS * RECOVERY_KEY_GROUP_LENGTH
  );
}

export async function createPinRecoveryCredential(): Promise<{
  key: string;
  credential: OperatorCredential;
}> {
  const random = crypto.getRandomValues(
    new Uint8Array(RECOVERY_KEY_GROUPS * RECOVERY_KEY_GROUP_LENGTH),
  );
  const compact = Array.from(
    random,
    (value) => RECOVERY_KEY_ALPHABET[value % RECOVERY_KEY_ALPHABET.length],
  ).join("");
  const key = normalizeRecoveryKey(compact);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await derivePinHash(compact, salt, RECOVERY_KEY_ITERATIONS);
  return {
    key,
    credential: {
      algorithm: "PBKDF2-SHA-256",
      iterations: RECOVERY_KEY_ITERATIONS,
      salt: bytesToBase64(salt),
      hash: bytesToBase64(hash),
      updatedAt: Date.now(),
    },
  };
}

export async function verifyPinRecoveryKey(
  key: string,
  credential: OperatorCredential,
) {
  const compact = compactRecoveryKey(key);
  if (
    compact.length !==
    RECOVERY_KEY_GROUPS * RECOVERY_KEY_GROUP_LENGTH
  ) {
    return false;
  }
  return verifyCredentialSecret(compact, credential);
}
