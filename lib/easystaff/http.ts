// HTTP client for EasyStaff. Requests are strictly sequential (one at a time per
// process) with ~1 s between calls, a 30 s timeout and exponential-backoff retries.

export type EasyStaffErrorKind = "network" | "http" | "parse" | "validation";

export class EasyStaffError extends Error {
  constructor(
    readonly kind: EasyStaffErrorKind,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "EasyStaffError";
  }
}

export type EasyStaffClientOptions = {
  baseUrl: string;
  userAgent?: string;
  timeoutMs?: number;
  retries?: number;
  minIntervalMs?: number;
  backoffBaseMs?: number;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
};

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export class EasyStaffClient {
  readonly baseUrl: string;
  private readonly userAgent: string;
  private readonly timeoutMs: number;
  private readonly retries: number;
  private readonly minIntervalMs: number;
  private readonly backoffBaseMs: number;
  private readonly fetchImpl: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;
  private queue: Promise<unknown> = Promise.resolve();
  private lastRequestAt = 0;

  constructor(opts: EasyStaffClientOptions) {
    this.baseUrl = opts.baseUrl.endsWith("/") ? opts.baseUrl : `${opts.baseUrl}/`;
    this.userAgent = opts.userAgent ?? "unibg-calendar-sync/1.0";
    this.timeoutMs = opts.timeoutMs ?? 30_000;
    this.retries = opts.retries ?? 3;
    this.minIntervalMs = opts.minIntervalMs ?? 1_000;
    this.backoffBaseMs = opts.backoffBaseMs ?? 1_000;
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.sleep = opts.sleep ?? defaultSleep;
  }

  url(path: string): string {
    return new URL(path, this.baseUrl).toString();
  }

  get(path: string): Promise<string> {
    return this.enqueue(() => this.requestWithRetry(path, { method: "GET" }));
  }

  postForm(path: string, form: URLSearchParams): Promise<string> {
    return this.enqueue(() =>
      this.requestWithRetry(path, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8" },
        body: form.toString(),
      }),
    );
  }

  /** Serialises all requests of this client instance. */
  private enqueue<T>(task: () => Promise<T>): Promise<T> {
    const run = this.queue.then(async () => {
      const wait = this.lastRequestAt + this.minIntervalMs - Date.now();
      if (this.lastRequestAt > 0 && wait > 0) await this.sleep(wait);
      try {
        return await task();
      } finally {
        this.lastRequestAt = Date.now();
      }
    });
    this.queue = run.catch(() => undefined);
    return run;
  }

  private async requestWithRetry(path: string, init: RequestInit): Promise<string> {
    let lastError: unknown;
    for (let attempt = 0; attempt <= this.retries; attempt++) {
      if (attempt > 0) await this.sleep(this.backoffBaseMs * 2 ** (attempt - 1));
      try {
        return await this.request(path, init);
      } catch (err) {
        lastError = err;
        const retryable =
          err instanceof EasyStaffError &&
          (err.kind === "network" ||
            (err.kind === "http" && isRetryableStatus((err.details as { status?: number })?.status)));
        if (!retryable) throw err;
      }
    }
    throw lastError;
  }

  private async request(path: string, init: RequestInit): Promise<string> {
    let res: Response;
    try {
      res = await this.fetchImpl(this.url(path), {
        ...init,
        headers: {
          "User-Agent": this.userAgent,
          Accept: "application/json, text/javascript, */*; q=0.01",
          ...(init.headers ?? {}),
        },
        signal: AbortSignal.timeout(this.timeoutMs),
        cache: "no-store",
      });
    } catch (err) {
      throw new EasyStaffError("network", `Richiesta a EasyStaff fallita: ${(err as Error).message}`, {
        path,
      });
    }
    if (!res.ok) {
      throw new EasyStaffError("http", `EasyStaff ha risposto ${res.status} per ${path}`, {
        path,
        status: res.status,
      });
    }
    return decodeBody(await res.arrayBuffer());
  }
}

function isRetryableStatus(status: number | undefined): boolean {
  return status === undefined || status === 408 || status === 429 || status >= 500;
}

/** The portal declares Windows-1252; payloads are usually ASCII with \u escapes. */
export function decodeBody(buf: ArrayBuffer): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buf);
  } catch {
    return new TextDecoder("windows-1252").decode(buf);
  }
}
