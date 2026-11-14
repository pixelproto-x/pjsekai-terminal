import { AppError } from "./errors.mjs";

export async function fetchJson(url, options = {}) {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const signal = options.signal;
  const timeoutMs = options.timeoutMs ?? 12000;
  if (typeof fetchImpl !== "function") {
    throw new AppError("FETCH_UNAVAILABLE", "This browser does not support network requests.");
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(url, globalThis.location?.href);
  } catch (cause) {
    throw new AppError("URL_INVALID", "The data source URL is invalid.", { cause });
  }
  if (!["http:", "https:"].includes(parsedUrl.protocol)) {
    throw new AppError("URL_PROTOCOL_UNSUPPORTED", "Only HTTP and HTTPS sources are supported.");
  }

  const controller = new AbortController();
  const abortFromCaller = () => controller.abort(signal?.reason);
  if (signal?.aborted) abortFromCaller();
  else signal?.addEventListener("abort", abortFromCaller, { once: true });

  let timeout;
  try {
    timeout = setTimeout(() => controller.abort(new Error("Request timed out.")), timeoutMs);
    const response = await fetchImpl(parsedUrl.href, {
      method: "GET",
      headers: { Accept: "application/json", ...(options.headers ?? {}) },
      signal: controller.signal,
    });
    if (!response.ok) {
      const retryable = response.status === 408 || response.status === 429 || response.status >= 500;
      throw new AppError("UPSTREAM_HTTP_ERROR", "Data source returned HTTP " + response.status + ".", {
        retryable,
        details: { status: response.status, url: parsedUrl.href },
      });
    }
    try {
      return await response.json();
    } catch (cause) {
      throw new AppError("UPSTREAM_INVALID_JSON", "Data source returned invalid JSON.", {
        cause,
        details: { url: parsedUrl.href },
      });
    }
  } catch (error) {
    if (controller.signal.aborted && !signal?.aborted) {
      throw new AppError("REQUEST_TIMEOUT", "The data source took too long to respond.", {
        cause: error,
        retryable: true,
      });
    }
    if (error instanceof AppError) throw error;
    throw new AppError("NETWORK_ERROR", error?.message || "Could not reach the data source.", {
      cause: error,
      retryable: true,
    });
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", abortFromCaller);
  }
}
