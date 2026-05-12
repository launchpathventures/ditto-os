import { createHash, randomUUID } from "crypto";
import fs from "fs/promises";
import path from "path";
import { and, eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as networkSchema from "@ditto/core/db/network";
import { networkDb } from "../db/network-db";
import { PROJECT_ROOT } from "../paths";

export type NetworkDbLike = PostgresJsDatabase<typeof networkSchema>;
export type FactVisibility = networkSchema.NetworkKbFactVisibility;

export const MAX_KB_UPLOAD_BYTES = 1024 * 1024;
export const SUPPORTED_KB_EXTENSIONS = new Set([
  ".txt",
  ".md",
  ".markdown",
  ".pdf",
  ".csv",
  ".json",
]);
export const SUPPORTED_KB_MIME_TYPES = new Set([
  "text/plain",
  "text/markdown",
  "application/pdf",
  "text/csv",
  "application/csv",
  "application/json",
]);

const SAFE_KB_ENTITY_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface PersistKbDocumentInput {
  db?: NetworkDbLike;
  rootDir?: string;
  userId: string;
  kind: networkSchema.NetworkKbDocumentKind;
  title: string;
  sourceLabel?: string | null;
  originalFilename?: string | null;
  mimeType?: string | null;
  content: string | Buffer;
  visibilityDefault?: FactVisibility;
  metadata?: Record<string, unknown> | null;
  status?: networkSchema.NetworkKbDocumentStatus;
  now?: Date;
}

export interface InsertKbFactInput {
  db?: NetworkDbLike;
  rootDir?: string;
  userId: string;
  documentId?: string | null;
  sourceLabel: string;
  sourceLocator?: string | null;
  factMd: string;
  visibility?: FactVisibility;
  metadata?: Record<string, unknown> | null;
  now?: Date;
}

export interface UpsertAntiPersonaInput {
  db?: NetworkDbLike;
  rootDir?: string;
  id?: string;
  userId: string;
  ruleMd: string;
  status?: networkSchema.NetworkKbFactStatus;
  metadata?: Record<string, unknown> | null;
  now?: Date;
}

function asBuffer(content: string | Buffer): Buffer {
  return Buffer.isBuffer(content) ? content : Buffer.from(content, "utf-8");
}

function normalizeForPath(value: string, fallback: string): string {
  const normalized = value
    .normalize("NFKD")
    .replace(/[^\w.\-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "")
    .toLowerCase();
  return normalized || fallback;
}

function stripYamlFrontmatter(markdown: string): string {
  if (!markdown.startsWith("---\n")) return markdown;
  const end = markdown.indexOf("\n---\n", 4);
  return end === -1 ? markdown : markdown.slice(end + 5).trimStart();
}

function quoteYaml(value: string | null | undefined): string {
  if (value == null) return "null";
  return JSON.stringify(value);
}

export function getNetworkKbRoot(rootDir?: string): string {
  return path.resolve(
    rootDir ??
      process.env.NETWORK_KB_ROOT ??
      path.join(PROJECT_ROOT, "data", "network-kb"),
  );
}

export function sanitizeKbFilename(filename: string | null | undefined): string {
  const raw = filename?.trim() || "source.txt";
  const parsed = path.parse(raw.replace(/\\/g, "/").split("/").pop() || "source.txt");
  const ext = parsed.ext.toLowerCase();
  const basename = normalizeForPath(parsed.name || "source", "source");
  return `${basename}${ext || ".txt"}`;
}

export function assertSupportedKbUpload({
  filename,
  mimeType,
  sizeBytes,
}: {
  filename?: string | null;
  mimeType?: string | null;
  sizeBytes: number;
}): { sanitizedFilename: string; extension: string } {
  if (sizeBytes > MAX_KB_UPLOAD_BYTES) {
    throw new Error(`Upload exceeds ${MAX_KB_UPLOAD_BYTES} byte limit`);
  }
  const sanitizedFilename = sanitizeKbFilename(filename);
  const extension = path.extname(sanitizedFilename).toLowerCase();
  const normalizedMime = mimeType?.split(";")[0]?.trim().toLowerCase() || null;
  if (!SUPPORTED_KB_EXTENSIONS.has(extension)) {
    throw new Error(`Unsupported knowledge upload extension: ${extension || "(none)"}`);
  }
  if (normalizedMime && !SUPPORTED_KB_MIME_TYPES.has(normalizedMime)) {
    throw new Error(`Unsupported knowledge upload content type: ${normalizedMime}`);
  }
  return { sanitizedFilename, extension };
}

export function safeKbPath(rootDir: string, ...segments: string[]): string {
  const root = path.resolve(rootDir);
  const resolved = path.resolve(root, ...segments);
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) {
    throw new Error("Refusing to write outside the network KB root");
  }
  return resolved;
}

export function isSafeKbEntityId(id: string): boolean {
  return SAFE_KB_ENTITY_ID.test(id);
}

export function resolveKbStoragePath(storagePath: string, rootDir?: string): string {
  if (path.isAbsolute(storagePath)) {
    throw new Error("Network KB storage paths must be relative");
  }
  return safeKbPath(getNetworkKbRoot(rootDir), storagePath);
}

export async function persistKbDocument(input: PersistKbDocumentInput) {
  const db = input.db ?? networkDb;
  const now = input.now ?? new Date();
  const id = randomUUID();
  const buffer = asBuffer(input.content);
  const { sanitizedFilename } = assertSupportedKbUpload({
    filename: input.originalFilename || `${input.title}.txt`,
    mimeType: input.mimeType,
    sizeBytes: buffer.byteLength,
  });
  const safeOriginalFilename = input.originalFilename ? sanitizedFilename : null;
  const userSegment = normalizeForPath(input.userId, "user");
  const storagePath = path.posix.join(
    "users",
    userSegment,
    "documents",
    id,
    `${path.parse(sanitizedFilename).name}.md`,
  );
  const absolutePath = resolveKbStoragePath(storagePath, input.rootDir);
  await fs.mkdir(path.dirname(absolutePath), { recursive: true });

  const source = buffer.toString("utf-8");
  const sha256 = createHash("sha256").update(buffer).digest("hex");
  const sourceLabel = input.sourceLabel?.trim() || input.title.trim();
  const markdown = [
    "---",
    `id: ${quoteYaml(id)}`,
    `userId: ${quoteYaml(input.userId)}`,
    `kind: ${quoteYaml(input.kind)}`,
    `title: ${quoteYaml(input.title)}`,
    `sourceLabel: ${quoteYaml(sourceLabel)}`,
    `originalFilename: ${quoteYaml(safeOriginalFilename)}`,
    `sha256: ${quoteYaml(sha256)}`,
    `visibilityDefault: ${quoteYaml(input.visibilityDefault ?? "on-request")}`,
    `createdAt: ${quoteYaml(now.toISOString())}`,
    "---",
    "",
    source,
  ].join("\n");
  await fs.writeFile(absolutePath, markdown, "utf-8");

  const [document] = await db
    .insert(networkSchema.networkUserKbDocuments)
    .values({
      id,
      userId: input.userId,
      kind: input.kind,
      title: input.title.trim(),
      sourceLabel,
      mimeType: input.mimeType ?? null,
      originalFilename: safeOriginalFilename,
      sanitizedFilename,
      storagePath,
      sha256,
      sizeBytes: buffer.byteLength,
      status: input.status ?? "ready",
      visibilityDefault: input.visibilityDefault ?? "on-request",
      metadata: input.metadata ?? null,
      createdAt: now,
      updatedAt: now,
    })
    .returning();
  return document;
}

export async function loadKbDocument(
  documentId: string,
  opts: { db?: NetworkDbLike } = {},
) {
  const db = opts.db ?? networkDb;
  const [document] = await db
    .select()
    .from(networkSchema.networkUserKbDocuments)
    .where(eq(networkSchema.networkUserKbDocuments.id, documentId))
    .limit(1);
  return document ?? null;
}

export async function readKbDocumentSource(
  document: { storagePath: string },
  opts: { rootDir?: string } = {},
): Promise<string> {
  const markdown = await fs.readFile(
    resolveKbStoragePath(document.storagePath, opts.rootDir),
    "utf-8",
  );
  return stripYamlFrontmatter(markdown);
}

export async function writeFactMarkdown({
  rootDir,
  userId,
  factId,
  factMd,
  sourceLabel,
  sourceLocator,
  visibility,
  now = new Date(),
}: {
  rootDir?: string;
  userId: string;
  factId: string;
  factMd: string;
  sourceLabel: string;
  sourceLocator?: string | null;
  visibility: FactVisibility;
  now?: Date;
}): Promise<string> {
  const userSegment = normalizeForPath(userId, "user");
  const storagePath = path.posix.join("users", userSegment, "facts", `${factId}.md`);
  const absolutePath = resolveKbStoragePath(storagePath, rootDir);
  await fs.mkdir(path.dirname(absolutePath), { recursive: true });
  const markdown = [
    "---",
    `id: ${quoteYaml(factId)}`,
    `userId: ${quoteYaml(userId)}`,
    `sourceLabel: ${quoteYaml(sourceLabel)}`,
    `sourceLocator: ${quoteYaml(sourceLocator ?? null)}`,
    `visibility: ${quoteYaml(visibility)}`,
    `updatedAt: ${quoteYaml(now.toISOString())}`,
    "---",
    "",
    factMd.trim(),
    "",
  ].join("\n");
  await fs.writeFile(absolutePath, markdown, "utf-8");
  return storagePath;
}

export async function insertKbFact(input: InsertKbFactInput) {
  const db = input.db ?? networkDb;
  const now = input.now ?? new Date();
  const id = randomUUID();
  const visibility = input.visibility ?? "on-request";
  const storagePath = await writeFactMarkdown({
    rootDir: input.rootDir,
    userId: input.userId,
    factId: id,
    factMd: input.factMd,
    sourceLabel: input.sourceLabel,
    sourceLocator: input.sourceLocator ?? null,
    visibility,
    now,
  });
  const [fact] = await db
    .insert(networkSchema.networkUserKbFacts)
    .values({
      id,
      userId: input.userId,
      documentId: input.documentId ?? null,
      sourceLabel: input.sourceLabel,
      sourceLocator: input.sourceLocator ?? null,
      factMd: input.factMd.trim(),
      visibility,
      status: "active",
      storagePath,
      metadata: input.metadata ?? null,
      createdAt: now,
      updatedAt: now,
    })
    .returning();
  return fact;
}

export async function updateKbFactMirror({
  db = networkDb,
  rootDir,
  factId,
  userId,
  factMd,
  visibility,
  status,
  now = new Date(),
}: {
  db?: NetworkDbLike;
  rootDir?: string;
  factId: string;
  userId: string;
  factMd?: string;
  visibility?: FactVisibility;
  status?: networkSchema.NetworkKbFactStatus;
  now?: Date;
}) {
  const [existing] = await db
    .select()
    .from(networkSchema.networkUserKbFacts)
    .where(
      and(
        eq(networkSchema.networkUserKbFacts.id, factId),
        eq(networkSchema.networkUserKbFacts.userId, userId),
      ),
    )
    .limit(1);
  if (!existing) return null;

  const nextFactMd = factMd?.trim() || existing.factMd;
  const nextVisibility = visibility ?? existing.visibility;
  const nextStatus = status ?? existing.status;
  await writeFactMarkdown({
    rootDir,
    userId,
    factId,
    factMd: nextFactMd,
    sourceLabel: existing.sourceLabel,
    sourceLocator: existing.sourceLocator,
    visibility: nextVisibility,
    now,
  });
  const [updated] = await db
    .update(networkSchema.networkUserKbFacts)
    .set({
      factMd: nextFactMd,
      visibility: nextVisibility,
      status: nextStatus,
      updatedAt: now,
    })
    .where(eq(networkSchema.networkUserKbFacts.id, factId))
    .returning();
  return updated ?? null;
}

export async function upsertAntiPersonaRule(input: UpsertAntiPersonaInput) {
  const db = input.db ?? networkDb;
  const now = input.now ?? new Date();
  const id = input.id ?? randomUUID();
  if (input.id && !isSafeKbEntityId(input.id)) {
    throw new Error("Invalid private filter id");
  }
  const userSegment = normalizeForPath(input.userId, "user");
  const storagePath = path.posix.join("users", userSegment, "private-filters", `${id}.md`);
  const absolutePath = resolveKbStoragePath(storagePath, input.rootDir);
  await fs.mkdir(path.dirname(absolutePath), { recursive: true });
  await fs.writeFile(
    absolutePath,
    [
      "---",
      `id: ${quoteYaml(id)}`,
      `userId: ${quoteYaml(input.userId)}`,
      `status: ${quoteYaml(input.status ?? "active")}`,
      `updatedAt: ${quoteYaml(now.toISOString())}`,
      "---",
      "",
      input.ruleMd.trim(),
      "",
    ].join("\n"),
    "utf-8",
  );

  if (input.id) {
    const [updated] = await db
      .update(networkSchema.networkUserAntiPersona)
      .set({
        ruleMd: input.ruleMd.trim(),
        status: input.status ?? "active",
        storagePath,
        metadata: input.metadata ?? null,
        updatedAt: now,
      })
      .where(
        and(
          eq(networkSchema.networkUserAntiPersona.id, id),
          eq(networkSchema.networkUserAntiPersona.userId, input.userId),
        ),
      )
      .returning();
    if (updated) return updated;
  }

  const [inserted] = await db
    .insert(networkSchema.networkUserAntiPersona)
    .values({
      id,
      userId: input.userId,
      ruleMd: input.ruleMd.trim(),
      status: input.status ?? "active",
      storagePath,
      metadata: input.metadata ?? null,
      createdAt: now,
      updatedAt: now,
    })
    .returning();
  return inserted;
}
