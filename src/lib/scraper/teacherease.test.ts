import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildLoginFormBody, extractLoginFormFields, login } from "./teacherease";
import { LoginError } from "./types";

const FIXTURE_PATH = join(__dirname, "../../../tests/fixtures/login-page.html");
const LOGIN_PAGE_HTML = readFileSync(FIXTURE_PATH, "utf8");

const DUMMY_BASE = "https://school.example.teacherease.com";
const DUMMY_CREDS = { username: "test@example.com", password: "hunter2" } as const;

// Minimal Response stand-in: the real fetch Response has 30+ fields and
// browsers/Node disagree on exact shape. Tests only touch what login() uses.
type ResponseLike = Pick<Response, "ok" | "status" | "type" | "headers" | "text">;

function mockResponse(opts: {
  status: number;
  body?: string;
  setCookies?: readonly string[];
  type?: ResponseType;
}): ResponseLike {
  const setCookies = opts.setCookies ?? [];
  const body = opts.body ?? "";
  return {
    ok: opts.status >= 200 && opts.status < 300,
    status: opts.status,
    type: opts.type ?? "basic",
    headers: {
      getSetCookie: () => [...setCookies],
    } as unknown as Headers,
    text: async () => body,
  };
}

describe("extractLoginFormFields", () => {
  it("returns every hidden input from the fixture by name", () => {
    const fields = extractLoginFormFields(LOGIN_PAGE_HTML);
    expect(Object.keys(fields).sort()).toEqual([
      "LoginRequestID",
      "ctlTE$TEContentPlaceHolder$__AntiCsrfToken",
      "fromResetPassword",
      "requestedServerApiVersion",
      "targetPage",
    ]);
  });

  it("captures non-empty values for the fields the server populates", () => {
    const csrfKey = "ctlTE$TEContentPlaceHolder$__AntiCsrfToken";
    const fields = extractLoginFormFields(LOGIN_PAGE_HTML);
    expect(fields.fromResetPassword).toBe("False");
    expect(fields.requestedServerApiVersion).toBe("1.0");
    expect(fields.LoginRequestID).toMatch(/^[0-9a-f-]{36}$/i);
    expect(fields[csrfKey]).toMatch(/^[0-9a-f-]{36}$/i);
  });

  it("returns an empty object when the HTML has no form", () => {
    expect(extractLoginFormFields("<html><body>no form here</body></html>")).toEqual({});
  });

  it("includes hidden inputs with empty values", () => {
    const html = '<form><input type="hidden" name="targetPage" value="" /></form>';
    expect(extractLoginFormFields(html)).toEqual({ targetPage: "" });
  });
});

describe("buildLoginFormBody", () => {
  it("includes every hidden field and the credentials", () => {
    const hiddenFields = {
      csrfToken: "tok",
      loginRequestId: "rid",
      fromResetPassword: "False",
    };
    const body = buildLoginFormBody(hiddenFields, DUMMY_CREDS);
    const params = new URLSearchParams(body);
    expect(params.get("csrfToken")).toBe("tok");
    expect(params.get("loginRequestId")).toBe("rid");
    expect(params.get("fromResetPassword")).toBe("False");
    expect(params.get("email")).toBe(DUMMY_CREDS.username);
    expect(params.get("password")).toBe(DUMMY_CREDS.password);
  });

  it("URL-encodes values that contain reserved characters", () => {
    const body = buildLoginFormBody({}, { username: "test+user@example.com", password: "a&b=c d" });
    const params = new URLSearchParams(body);
    expect(params.get("email")).toBe("test+user@example.com");
    expect(params.get("password")).toBe("a&b=c d");
  });

  it("produces an empty-field-friendly body when hiddenFields is empty", () => {
    const body = buildLoginFormBody({}, DUMMY_CREDS);
    const params = new URLSearchParams(body);
    expect([...params.keys()].sort()).toEqual(["email", "password"]);
  });
});

