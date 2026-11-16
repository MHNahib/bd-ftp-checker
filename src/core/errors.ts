import type { CheckStatus } from "../types.js";

/** Map a Node network error to a CheckStatus. */
export function classifyError(err: unknown): CheckStatus {
  const e = err as { code?: string; name?: string; message?: string } | undefined;
  const code = e?.code ?? "";
  const msg = e?.message ?? "";

  if (e?.name === "AbortError" || e?.name === "TimeoutError" || code === "ABORT_ERR")
    return "timeout";
  switch (code) {
    case "ETIMEDOUT":
    case "ESOCKETTIMEDOUT":
    case "ECONNABORTED":
      return "timeout";
    case "ENOTFOUND":
    case "EAI_AGAIN":
    case "EAI_FAIL":
    case "EAI_NONAME":
    case "EAI_NODATA":
      return "dns";
    case "ECONNREFUSED":
      return "refused";
    case "EHOSTUNREACH":
    case "ENETUNREACH":
    case "EHOSTDOWN":
    case "ENETDOWN":
    case "EADDRNOTAVAIL":
      return "unreachable";
    case "ECONNRESET":
    case "EPIPE":
    case "ERR_STREAM_PREMATURE_CLOSE":
      return "reset";
  }
  if (/^(ERR_TLS|ERR_SSL|CERT_|UNABLE_TO|DEPTH_ZERO|SELF_SIGNED|EPROTO)/.test(code)) return "tls";
  if (/socket hang up/i.test(msg)) return "reset";
  if (/timed? ?out/i.test(msg)) return "timeout";
  return "error";
}

export function errorMessage(err: unknown): string {
  const e = err as { code?: string; message?: string } | undefined;
  return e?.code ?? e?.message ?? String(err);
}

export class TimeoutError extends Error {
  override name = "TimeoutError";
  code = "ETIMEDOUT";
}
