import http from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { GoogleGenerativeAI } from "@google/generative-ai";
import {
  analyzeRequestSchema,
  buildAnalyzePrompt,
  GEMINI_SYSTEM_PROMPT,
  parseGeminiInsight
} from "../core/index.js";
import { RateLimiter } from "./rateLimit.js";

loadDotEnv();

const PORT = Number(process.env.PROXY_PORT ?? 8787);
const BIND = process.env.PROXY_BIND ?? "127.0.0.1";
const MODEL = process.env.GEMINI_MODEL ?? "gemini-2.0-flash";
const AUTH = process.env.PROXY_AUTH_TOKEN ?? "";
const TIMEOUT = Number(process.env.PROXY_TIMEOUT_MS ?? 30000);
const limiter = new RateLimiter(Number(process.env.PROXY_RATE_LIMIT_PER_MIN ?? 20));

const server = http.createServer(async (req, res) => {
  cors(res);
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }
  if (req.url === "/health") {
    json(res, 200, { ok: true, geminiConfigured: Boolean(process.env.GEMINI_API_KEY) });
    return;
  }
  if (req.method !== "POST" || req.url !== "/v1/analyze") {
    json(res, 404, { error: "not found" });
    return;
  }
  if (AUTH) {
    const header = req.headers.authorization ?? "";
    if (header !== `Bearer ${AUTH}`) {
      json(res, 401, { error: "unauthorized" });
      return;
    }
  }
  const ip = req.socket.remoteAddress ?? "local";
  if (!limiter.allow(ip)) {
    json(res, 429, { error: "rate limited" });
    return;
  }
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    json(res, 503, { error: "GEMINI_API_KEY missing. Collection can continue without AI." });
    return;
  }

  try {
    const body = await readBody(req, 200_000);
    const parsed = analyzeRequestSchema.parse(JSON.parse(body));
    const genAI = new GoogleGenerativeAI(key);
    const model = genAI.getGenerativeModel({
      model: MODEL,
      systemInstruction: GEMINI_SYSTEM_PROMPT
    });
    const result = await withTimeout(
      model.generateContent({
        contents: [{ role: "user", parts: [{ text: buildAnalyzePrompt(parsed) }] }],
        generationConfig: { responseMimeType: "application/json", temperature: 0.2 }
      }),
      TIMEOUT
    );
    const text = result.response.text();
    const insight = parseGeminiInsight(text);
    json(res, 200, { insight });
  } catch (error) {
    const message = error instanceof Error ? error.message : "proxy error";
    const status = /timeout/i.test(message) ? 408 : /invalid|parse|schema/i.test(message) ? 502 : 400;
    json(res, status, { error: message });
  }
});

server.listen(PORT, BIND, () => {
  console.log(`IntentLens proxy listening on http://${BIND}:${PORT}`);
});

function cors(res: http.ServerResponse): void {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "content-type, authorization");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS, GET");
}

function json(res: http.ServerResponse, status: number, payload: unknown): void {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(payload));
}

function readBody(req: http.IncomingMessage, max: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > max) {
        reject(new Error("payload too large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function loadDotEnv(): void {
  const path = resolve(process.cwd(), ".env");
  if (!existsSync(path)) return;
  const text = readFileSync(path, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (!process.env[key]) process.env[key] = value;
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout")), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}