describe("login", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns a Session when the POST redirects with 302", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        mockResponse({
          status: 200,
          body: LOGIN_PAGE_HTML,
          setCookies: ["ASP.NET_SessionId=initial123; Path=/; HttpOnly"],
        }),
      )
      .mockResolvedValueOnce(
        mockResponse({
          status: 302,
          setCookies: ["authToken=xyz789; Path=/; Secure; HttpOnly"],
        }),
      );

    const session = await login(DUMMY_BASE, DUMMY_CREDS, fetchImpl as unknown as typeof fetch);
    expect(session.baseUrl).toBe(DUMMY_BASE);
    expect(session.cookieHeader).toContain("ASP.NET_SessionId=initial123");
    expect(session.cookieHeader).toContain("authToken=xyz789");
  });

  it("GETs the login page first, then POSTs to the action URL with the Cookie header", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        mockResponse({
          status: 200,
          body: LOGIN_PAGE_HTML,
          setCookies: ["ASP.NET_SessionId=sid123; Path=/"],
        }),
      )
      .mockResolvedValueOnce(mockResponse({ status: 302 }));

    await login(DUMMY_BASE, DUMMY_CREDS, fetchImpl as unknown as typeof fetch);

    expect(fetchImpl).toHaveBeenCalledTimes(2);

    const getCall = fetchImpl.mock.calls[0];
    const postCall = fetchImpl.mock.calls[1];
    if (!getCall || !postCall) throw new Error("expected two fetch calls");

    const [getUrl, getInit] = getCall;
    expect(String(getUrl)).toBe(`${DUMMY_BASE}/common/login.aspx`);
    expect((getInit as Record<string, unknown>)?.headers).toHaveProperty("User-Agent");

    const [postUrl, postInit] = postCall as [string | URL, RequestInit];
    expect(String(postUrl)).toBe(`${DUMMY_BASE}/app/Login/Login`);
    expect(postInit.method).toBe("POST");
    const headers = postInit.headers as Record<string, string>;
    expect(headers.Cookie).toContain("ASP.NET_SessionId=sid123");
    expect(headers["Content-Type"]).toBe("application/x-www-form-urlencoded");
    expect(postInit.redirect).toBe("manual");
  });

  it("POST body contains credentials plus hidden fields parsed from the fixture", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(mockResponse({ status: 200, body: LOGIN_PAGE_HTML }))
      .mockResolvedValueOnce(mockResponse({ status: 302 }));

    await login(DUMMY_BASE, DUMMY_CREDS, fetchImpl as unknown as typeof fetch);

    const postCall = fetchImpl.mock.calls[1];
    if (!postCall) throw new Error("expected a second fetch call");
    const postInit = postCall[1] as RequestInit;
    const params = new URLSearchParams(postInit.body as string);
    expect(params.get("email")).toBe(DUMMY_CREDS.username);
    expect(params.get("password")).toBe(DUMMY_CREDS.password);
    expect(params.get("fromResetPassword")).toBe("False");
    expect(params.get("requestedServerApiVersion")).toBe("1.0");
    expect(params.get("ctlTE$TEContentPlaceHolder$__AntiCsrfToken")).toBeTruthy();
    expect(params.get("LoginRequestID")).toBeTruthy();
  });

  it("throws LoginError with 'Couldn't log in' on a 200 with an invalid-credentials body", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(mockResponse({ status: 200, body: LOGIN_PAGE_HTML }))
      .mockResolvedValueOnce(
        mockResponse({
          status: 200,
          body: "<html><body>Invalid email or password</body></html>",
        }),
      );

    await expect(
      login(DUMMY_BASE, DUMMY_CREDS, fetchImpl as unknown as typeof fetch),
    ).rejects.toMatchObject({
      name: "LoginError",
      message: expect.stringContaining("Double-check"),
    });
  });

  it("throws LoginError with a generic message on an unexpected 200 response", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(mockResponse({ status: 200, body: LOGIN_PAGE_HTML }))
      .mockResolvedValueOnce(
        mockResponse({
          status: 200,
          body: "<html><body>Something went wrong</body></html>",
        }),
      );

    await expect(
      login(DUMMY_BASE, DUMMY_CREDS, fetchImpl as unknown as typeof fetch),
    ).rejects.toBeInstanceOf(LoginError);
  });

  it("throws LoginError on non-2xx, non-redirect HTTP responses", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(mockResponse({ status: 200, body: LOGIN_PAGE_HTML }))
      .mockResolvedValueOnce(mockResponse({ status: 500 }));

    await expect(
      login(DUMMY_BASE, DUMMY_CREDS, fetchImpl as unknown as typeof fetch),
    ).rejects.toMatchObject({
      name: "LoginError",
      message: expect.stringContaining("500"),
    });
  });

  it("throws LoginError when the GET of the login page fails", async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(mockResponse({ status: 503 }));

    await expect(
      login(DUMMY_BASE, DUMMY_CREDS, fetchImpl as unknown as typeof fetch),
    ).rejects.toMatchObject({
      name: "LoginError",
      message: expect.stringContaining("503"),
    });
  });
});
