const DOWNLOAD_URL_LIFETIME_MS = 2_000;

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), DOWNLOAD_URL_LIFETIME_MS);
}

export function downloadBytes(
  bytes: Uint8Array,
  type: string,
  filename: string,
) {
  const copiedBytes = new Uint8Array(bytes.byteLength);
  copiedBytes.set(bytes);
  downloadBlob(new Blob([copiedBytes.buffer], { type }), filename);
}

export function downloadRecoveryKeyFile(recoveryKey: string) {
  const content = [
    "POOL PETISCOS - CHAVE DE RECUPERAÇÃO DO PIN",
    "",
    recoveryKey,
    "",
    "Guarde este arquivo em local seguro e fora do computador do caixa.",
    "Esta chave redefine o PIN de Elaine ou Pool. Não compartilhe.",
  ].join("\r\n");
  downloadBlob(
    new Blob([content], { type: "text/plain;charset=utf-8" }),
    "Pool-Petiscos-Chave-de-Recuperacao.txt",
  );
}
