#!/usr/bin/env node
import { copyFile, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { basename, dirname, isAbsolute, relative, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const args = process.argv.slice(2);
const command = args[0] ?? "help";

function runNodeScript(scriptPath) {
  const result = spawnSync(process.execPath, [scriptPath], {
    cwd: root,
    stdio: "inherit",
  });

  if (result.error) {
    console.error(result.error.message);
    process.exit(1);
  }

  process.exit(result.status ?? 1);
}

function runNodeScripts(scriptPaths) {
  for (const scriptPath of scriptPaths) {
    const result = spawnSync(process.execPath, [scriptPath], {
      cwd: root,
      stdio: "inherit",
    });

    if (result.error) {
      console.error(result.error.message);
      process.exit(1);
    }

    if (result.status !== 0) {
      process.exit(result.status ?? 1);
    }
  }

  process.exit(0);
}

async function initPackage(packageDir) {
  const target = resolve(process.cwd(), packageDir);

  try {
    const entries = await readdir(target);
    if (entries.length > 0) {
      console.error(`Refusing to initialize non-empty directory: ${target}`);
      process.exit(1);
    }
  } catch (error) {
    if (error.code !== "ENOENT") {
      throw error;
    }
  }

  await mkdir(resolve(target, "data", "jsonl"), { recursive: true });
  await mkdir(resolve(target, "metadata"), { recursive: true });
  await mkdir(resolve(target, "receipts"), { recursive: true });
  await mkdir(resolve(target, "reports"), { recursive: true });
  await mkdir(resolve(target, "signatures"), { recursive: true });

  await writeFile(
    resolve(target, "README.md"),
    [
      "# OD4A Package",
      "",
      "This directory was initialized by od4a init.",
      "It is a local scaffold and does not yet contain a release manifest.",
      "",
    ].join("\n"),
  );

  for (const relativePath of [
    ["data", "jsonl", ".gitkeep"],
    ["metadata", ".gitkeep"],
    ["receipts", ".gitkeep"],
    ["reports", ".gitkeep"],
    ["signatures", ".gitkeep"],
  ]) {
    await writeFile(resolve(target, ...relativePath), "");
  }
}

async function importJsonl(sourcePath, targetDir) {
  const inputPath = resolve(process.cwd(), sourcePath);
  const packageRoot = resolve(process.cwd(), targetDir);
  const destinationPath = resolve(packageRoot, "data", "jsonl", "events.jsonl");

  let contents;
  try {
    contents = await readFile(inputPath);
  } catch (error) {
    console.error(`Unable to read input JSONL at ${inputPath}`);
    console.error(error.message);
    process.exit(1);
  }

  const text = contents.toString("utf8");
  const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length === 0) {
    console.error("Input JSONL is empty");
    process.exit(1);
  }

  for (const [index, line] of lines.entries()) {
    try {
      JSON.parse(line);
    } catch (error) {
      console.error(`Invalid JSON on line ${index + 1} of ${inputPath}`);
      console.error(error.message);
      process.exit(1);
    }
  }

  await mkdir(resolve(packageRoot, "data", "jsonl"), { recursive: true });
  await writeFile(destinationPath, contents);

  console.log(`Imported ${lines.length} JSONL records to ${destinationPath}`);
}

function normalizeTimestamp(value) {
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString();
    }
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    const milliseconds = value > 10_000_000_000 ? value : value * 1000;
    const parsed = new Date(milliseconds);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString();
    }
  }

  return new Date().toISOString();
}

function firstString(...values) {
  for (const value of values) {
    if (typeof value === "string" && value.trim().length > 0) {
      return value;
    }
  }
  return null;
}

function textFromOpenAiValue(value) {
  if (typeof value === "string") {
    return value;
  }

  if (Array.isArray(value)) {
    return value
      .map((item) => textFromOpenAiValue(item))
      .filter((text) => text.length > 0)
      .join("\n");
  }

  if (!value || typeof value !== "object") {
    return "";
  }

  if (typeof value.text === "string") {
    return value.text;
  }

  if (typeof value.output_text === "string") {
    return value.output_text;
  }

  if (typeof value.input_text === "string") {
    return value.input_text;
  }

  if (typeof value.content === "string" || Array.isArray(value.content)) {
    return textFromOpenAiValue(value.content);
  }

  if (value.message) {
    return textFromOpenAiValue(value.message);
  }

  return "";
}

function actorTypeForOpenAiRole(role) {
  switch (role) {
    case "user":
      return "user";
    case "assistant":
      return "assistant";
    case "tool":
      return "tool";
    case "system":
    case "developer":
      return "system";
    default:
      return "adapter";
  }
}

function eventTimeForOpenAiRecord(record) {
  return normalizeTimestamp(
    record.created_at ??
      record.timestamp ??
      record.created ??
      record.request?.created_at ??
      record.response?.created_at ??
      record.response?.created,
  );
}

function openAiConversationId(record, rawLineHash, lineNumber) {
  return (
    firstString(record.conversation_id, record.thread_id, record.session_id) ??
    `openai-api-line-${lineNumber}-${rawLineHash.slice("sha256:".length, "sha256:".length + 12)}`
  );
}

function openAiTurnId(record, lineNumber) {
  return firstString(record.turn_id, record.request_id, record.response_id, record.id) ?? `line-${lineNumber}`;
}

function openAiMessagesFromRecord(record) {
  if (Array.isArray(record.messages)) {
    return record.messages.map((message) => ({
      role: typeof message?.role === "string" ? message.role : "adapter",
      text: textFromOpenAiValue(message?.content ?? message?.text),
      messageId: firstString(message?.id, message?.message_id),
    }));
  }

  const messages = [];
  const inputText = textFromOpenAiValue(record.input ?? record.prompt ?? record.request?.input);
  if (inputText.length > 0) {
    messages.push({
      role: "user",
      text: inputText,
      messageId: firstString(record.input_id, record.request_id),
    });
  }

  const outputText = textFromOpenAiValue(
    record.output_text ?? record.output ?? record.completion ?? record.response?.output_text ?? record.response?.output,
  );
  if (outputText.length > 0) {
    messages.push({
      role: "assistant",
      text: outputText,
      messageId: firstString(record.output_id, record.response_id, record.id),
    });
  }

  return messages;
}

function buildOpenAiEvent({ record, message, messageIndex, lineNumber, rawLineHash, sourceHash, sequence }) {
  const role = typeof message.role === "string" && message.role.length > 0 ? message.role : "adapter";
  const eventHash = sha256Digest(`${lineNumber}:${sequence}:${rawLineHash}:${messageIndex}:${role}:${message.text}`);
  const turnId = openAiTurnId(record, lineNumber);

  return {
    schema_version: "0.1.0",
    event_id: `openai-api-${eventHash.slice(0, 24)}`,
    event_type: "org.opendata4all.message.created",
    event_time: eventTimeForOpenAiRecord(record),
    source: {
      harness: "openai-api-app",
      harness_kind: "api_application_log",
      adapter_name: "od4a-openai-api-app-log",
      adapter_version: "0.1.0",
      capture_method: "manual_import",
    },
    conversation_id: openAiConversationId(record, rawLineHash, lineNumber),
    turn_id: `${turnId}-${messageIndex + 1}`,
    sequence,
    actor: {
      type: actorTypeForOpenAiRole(role),
      role,
    },
    consent: {
      status: "unknown",
      scope: ["local_preview"],
      receipt_id: "pending",
      policy_version: "od4a-consent-0.1.0",
    },
    risk: {
      severity: "none",
      labels: [],
      score: 0,
    },
    redactions: [],
    provenance: {
      raw_source_hash: rawLineHash,
      normalization_run_id: `openai-api-log-${sourceHash.slice("sha256:".length, "sha256:".length + 16)}`,
      trust_level: "user_supplied",
    },
    data: {
      kind: "message",
      role,
      message_id: message.messageId ?? `${turnId}-${messageIndex + 1}`,
      parts: [
        {
          type: "text",
          text: message.text,
        },
      ],
      content_release_level: "raw_local_review",
      source_line: lineNumber,
    },
  };
}

async function importOpenAiApiLog(sourcePath, targetDir) {
  const inputPath = resolve(process.cwd(), sourcePath);
  const packageRoot = resolve(process.cwd(), targetDir);
  const destinationPath = resolve(packageRoot, "data", "jsonl", "events.jsonl");

  let contents;
  try {
    contents = await readFile(inputPath);
  } catch (error) {
    console.error(`Unable to read OpenAI API app-side JSONL at ${inputPath}`);
    console.error(error.message);
    process.exit(1);
  }

  const sourceHash = sha256Hex(contents);
  const events = [];
  let recordCount = 0;

  for (const [index, line] of contents.toString("utf8").split(/\r?\n/).entries()) {
    if (line.trim().length === 0) {
      continue;
    }

    const lineNumber = index + 1;
    let record;
    try {
      record = JSON.parse(line);
    } catch (error) {
      console.error(`Invalid JSON on line ${lineNumber} of ${inputPath}`);
      console.error(error.message);
      process.exit(1);
    }

    recordCount += 1;
    const rawLineHash = sha256Hex(Buffer.from(line, "utf8"));
    const messages = openAiMessagesFromRecord(record).filter((message) => message.text.length > 0);

    if (messages.length === 0) {
      console.error(`No importable OpenAI message text on line ${lineNumber} of ${inputPath}`);
      process.exit(1);
    }

    for (const [messageIndex, message] of messages.entries()) {
      events.push(
        buildOpenAiEvent({
          record,
          message,
          messageIndex,
          lineNumber,
          rawLineHash,
          sourceHash,
          sequence: events.length,
        }),
      );
    }
  }

  if (recordCount === 0) {
    console.error("Input OpenAI API app-side JSONL is empty");
    process.exit(1);
  }

  await mkdir(resolve(packageRoot, "data", "jsonl"), { recursive: true });
  await writeFile(destinationPath, `${events.map((event) => JSON.stringify(event)).join("\n")}\n`);

  console.log(`Imported ${recordCount} OpenAI app-side records as ${events.length} OD4A events to ${destinationPath}`);
}

function codexHookName(record) {
  return (
    firstString(record.hook_event_name, record.hook_event, record.event_name, record.event, record.type) ?? "codex_hook"
  );
}

function codexConversationId(record, rawLineHash, lineNumber) {
  return (
    firstString(record.session_id, record.conversation_id, record.thread_id) ??
    `codex-hook-line-${lineNumber}-${rawLineHash.slice("sha256:".length, "sha256:".length + 12)}`
  );
}

function codexTurnId(record, lineNumber) {
  return firstString(record.turn_id, record.request_id, record.tool_call_id, record.id) ?? `line-${lineNumber}`;
}

function codexMessageFromRecord(record) {
  const role = firstString(record.role) ?? (record.response || record.output ? "assistant" : "user");
  const text = textFromOpenAiValue(record.prompt ?? record.input ?? record.message ?? record.response ?? record.output);

  if (text.length === 0) {
    return null;
  }

  return {
    kind: "message",
    actorType: actorTypeForOpenAiRole(role),
    role,
    eventType: "org.opendata4all.message.created",
    data: {
      kind: "message",
      hook_event_name: codexHookName(record),
      role,
      message_id: firstString(record.message_id, record.id),
      parts: [
        {
          type: "text",
          text,
        },
      ],
      content_release_level: "raw_local_review",
    },
  };
}

function codexToolFromRecord(record) {
  const toolName = firstString(record.tool_name, record.tool, record.name, record.command?.name);
  const command = typeof record.command === "string" ? record.command : firstString(record.command?.text, record.command_text);

  if (!toolName && !command) {
    return null;
  }

  return {
    kind: "tool",
    actorType: "tool",
    role: "tool",
    eventType: "org.opendata4all.tool.invoked",
    data: {
      kind: "tool_event",
      hook_event_name: codexHookName(record),
      tool_name: toolName ?? "unknown",
      ...(command ? { command } : {}),
      ...(isNonEmptyString(record.decision) ? { decision: record.decision } : {}),
      ...(Number.isInteger(record.exit_code) ? { exit_code: record.exit_code } : {}),
      content_release_level: "raw_local_review",
    },
  };
}

function codexImportableFromRecord(record) {
  return codexMessageFromRecord(record) ?? codexToolFromRecord(record);
}

function buildCodexHookEvent({ record, normalized, lineNumber, rawLineHash, sourceHash, sequence }) {
  const hookName = codexHookName(record);
  const eventHash = sha256Digest(`${lineNumber}:${sequence}:${rawLineHash}:${hookName}:${JSON.stringify(normalized.data)}`);
  const turnId = codexTurnId(record, lineNumber);

  return {
    schema_version: "0.1.0",
    event_id: `codex-hook-${eventHash.slice(0, 24)}`,
    event_type: normalized.eventType,
    event_time: normalizeTimestamp(record.timestamp ?? record.created_at ?? record.time),
    source: {
      harness: "codex",
      harness_kind: "coding_agent",
      adapter_name: "od4a-codex-hook",
      adapter_version: "0.1.0",
      capture_method: "documented_hook",
    },
    conversation_id: codexConversationId(record, rawLineHash, lineNumber),
    turn_id: turnId,
    sequence,
    actor: {
      type: normalized.actorType,
      role: normalized.role,
    },
    consent: {
      status: "unknown",
      scope: ["local_preview"],
      receipt_id: "pending",
      policy_version: "od4a-consent-0.1.0",
    },
    risk: {
      severity: "none",
      labels: [],
      score: 0,
    },
    redactions: [],
    provenance: {
      raw_source_hash: rawLineHash,
      normalization_run_id: `codex-hook-${sourceHash.slice("sha256:".length, "sha256:".length + 16)}`,
      trust_level: "user_supplied",
    },
    data: {
      ...normalized.data,
      source_line: lineNumber,
    },
  };
}

async function importCodexHookLog(sourcePath, targetDir) {
  const inputPath = resolve(process.cwd(), sourcePath);
  const packageRoot = resolve(process.cwd(), targetDir);
  const destinationPath = resolve(packageRoot, "data", "jsonl", "events.jsonl");

  let contents;
  try {
    contents = await readFile(inputPath);
  } catch (error) {
    console.error(`Unable to read Codex hook JSONL at ${inputPath}`);
    console.error(error.message);
    process.exit(1);
  }

  const sourceHash = sha256Hex(contents);
  const events = [];
  let recordCount = 0;

  for (const [index, line] of contents.toString("utf8").split(/\r?\n/).entries()) {
    if (line.trim().length === 0) {
      continue;
    }

    const lineNumber = index + 1;
    let record;
    try {
      record = JSON.parse(line);
    } catch (error) {
      console.error(`Invalid JSON on line ${lineNumber} of ${inputPath}`);
      console.error(error.message);
      process.exit(1);
    }

    recordCount += 1;
    const rawLineHash = sha256Hex(Buffer.from(line, "utf8"));
    const normalized = codexImportableFromRecord(record);

    if (!normalized) {
      console.error(`No importable Codex hook message or tool event on line ${lineNumber} of ${inputPath}`);
      process.exit(1);
    }

    events.push(
      buildCodexHookEvent({
        record,
        normalized,
        lineNumber,
        rawLineHash,
        sourceHash,
        sequence: events.length,
      }),
    );
  }

  if (recordCount === 0) {
    console.error("Input Codex hook JSONL is empty");
    process.exit(1);
  }

  await mkdir(resolve(packageRoot, "data", "jsonl"), { recursive: true });
  await writeFile(destinationPath, `${events.map((event) => JSON.stringify(event)).join("\n")}\n`);

  console.log(`Imported ${recordCount} Codex hook records as ${events.length} OD4A events to ${destinationPath}`);
}

function claudeHookName(record) {
  return (
    firstString(record.hook_event_name, record.hook_event, record.event_name, record.event, record.type) ??
    "claude_code_hook"
  );
}

function claudeConversationId(record, rawLineHash, lineNumber) {
  return (
    firstString(record.session_id, record.conversation_id, record.thread_id) ??
    `claude-code-hook-line-${lineNumber}-${rawLineHash.slice("sha256:".length, "sha256:".length + 12)}`
  );
}

function claudeTurnId(record, lineNumber) {
  return firstString(record.turn_id, record.request_id, record.tool_call_id, record.id) ?? `line-${lineNumber}`;
}

function claudeMessageFromRecord(record) {
  const role = firstString(record.role) ?? (record.response || record.output ? "assistant" : "user");
  const text = textFromOpenAiValue(record.prompt ?? record.input ?? record.message ?? record.response ?? record.output);

  if (text.length === 0) {
    return null;
  }

  return {
    actorType: actorTypeForOpenAiRole(role),
    role,
    eventType: "org.opendata4all.message.created",
    data: {
      kind: "message",
      hook_event_name: claudeHookName(record),
      role,
      message_id: firstString(record.message_id, record.id),
      parts: [
        {
          type: "text",
          text,
        },
      ],
      content_release_level: "raw_local_review",
    },
  };
}

function claudeToolFromRecord(record) {
  const toolName = firstString(record.tool_name, record.tool, record.name, record.tool_input?.name);
  const command =
    typeof record.command === "string"
      ? record.command
      : firstString(record.command?.text, record.command_text, record.tool_input?.command);

  if (!toolName && !command) {
    return null;
  }

  return {
    actorType: "tool",
    role: "tool",
    eventType: "org.opendata4all.tool.invoked",
    data: {
      kind: "tool_event",
      hook_event_name: claudeHookName(record),
      tool_name: toolName ?? "unknown",
      ...(command ? { command } : {}),
      ...(isNonEmptyString(record.decision) ? { decision: record.decision } : {}),
      ...(Number.isInteger(record.exit_code) ? { exit_code: record.exit_code } : {}),
      content_release_level: "raw_local_review",
    },
  };
}

function claudeImportableFromRecord(record) {
  return claudeMessageFromRecord(record) ?? claudeToolFromRecord(record);
}

function buildClaudeCodeHookEvent({ record, normalized, lineNumber, rawLineHash, sourceHash, sequence }) {
  const hookName = claudeHookName(record);
  const eventHash = sha256Digest(`${lineNumber}:${sequence}:${rawLineHash}:${hookName}:${JSON.stringify(normalized.data)}`);
  const turnId = claudeTurnId(record, lineNumber);

  return {
    schema_version: "0.1.0",
    event_id: `claude-code-hook-${eventHash.slice(0, 24)}`,
    event_type: normalized.eventType,
    event_time: normalizeTimestamp(record.timestamp ?? record.created_at ?? record.time),
    source: {
      harness: "claude-code",
      harness_kind: "coding_agent",
      adapter_name: "od4a-claude-code-hook",
      adapter_version: "0.1.0",
      capture_method: "documented_hook",
    },
    conversation_id: claudeConversationId(record, rawLineHash, lineNumber),
    turn_id: turnId,
    sequence,
    actor: {
      type: normalized.actorType,
      role: normalized.role,
    },
    consent: {
      status: "unknown",
      scope: ["local_preview"],
      receipt_id: "pending",
      policy_version: "od4a-consent-0.1.0",
    },
    risk: {
      severity: "none",
      labels: [],
      score: 0,
    },
    redactions: [],
    provenance: {
      raw_source_hash: rawLineHash,
      normalization_run_id: `claude-code-hook-${sourceHash.slice("sha256:".length, "sha256:".length + 16)}`,
      trust_level: "user_supplied",
    },
    data: {
      ...normalized.data,
      source_line: lineNumber,
    },
  };
}

async function importClaudeCodeHookLog(sourcePath, targetDir) {
  const inputPath = resolve(process.cwd(), sourcePath);
  const packageRoot = resolve(process.cwd(), targetDir);
  const destinationPath = resolve(packageRoot, "data", "jsonl", "events.jsonl");

  let contents;
  try {
    contents = await readFile(inputPath);
  } catch (error) {
    console.error(`Unable to read Claude Code hook JSONL at ${inputPath}`);
    console.error(error.message);
    process.exit(1);
  }

  const sourceHash = sha256Hex(contents);
  const events = [];
  let recordCount = 0;

  for (const [index, line] of contents.toString("utf8").split(/\r?\n/).entries()) {
    if (line.trim().length === 0) {
      continue;
    }

    const lineNumber = index + 1;
    let record;
    try {
      record = JSON.parse(line);
    } catch (error) {
      console.error(`Invalid JSON on line ${lineNumber} of ${inputPath}`);
      console.error(error.message);
      process.exit(1);
    }

    recordCount += 1;
    const rawLineHash = sha256Hex(Buffer.from(line, "utf8"));
    const normalized = claudeImportableFromRecord(record);

    if (!normalized) {
      console.error(`No importable Claude Code hook message or tool event on line ${lineNumber} of ${inputPath}`);
      process.exit(1);
    }

    events.push(
      buildClaudeCodeHookEvent({
        record,
        normalized,
        lineNumber,
        rawLineHash,
        sourceHash,
        sequence: events.length,
      }),
    );
  }

  if (recordCount === 0) {
    console.error("Input Claude Code hook JSONL is empty");
    process.exit(1);
  }

  await mkdir(resolve(packageRoot, "data", "jsonl"), { recursive: true });
  await writeFile(destinationPath, `${events.map((event) => JSON.stringify(event)).join("\n")}\n`);

  console.log(`Imported ${recordCount} Claude Code hook records as ${events.length} OD4A events to ${destinationPath}`);
}

async function exportJsonl(packageDir, outputPath) {
  const sourcePath = resolve(process.cwd(), packageDir, "data", "jsonl", "events.jsonl");

  let contents;
  try {
    contents = await readFile(sourcePath, "utf8");
  } catch (error) {
    console.error(`Unable to read exported JSONL at ${sourcePath}`);
    console.error(error.message);
    process.exit(1);
  }

  if (outputPath) {
    const destinationPath = resolve(process.cwd(), outputPath);
    await writeFile(destinationPath, contents);
    console.log(`Exported JSONL to ${destinationPath}`);
    return;
  }

  process.stdout.write(contents);
}

function safePackageId(packageRoot) {
  const stem = basename(packageRoot).toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  return stem.length > 0 ? `od4a-${stem}` : "od4a-package";
}

function jsonlLines(contents) {
  return contents
    .toString("utf8")
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0);
}

function adapterFromEvent(event) {
  if (!event?.source || typeof event.source !== "object") {
    return null;
  }

  if (!isNonEmptyString(event.source.adapter_name) || !isNonEmptyString(event.source.adapter_version)) {
    return null;
  }

  return {
    name: event.source.adapter_name,
    version: event.source.adapter_version,
    ...(isNonEmptyString(event.source.capture_method) ? { capture_method: event.source.capture_method } : {}),
  };
}

function inferSourceAdapters(events) {
  const adapters = new Map();

  for (const event of events) {
    const adapter = adapterFromEvent(event);
    if (!adapter) {
      continue;
    }

    const key = `${adapter.name}:${adapter.version}:${adapter.capture_method ?? ""}`;
    adapters.set(key, adapter);
  }

  if (adapters.size > 0) {
    return [...adapters.values()].sort((left, right) => left.name.localeCompare(right.name));
  }

  return [
    {
      name: "od4a-manual-jsonl",
      version: "0.1.0",
      capture_method: "manual_import",
    },
  ];
}

async function listPackageJsonFiles(packageRoot, directoryName) {
  const directoryPath = resolve(packageRoot, directoryName);

  let entries;
  try {
    entries = await readdir(directoryPath, { withFileTypes: true });
  } catch (error) {
    if (error.code === "ENOENT") {
      return [];
    }
    throw error;
  }

  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) => `${directoryName}/${entry.name}`)
    .sort();
}

async function buildPackageManifest(packageDir) {
  const packageRoot = resolve(process.cwd(), packageDir);
  const eventsPath = resolve(packageRoot, "data", "jsonl", "events.jsonl");

  let contents;
  try {
    contents = await readFile(eventsPath);
  } catch (error) {
    console.error(`Unable to read canonical JSONL at ${eventsPath}`);
    console.error(error.message);
    process.exit(1);
  }

  const lines = jsonlLines(contents);
  if (lines.length === 0) {
    console.error(`Canonical JSONL is empty at ${eventsPath}`);
    process.exit(1);
  }

  const events = [];
  for (const [index, line] of lines.entries()) {
    try {
      events.push(JSON.parse(line));
    } catch (error) {
      console.error(`Invalid JSON on record ${index + 1} of ${eventsPath}`);
      console.error(error.message);
      process.exit(1);
    }
  }

  const analysis = await analyzePackage(packageDir);
  const blockedFindings = analysis.findings.filter((finding) => finding.severity === "high").length;
  const mediumFindings = analysis.findings.filter((finding) => finding.severity === "medium").length;
  const checkedAt = new Date().toISOString();

  return {
    schema_version: "0.1.0",
    package_id: safePackageId(packageRoot),
    version: "0.1.0",
    release_tier: "local_review",
    created_at: checkedAt,
    publisher: {
      name: "TODO: publisher or steward name",
      contact: "TODO: publisher or steward contact",
    },
    license: {
      id: "NOASSERTION",
      access_terms: "Local review manifest only. Do not publish without consent, redaction, and release review.",
    },
    source_adapters: inferSourceAdapters(events),
    files: [
      {
        path: "data/jsonl/events.jsonl",
        media_type: "application/jsonl",
        sha256: sha256Hex(contents),
        bytes: contents.byteLength,
        row_count: lines.length,
        schema_id: events.every((event) => event.schema_version === "0.1.0")
          ? "https://opendata4all.org/schemas/interaction-event.schema.json"
          : undefined,
        contains_raw_data: true,
      },
    ].map((file) => Object.fromEntries(Object.entries(file).filter(([, value]) => value !== undefined))),
    consent_receipts: await listPackageJsonFiles(packageRoot, "receipts"),
    redaction_reports: await listPackageJsonFiles(packageRoot, "reports"),
    validation: {
      status: blockedFindings > 0 ? "failed" : "passed",
      checked_at: checkedAt,
      notes:
        blockedFindings > 0
          ? `Local manifest generation found ${blockedFindings} blocked finding(s).`
          : mediumFindings > 0
            ? `Local manifest generation found ${mediumFindings} review-required finding(s).`
            : "Local manifest generation found no deterministic risk findings.",
    },
  };
}

async function writePackageManifest(packageDir) {
  const packageRoot = resolve(process.cwd(), packageDir);
  const targetPath = resolve(packageRoot, "metadata", "manifest.json");
  const manifest = await buildPackageManifest(packageDir);

  await mkdir(dirname(targetPath), { recursive: true });
  await writeFile(targetPath, `${JSON.stringify(manifest, null, 2)}\n`);

  console.log(`Wrote package manifest to ${targetPath}`);
  console.log(`Release tier: ${manifest.release_tier}`);
  console.log(`Files: ${manifest.files.length}`);
  console.log(`Validation: ${manifest.validation.status}`);
}

function markdownCell(value) {
  return String(value ?? "")
    .replace(/\r?\n/g, " ")
    .replace(/\|/g, "\\|")
    .trim();
}

function markdownList(values, fallback = "None recorded.") {
  if (!Array.isArray(values) || values.length === 0) {
    return `- ${fallback}`;
  }

  return values.map((value) => `- ${markdownCell(value)}`).join("\n");
}

function releaseStatusForCard(manifest) {
  const rawFileCount = Array.isArray(manifest.files)
    ? manifest.files.filter((file) => file.contains_raw_data === true).length
    : 0;

  if (manifest.validation?.status === "failed") {
    return "Blocked for release until failed validation findings are resolved.";
  }

  if (rawFileCount > 0 || ["local_review", "raw_vault"].includes(manifest.release_tier)) {
    return "Local review only. This card is not publication approval.";
  }

  return "Release review required before upload or publication.";
}

function datasetCardFrontMatter(manifest) {
  const licenseId = markdownCell(manifest.license?.id ?? "NOASSERTION") || "NOASSERTION";
  const releaseTier = markdownCell(manifest.release_tier ?? "unknown");

  return [
    "---",
    `license: ${licenseId}`,
    "tags:",
    "- opendata4all",
    "- ai-interactions",
    `- ${releaseTier}`,
    "---",
    "",
  ].join("\n");
}

function buildDatasetCard(manifest) {
  const files = Array.isArray(manifest.files) ? manifest.files : [];
  const rawFileCount = files.filter((file) => file.contains_raw_data === true).length;
  const totalRows = files.reduce((sum, file) => sum + (Number.isInteger(file.row_count) ? file.row_count : 0), 0);
  const totalBytes = files.reduce((sum, file) => sum + (Number.isInteger(file.bytes) ? file.bytes : 0), 0);
  const adapters = Array.isArray(manifest.source_adapters) ? manifest.source_adapters : [];
  const fileRows = files.map(
    (file) =>
      `| ${markdownCell(file.path)} | ${markdownCell(file.media_type)} | ${markdownCell(file.row_count ?? "")} | ${markdownCell(
        file.bytes ?? "",
      )} | ${markdownCell(file.sha256)} | ${file.contains_raw_data === true ? "yes" : "no"} |`,
  );
  const adapterRows = adapters.map(
    (adapter) =>
      `| ${markdownCell(adapter.name)} | ${markdownCell(adapter.version)} | ${markdownCell(adapter.capture_method ?? "")} |`,
  );

  return `${datasetCardFrontMatter(manifest)}# ${markdownCell(manifest.package_id ?? "OD4A Package")}

Generated by \`od4a dataset-card\` from \`metadata/manifest.json\`. This card is
metadata only and does not include raw interaction content.

## Status

- Package ID: ${markdownCell(manifest.package_id ?? "unknown")}
- Version: ${markdownCell(manifest.version ?? "unknown")}
- Release tier: ${markdownCell(manifest.release_tier ?? "unknown")}
- Validation: ${markdownCell(manifest.validation?.status ?? "unknown")}
- Publication status: ${releaseStatusForCard(manifest)}

## Contents

- Files: ${files.length}
- JSONL rows: ${totalRows}
- Bytes: ${totalBytes}
- Files marked as raw data: ${rawFileCount}

| Path | Media type | Rows | Bytes | SHA-256 | Raw data |
| --- | --- | ---: | ---: | --- | --- |
${fileRows.length > 0 ? fileRows.join("\n") : "| None recorded. |  |  |  |  |  |"}

## Source Adapters

| Name | Version | Capture method |
| --- | --- | --- |
${adapterRows.length > 0 ? adapterRows.join("\n") : "| None recorded. |  |  |"}

## Consent And Redaction

Consent receipts:

${markdownList(manifest.consent_receipts)}

Redaction reports:

${markdownList(manifest.redaction_reports)}

## License And Access

- License: ${markdownCell(manifest.license?.id ?? "NOASSERTION")}
- Access terms: ${markdownCell(manifest.license?.access_terms ?? "Not specified.")}
- Publisher/steward: ${markdownCell(manifest.publisher?.name ?? "Not specified.")}
- Contact: ${markdownCell(manifest.publisher?.contact ?? "Not specified.")}

## Safety Notes

- Generated cards are local metadata artifacts and do not upload or publish data.
- Raw or local-review packages require additional consent, redaction, and release
  review before sharing.
- Do not treat redacted records as anonymous without a separate anonymization
  assessment.
`;
}

async function writeDatasetCard(packageDir, outputPath) {
  const packageRoot = resolve(process.cwd(), packageDir);
  const { manifest } = await readPackageManifest(packageDir);
  const targetPath = outputPath ? resolve(process.cwd(), outputPath) : resolve(packageRoot, "metadata", "dataset-card.md");
  const card = buildDatasetCard(manifest);

  await mkdir(dirname(targetPath), { recursive: true });
  await writeFile(targetPath, card);

  console.log(`Wrote dataset card to ${targetPath}`);
  console.log(`Release tier: ${manifest.release_tier ?? "(unknown)"}`);
  console.log(`Validation: ${manifest.validation?.status ?? "(unknown)"}`);
}

function hfLicenseKey(manifest) {
  const id = markdownCell(manifest.license?.id ?? "");

  if (!id || id === "NOASSERTION") {
    return "other";
  }

  return id.toLowerCase();
}

function hfSizeCategory(rowCount) {
  if (rowCount < 1_000) {
    return "n<1K";
  }
  if (rowCount < 10_000) {
    return "1K<n<10K";
  }
  if (rowCount < 100_000) {
    return "10K<n<100K";
  }
  if (rowCount < 1_000_000) {
    return "100K<n<1M";
  }

  return "1M<n<10M";
}

function resolvePackageFile(packageRoot, relativePath, description) {
  if (!isNonEmptyString(relativePath) || isAbsolute(relativePath) || relativePath.includes("\0")) {
    throw new Error(`${description}_path_invalid`);
  }

  const resolvedPath = resolve(packageRoot, relativePath);
  const relativePathFromRoot = relative(packageRoot, resolvedPath);
  if (
    relativePathFromRoot.length === 0 ||
    relativePathFromRoot.startsWith("..") ||
    isAbsolute(relativePathFromRoot)
  ) {
    throw new Error(`${description}_path_outside_package`);
  }

  return resolvedPath;
}

async function fileIntegrity(packageRoot, file) {
  const filePath = resolvePackageFile(packageRoot, file.path, "manifest_file");
  const issues = [];
  let contents;

  try {
    contents = await readFile(filePath);
  } catch {
    return [`manifest_file_read_failed:${file.path}`];
  }

  if (isNonEmptyString(file.sha256) && file.sha256 !== sha256Hex(contents)) {
    issues.push(`file_sha256_mismatch:${file.path}`);
  }

  if (Number.isInteger(file.bytes) && file.bytes !== contents.byteLength) {
    issues.push(`file_byte_count_mismatch:${file.path}`);
  }

  if (file.media_type === "application/jsonl" && Number.isInteger(file.row_count)) {
    const rowCount = jsonlLines(contents).length;
    if (file.row_count !== rowCount) {
      issues.push(`file_row_count_mismatch:${file.path}`);
    }
  }

  return issues;
}

async function readPackageJsonFile(packageRoot, relativePath, description) {
  const filePath = resolvePackageFile(packageRoot, relativePath, description);

  let contents;
  try {
    contents = await readFile(filePath, "utf8");
  } catch {
    throw new Error(`${description}_read_failed:${relativePath}`);
  }

  try {
    return JSON.parse(contents);
  } catch {
    throw new Error(`${description}_json_invalid:${relativePath}`);
  }
}

async function validateHfSamplePackage(packageRoot, manifest, manifestHash) {
  const issues = [];
  const files = Array.isArray(manifest.files) ? manifest.files : [];
  const dataFiles = files.filter((file) => file.media_type === "application/jsonl");

  if (manifest.release_tier !== "public_release") {
    issues.push("release_tier_must_be_public_release");
  }

  if (manifest.validation?.status !== "passed") {
    issues.push("manifest_validation_must_be_passed");
  }

  if (files.length === 0) {
    issues.push("manifest_files_required");
  }

  if (dataFiles.length === 0) {
    issues.push("hf_jsonl_data_file_required");
  }

  for (const file of files) {
    if (file.contains_raw_data !== false) {
      issues.push(`contains_raw_data_false_required:${file.path}`);
    }
  }

  if (!hasNonEmptyArray(manifest.consent_receipts)) {
    issues.push("consent_receipts_required");
  }

  if (!hasNonEmptyArray(manifest.redaction_reports)) {
    issues.push("redaction_reports_required");
  }

  for (const file of files) {
    try {
      issues.push(...(await fileIntegrity(packageRoot, file)));
    } catch (error) {
      issues.push(error.message);
    }
  }

  const fileHashes = new Set(files.map((file) => file.sha256).filter(isNonEmptyString));

  for (const receiptPath of manifest.consent_receipts ?? []) {
    try {
      const receipt = await readPackageJsonFile(packageRoot, receiptPath, "consent_receipt");
      if (receipt.status !== "active") {
        issues.push(`consent_receipt_not_active:${receiptPath}`);
      }
      if (receipt.release_tier !== "public_release") {
        issues.push(`consent_receipt_release_tier_mismatch:${receiptPath}`);
      }
      if (receipt.package_manifest_hash !== manifestHash) {
        issues.push(`consent_receipt_manifest_hash_mismatch:${receiptPath}`);
      }
    } catch (error) {
      issues.push(error.message);
    }
  }

  for (const reportPath of manifest.redaction_reports ?? []) {
    try {
      const report = await readPackageJsonFile(packageRoot, reportPath, "redaction_report");
      if (report.decision !== "publishable") {
        issues.push(`redaction_report_not_publishable:${reportPath}`);
      }
      if (report.summary?.blocked_findings !== 0) {
        issues.push(`redaction_report_blocked_findings:${reportPath}`);
      }
      if (!fileHashes.has(report.output_hash)) {
        issues.push(`redaction_report_output_hash_mismatch:${reportPath}`);
      }
    } catch (error) {
      issues.push(error.message);
    }
  }

  return [...new Set(issues)];
}

function buildHfDatasetReadme(manifest) {
  const files = Array.isArray(manifest.files) ? manifest.files : [];
  const dataFiles = files.filter((file) => file.media_type === "application/jsonl");
  const totalRows = files.reduce((sum, file) => sum + (Number.isInteger(file.row_count) ? file.row_count : 0), 0);
  const totalBytes = files.reduce((sum, file) => sum + (Number.isInteger(file.bytes) ? file.bytes : 0), 0);
  const fileRows = files.map(
    (file) =>
      `| ${markdownCell(file.path)} | ${markdownCell(file.media_type)} | ${markdownCell(file.row_count ?? "")} | ${markdownCell(
        file.bytes ?? "",
      )} | ${markdownCell(file.sha256)} |`,
  );
  const dataFileRows = dataFiles.map((file) => `  - split: train\n    path: ${JSON.stringify(file.path)}`);

  return `---
license: ${hfLicenseKey(manifest)}
pretty_name: ${JSON.stringify(manifest.package_id ?? "OD4A public-safe sample")}
tags:
- opendata4all
- ai-interactions
- public-safe
- ${markdownCell(manifest.release_tier ?? "unknown")}
size_categories:
- ${JSON.stringify(hfSizeCategory(totalRows))}
configs:
- config_name: default
  data_files:
${dataFileRows.length > 0 ? dataFileRows.join("\n") : "  - split: train\n    path: \"data/jsonl/events.jsonl\""}
---

# ${markdownCell(manifest.package_id ?? "OD4A Public-Safe Sample")}

This is a local Hugging Face dataset sample generated by \`od4a hf-sample\`.
It is intended for public-safe OD4A fixtures that already passed consent,
redaction, manifest, and release-tier checks.

## Contents

- Package ID: ${markdownCell(manifest.package_id ?? "unknown")}
- Version: ${markdownCell(manifest.version ?? "unknown")}
- Release tier: ${markdownCell(manifest.release_tier ?? "unknown")}
- Validation: ${markdownCell(manifest.validation?.status ?? "unknown")}
- JSONL rows: ${totalRows}
- Bytes: ${totalBytes}

| Path | Media type | Rows | Bytes | SHA-256 |
| --- | --- | ---: | ---: | --- |
${fileRows.length > 0 ? fileRows.join("\n") : "| None recorded. |  |  |  |"}

## Consent And Redaction

Consent receipts:

${markdownList(manifest.consent_receipts)}

Redaction reports:

${markdownList(manifest.redaction_reports)}

## Safety Notes

- This sample is generated locally and is not an upload or publication action.
- The generator refuses local-review, controlled, failed-validation, and raw-data
  packages.
- The dataset card does not include raw interaction text.
`;
}

async function assertEmptyOrMissingDirectory(targetRoot) {
  try {
    const entries = await readdir(targetRoot);
    if (entries.length > 0) {
      console.error(`Refusing to write Hugging Face sample into non-empty directory: ${targetRoot}`);
      process.exit(1);
    }
  } catch (error) {
    if (error.code !== "ENOENT") {
      throw error;
    }
  }
}

async function copyPackageFile(packageRoot, targetRoot, relativePath) {
  const sourcePath = resolvePackageFile(packageRoot, relativePath, "package_file");
  const targetPath = resolve(targetRoot, relativePath);

  await mkdir(dirname(targetPath), { recursive: true });
  await copyFile(sourcePath, targetPath);
}

async function writeHfSample(packageDir, outputDir) {
  const packageRoot = resolve(process.cwd(), packageDir);
  const targetRoot = resolve(process.cwd(), outputDir);
  const { manifest, manifestHash } = await readPackageManifest(packageDir);
  const issues = await validateHfSamplePackage(packageRoot, manifest, manifestHash);

  if (issues.length > 0) {
    console.log("Hugging Face sample validation: failed");
    console.log(`Issues: ${issues.length}`);
    for (const issue of issues) {
      console.log(`- ${issue}`);
    }
    process.exit(1);
  }

  await assertEmptyOrMissingDirectory(targetRoot);
  await mkdir(targetRoot, { recursive: true });

  const copiedPaths = new Set([
    "metadata/manifest.json",
    ...manifest.files.map((file) => file.path),
    ...manifest.consent_receipts,
    ...manifest.redaction_reports,
  ]);

  for (const relativePath of [...copiedPaths].sort()) {
    await copyPackageFile(packageRoot, targetRoot, relativePath);
  }

  await writeFile(resolve(targetRoot, "README.md"), buildHfDatasetReadme(manifest));

  console.log(`Wrote Hugging Face sample to ${targetRoot}`);
  console.log(`Release tier: ${manifest.release_tier}`);
  console.log(`Files copied: ${copiedPaths.size}`);
}

async function readCanonicalEvents(packageDir) {
  const eventsPath = resolve(process.cwd(), packageDir, "data", "jsonl", "events.jsonl");

  let contents;
  try {
    contents = await readFile(eventsPath);
  } catch (error) {
    console.error(`Unable to read canonical JSONL at ${eventsPath}`);
    console.error(error.message);
    process.exit(1);
  }

  const lines = jsonlLines(contents);
  if (lines.length === 0) {
    console.error(`Canonical JSONL is empty at ${eventsPath}`);
    process.exit(1);
  }

  const events = [];
  for (const [index, line] of lines.entries()) {
    try {
      events.push(JSON.parse(line));
    } catch (error) {
      console.error(`Invalid JSON on record ${index + 1} of ${eventsPath}`);
      console.error(error.message);
      process.exit(1);
    }
  }

  return { events, eventsPath };
}

function textPartStats(data) {
  let count = 0;
  let charCount = 0;

  if (!Array.isArray(data?.parts)) {
    return { count, charCount };
  }

  for (const part of data.parts) {
    if (part?.type === "text" && typeof part.text === "string") {
      count += 1;
      charCount += part.text.length;
    }
  }

  return { count, charCount };
}

function joinedList(value) {
  return Array.isArray(value) ? value.map((item) => String(item)).sort().join("|") : "";
}

function derivedEventRow(event) {
  const stats = textPartStats(event.data);

  return {
    schema_version: "0.1.0",
    table: "events",
    event_id: event.event_id ?? "",
    event_type: event.event_type ?? "",
    event_time: event.event_time ?? "",
    conversation_id: event.conversation_id ?? "",
    turn_id: event.turn_id ?? "",
    sequence: Number.isInteger(event.sequence) ? event.sequence : null,
    source_adapter: event.source?.adapter_name ?? "",
    source_capture_method: event.source?.capture_method ?? "",
    actor_type: event.actor?.type ?? "",
    actor_role: event.actor?.role ?? "",
    consent_status: event.consent?.status ?? "",
    consent_scope: joinedList(event.consent?.scope),
    risk_severity: event.risk?.severity ?? "",
    risk_score: typeof event.risk?.score === "number" ? event.risk.score : null,
    risk_labels: joinedList(event.risk?.labels),
    data_kind: event.data?.kind ?? "",
    content_release_level: event.data?.content_release_level ?? "",
    text_part_count: stats.count,
    text_char_count: stats.charCount,
    has_tool_command: typeof event.data?.command === "string",
  };
}

async function writeDerivedTables(packageDir, outputDir) {
  const packageRoot = resolve(process.cwd(), packageDir);
  const targetRoot = outputDir ? resolve(process.cwd(), outputDir) : resolve(packageRoot, "data", "tables");
  const targetPath = resolve(targetRoot, "events.jsonl");
  const { events } = await readCanonicalEvents(packageDir);
  const rows = events.map(derivedEventRow);

  await mkdir(targetRoot, { recursive: true });
  await writeFile(targetPath, `${rows.map((row) => JSON.stringify(row)).join("\n")}\n`);

  console.log(`Wrote derived event table to ${targetPath}`);
  console.log(`Rows: ${rows.length}`);
  console.log("Raw text included: no");
}

const riskDetectors = [
  {
    label: "secret.private_key",
    severity: "high",
    pattern: /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----/,
  },
  {
    label: "secret.openai_api_key",
    severity: "high",
    pattern: /\bsk-[A-Za-z0-9_-]{32,}\b/,
  },
  {
    label: "secret.aws_access_key",
    severity: "high",
    pattern: /\bA[KS]IA[0-9A-Z]{16}\b/,
  },
  {
    label: "secret.github_token",
    severity: "high",
    pattern: /\bgh[pousr]_[A-Za-z0-9_]{30,}\b/,
  },
  {
    label: "secret.env_assignment",
    severity: "medium",
    pattern: /\b[A-Z][A-Z0-9_]*(?:TOKEN|SECRET|PASSWORD|API_KEY)\s*=\s*["']?[^"',\s]{8,}/,
  },
  {
    label: "personal.email",
    severity: "medium",
    pattern: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i,
  },
  {
    label: "personal.ip_address",
    severity: "medium",
    pattern:
      /\b(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\b/,
  },
  {
    label: "private.full_url",
    severity: "medium",
    pattern: /\bhttps?:\/\/[^\s"')\]}]+/i,
  },
  {
    label: "private.local_file_path",
    severity: "medium",
    pattern: /(?:\/Users\/|\/home\/|C:\\Users\\)[^\s"',)]+/,
  },
];

function collectStringValues(value, values = []) {
  if (typeof value === "string") {
    values.push(value);
    return values;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      collectStringValues(item, values);
    }
    return values;
  }

  if (value && typeof value === "object") {
    for (const item of Object.values(value)) {
      collectStringValues(item, values);
    }
  }

  return values;
}

function sha256Hex(contents) {
  return `sha256:${createHash("sha256").update(contents).digest("hex")}`;
}

function sha256Digest(contents) {
  return createHash("sha256").update(contents).digest("hex");
}

function actionForSeverity(severity) {
  return severity === "high" ? "block_export" : "withhold";
}

async function analyzePackage(packageDir) {
  const sourcePath = resolve(process.cwd(), packageDir, "data", "jsonl", "events.jsonl");

  let contents;
  try {
    contents = await readFile(sourcePath);
  } catch (error) {
    console.error(`Unable to read JSONL at ${sourcePath}`);
    console.error(error.message);
    process.exit(1);
  }

  const findings = new Map();
  const physicalLines = contents.toString("utf8").split(/\r?\n/);
  let recordCount = 0;

  for (const [index, line] of physicalLines.entries()) {
    if (line.trim().length === 0) {
      continue;
    }

    recordCount += 1;
    const lineNumber = index + 1;

    let event;
    try {
      event = JSON.parse(line);
    } catch (error) {
      console.error(`Invalid JSON on line ${lineNumber} of ${sourcePath}`);
      console.error(error.message);
      process.exit(1);
    }

    for (const text of collectStringValues(event)) {
      for (const detector of riskDetectors) {
        if (!detector.pattern.test(text)) {
          continue;
        }

        const key = `${detector.label}:${lineNumber}`;
        findings.set(key, {
          label: detector.label,
          severity: detector.severity,
          line: lineNumber,
          action: actionForSeverity(detector.severity),
        });
      }
    }
  }

  const sortedFindings = [...findings.values()].sort((left, right) => {
    if (left.line !== right.line) {
      return left.line - right.line;
    }
    return left.label.localeCompare(right.label);
  });

  return {
    sourcePath,
    inputHash: sha256Hex(contents),
    outputHash: sha256Hex(contents),
    recordCount,
    findings: sortedFindings,
  };
}

async function scanPackage(packageDir) {
  const analysis = await analyzePackage(packageDir);

  console.log(`Scanned ${analysis.recordCount} JSONL records.`);
  console.log(`Findings: ${analysis.findings.length}`);

  for (const finding of analysis.findings) {
    console.log(`- line ${finding.line}: ${finding.label} (${finding.severity})`);
  }

  if (analysis.findings.some((finding) => finding.severity === "high")) {
    process.exit(2);
  }
}

function buildRedactionReport(analysis) {
  const groupedFindings = new Map();

  for (const finding of analysis.findings) {
    const key = `${finding.label}:${finding.action}`;
    const current = groupedFindings.get(key) ?? {
      class: finding.label,
      action: finding.action,
      count: 0,
      detector: "od4a.deterministic-patterns",
      confidence_bucket: finding.severity === "high" ? "high" : "medium",
    };
    current.count += 1;
    groupedFindings.set(key, current);
  }

  const blockedFindings = analysis.findings.filter((finding) => finding.severity === "high").length;
  const mediumFindings = analysis.findings.filter((finding) => finding.severity === "medium").length;
  const decision = blockedFindings > 0 ? "blocked" : mediumFindings > 0 ? "review_required" : "publishable";

  return {
    schema_version: "0.1.0",
    report_id: `redaction-${analysis.inputHash.slice("sha256:".length, "sha256:".length + 16)}`,
    created_at: new Date().toISOString(),
    policy_version: "od4a-local-risk-scan-0.1.0",
    input_hash: analysis.inputHash,
    output_hash: analysis.outputHash,
    summary: {
      risk_score: blockedFindings > 0 ? 100 : mediumFindings > 0 ? 50 : 0,
      blocked_findings: blockedFindings,
      redacted_findings: 0,
      review_required: decision !== "publishable",
    },
    findings: [...groupedFindings.values()].sort((left, right) => left.class.localeCompare(right.class)),
    decision,
    notes: "Generated by local deterministic scanning. No raw matched values are included.",
  };
}

async function writeRedactionReport(packageDir, outputPath) {
  const targetPath = outputPath
    ? resolve(process.cwd(), outputPath)
    : resolve(process.cwd(), packageDir, "reports", "redaction-report.json");
  const analysis = await analyzePackage(packageDir);
  const report = buildRedactionReport(analysis);

  await mkdir(dirname(targetPath), { recursive: true });
  await writeFile(targetPath, `${JSON.stringify(report, null, 2)}\n`);

  console.log(`Wrote redaction report to ${targetPath}`);
  console.log(`Decision: ${report.decision}`);
}

async function previewPackage(packageDir) {
  const analysis = await analyzePackage(packageDir);
  const report = buildRedactionReport(analysis);
  const groupedFindings = new Map();

  for (const finding of analysis.findings) {
    const current = groupedFindings.get(finding.label) ?? {
      label: finding.label,
      severity: finding.severity,
      count: 0,
    };
    current.count += 1;
    groupedFindings.set(finding.label, current);
  }

  console.log(`Package: ${resolve(process.cwd(), packageDir)}`);
  console.log(`Records: ${analysis.recordCount}`);
  console.log(`Findings: ${analysis.findings.length}`);
  console.log(`Decision: ${report.decision}`);
  console.log(`Review required: ${report.summary.review_required ? "yes" : "no"}`);

  for (const finding of [...groupedFindings.values()].sort((left, right) => left.label.localeCompare(right.label))) {
    console.log(`- ${finding.label}: ${finding.count} (${finding.severity})`);
  }
}

async function validatePackage(packageDir) {
  const analysis = await analyzePackage(packageDir);
  const report = buildRedactionReport(analysis);
  const failed = report.decision === "blocked";

  console.log(`Package validation: ${failed ? "failed" : "passed"}`);
  console.log(`Records: ${analysis.recordCount}`);
  console.log(`Findings: ${analysis.findings.length}`);
  console.log(`Blocked findings: ${report.summary.blocked_findings}`);
  console.log(`Decision: ${report.decision}`);
  console.log(`Review required: ${report.summary.review_required ? "yes" : "no"}`);

  if (failed) {
    process.exit(2);
  }
}

async function readPackageManifest(packageDir) {
  const manifestPath = resolve(process.cwd(), packageDir, "metadata", "manifest.json");

  let contents;
  try {
    contents = await readFile(manifestPath);
  } catch (error) {
    console.error(`Unable to read manifest at ${manifestPath}`);
    console.error(error.message);
    process.exit(1);
  }

  let manifest;
  try {
    manifest = JSON.parse(contents.toString("utf8"));
  } catch (error) {
    console.error(`Invalid JSON in manifest at ${manifestPath}`);
    console.error(error.message);
    process.exit(1);
  }

  return {
    manifest,
    manifestHash: sha256Hex(contents),
    manifestPath,
  };
}

function recipientClassesForReleaseTier(releaseTier) {
  switch (releaseTier) {
    case "public_release":
      return ["public"];
    case "controlled_research":
      return ["data_access_committee", "approved_researchers"];
    case "reproducibility_snapshot":
      return ["approved_researchers"];
    default:
      return ["project_steward"];
  }
}

function consentReleaseTier(releaseTier) {
  return ["local_review", "controlled_research", "public_release", "reproducibility_snapshot"].includes(releaseTier)
    ? releaseTier
    : "local_review";
}

function consentAdapters(manifest) {
  if (Array.isArray(manifest.source_adapters) && manifest.source_adapters.length > 0) {
    return manifest.source_adapters.map((adapter) => ({
      name: adapter.name ?? "TODO: adapter name",
      version: adapter.version ?? "TODO: adapter version",
      ...(adapter.capture_method ? { capture_method: adapter.capture_method } : {}),
    }));
  }

  return [
    {
      name: "TODO: adapter name",
      version: "TODO: adapter version",
    },
  ];
}

function buildConsentDraft(packageDir, manifest, manifestHash) {
  const releaseTier = consentReleaseTier(manifest.release_tier);

  return {
    schema_version: "0.1.0",
    receipt_id: `consent-draft-${manifestHash.slice("sha256:".length, "sha256:".length + 16)}`,
    created_at: new Date().toISOString(),
    notice_version: "od4a-consent-notice-draft-0.1.0",
    controller: {
      name: manifest.publisher?.name ?? "TODO: controller name",
      contact: manifest.publisher?.contact ?? "TODO: controller contact",
    },
    source_scope: {
      sources: [manifest.package_id ?? packageDir],
      adapters: consentAdapters(manifest),
      project_scope: [packageDir],
      time_scope: {
        mode: "one_time",
      },
    },
    data_classes: ["ai_interaction_records"],
    purposes: ["open_ai_research"],
    recipient_classes: recipientClassesForReleaseTier(releaseTier),
    release_tier: releaseTier,
    redaction_policy_version: "od4a-local-risk-scan-0.1.0",
    package_manifest_hash: manifestHash,
    retention: {
      class: "until_withdrawn",
    },
    withdrawal: {
      method: "TODO: add withdrawal URL or email before activation",
    },
    status: "draft",
  };
}

async function writeConsentDraft(packageDir, outputPath) {
  const targetPath = outputPath
    ? resolve(process.cwd(), outputPath)
    : resolve(process.cwd(), packageDir, "receipts", "consent-draft.json");
  const { manifest, manifestHash } = await readPackageManifest(packageDir);
  const draft = buildConsentDraft(packageDir, manifest, manifestHash);

  await mkdir(dirname(targetPath), { recursive: true });
  await writeFile(targetPath, `${JSON.stringify(draft, null, 2)}\n`);

  console.log(`Wrote draft consent receipt to ${targetPath}`);
  console.log(`Status: ${draft.status}`);
  console.log(`Package manifest hash: ${draft.package_manifest_hash}`);
}

async function readJsonFile(jsonPath, description) {
  let contents;
  try {
    contents = await readFile(jsonPath, "utf8");
  } catch (error) {
    console.error(`Unable to read ${description} at ${jsonPath}`);
    console.error(error.message);
    process.exit(1);
  }

  try {
    return JSON.parse(contents);
  } catch (error) {
    console.error(`Invalid JSON in ${description} at ${jsonPath}`);
    console.error(error.message);
    process.exit(1);
  }
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.length > 0;
}

function hasNonEmptyArray(value) {
  return Array.isArray(value) && value.length > 0;
}

function pushIssue(issues, code) {
  if (!issues.includes(code)) {
    issues.push(code);
  }
}

function validateConsentTimeScope(timeScope, receipt, issues) {
  if (!timeScope || typeof timeScope !== "object") {
    pushIssue(issues, "source_scope.time_scope_required");
    return;
  }

  if (!["one_time", "fixed_range", "rolling_with_expiry"].includes(timeScope.mode)) {
    pushIssue(issues, "source_scope.time_scope.mode_invalid");
    return;
  }

  if (timeScope.mode === "one_time" && !isNonEmptyString(receipt.package_manifest_hash)) {
    pushIssue(issues, "package_manifest_hash_required_for_one_time");
  }

  if (timeScope.mode === "fixed_range" && (!isNonEmptyString(timeScope.from) || !isNonEmptyString(timeScope.to))) {
    pushIssue(issues, "source_scope.time_scope.fixed_range_required");
  }

  const hasExpiry = isNonEmptyString(timeScope.expires_at);
  const hasRange = isNonEmptyString(timeScope.from) && isNonEmptyString(timeScope.to);
  if (timeScope.mode === "rolling_with_expiry" && !hasExpiry && !hasRange) {
    pushIssue(issues, "source_scope.time_scope.rolling_boundary_required");
  }
}

function validateConsentReceipt(receipt, expectedManifestHash) {
  const issues = [];
  const activeStatuses = ["active", "withdrawn", "deleted", "expired", "superseded"];
  const terminalStatuses = ["withdrawn", "deleted", "expired", "superseded"];

  if (!receipt || typeof receipt !== "object" || Array.isArray(receipt)) {
    return ["receipt_object_required"];
  }

  if (receipt.schema_version !== "0.1.0") {
    pushIssue(issues, "schema_version_invalid");
  }
  for (const field of ["receipt_id", "created_at", "notice_version", "status"]) {
    if (!isNonEmptyString(receipt[field])) {
      pushIssue(issues, `${field}_required`);
    }
  }

  if (!["draft", ...activeStatuses].includes(receipt.status)) {
    pushIssue(issues, "status_invalid");
  }

  if (!receipt.controller || !isNonEmptyString(receipt.controller.name) || !isNonEmptyString(receipt.controller.contact)) {
    pushIssue(issues, "controller_required");
  }

  if (!receipt.source_scope || typeof receipt.source_scope !== "object") {
    pushIssue(issues, "source_scope_required");
  } else {
    if (!hasNonEmptyArray(receipt.source_scope.sources)) {
      pushIssue(issues, "source_scope.sources_required");
    }
    if (!hasNonEmptyArray(receipt.source_scope.adapters)) {
      pushIssue(issues, "source_scope.adapters_required");
    } else if (
      receipt.source_scope.adapters.some((adapter) => !isNonEmptyString(adapter?.name) || !isNonEmptyString(adapter?.version))
    ) {
      pushIssue(issues, "source_scope.adapters_metadata_required");
    }
    validateConsentTimeScope(receipt.source_scope.time_scope, receipt, issues);
  }

  for (const field of ["data_classes", "purposes", "recipient_classes"]) {
    if (!hasNonEmptyArray(receipt[field])) {
      pushIssue(issues, `${field}_required`);
    }
  }

  if (!["local_review", "controlled_research", "public_release", "reproducibility_snapshot"].includes(receipt.release_tier)) {
    pushIssue(issues, "release_tier_invalid");
  }

  if (!receipt.retention || !["delete_after_review", "fixed_period", "until_withdrawn", "archival"].includes(receipt.retention.class)) {
    pushIssue(issues, "retention.class_invalid");
  } else if (receipt.retention.class === "fixed_period" && !isNonEmptyString(receipt.retention.expires_at)) {
    pushIssue(issues, "retention.expires_at_required");
  }

  if (!receipt.withdrawal || !isNonEmptyString(receipt.withdrawal.method)) {
    pushIssue(issues, "withdrawal.method_required");
  } else if (activeStatuses.includes(receipt.status) && !isNonEmptyString(receipt.withdrawal.url) && !isNonEmptyString(receipt.withdrawal.email)) {
    pushIssue(issues, "withdrawal_path_required_for_active_consent");
  }

  if (activeStatuses.includes(receipt.status) && !isNonEmptyString(receipt.package_manifest_hash)) {
    pushIssue(issues, "package_manifest_hash_required_for_active_consent");
  }

  if (expectedManifestHash && receipt.package_manifest_hash !== expectedManifestHash) {
    pushIssue(issues, "package_manifest_hash_mismatch");
  }

  if (terminalStatuses.includes(receipt.status)) {
    if (!receipt.tombstone || typeof receipt.tombstone !== "object") {
      pushIssue(issues, "tombstone_required_for_terminal_consent");
    } else {
      if (!isNonEmptyString(receipt.tombstone.created_at)) {
        pushIssue(issues, "tombstone.created_at_required");
      }
      if (!["draft", "active", "withdrawn", "deleted", "expired", "superseded"].includes(receipt.tombstone.previous_status)) {
        pushIssue(issues, "tombstone.previous_status_invalid");
      }
      if (
        ![
          "user_withdrawal",
          "deletion_request",
          "retention_expired",
          "superseded",
          "administrative_correction",
          "other",
        ].includes(receipt.tombstone.reason_class)
      ) {
        pushIssue(issues, "tombstone.reason_class_invalid");
      }
    }
  }

  return issues;
}

async function validateConsentCommand(receiptPath, packageDir) {
  if (!receiptPath) {
    console.error("Usage: od4a validate-consent <receipt-json> [package-dir]");
    process.exit(1);
  }

  const resolvedReceiptPath = resolve(process.cwd(), receiptPath);
  const receipt = await readJsonFile(resolvedReceiptPath, "consent receipt");
  const expectedManifestHash = packageDir ? (await readPackageManifest(packageDir)).manifestHash : null;
  const issues = validateConsentReceipt(receipt, expectedManifestHash);

  console.log(`Consent validation: ${issues.length === 0 ? "passed" : "failed"}`);
  console.log(`Issues: ${issues.length}`);
  for (const issue of issues) {
    console.log(`- ${issue}`);
  }

  if (issues.length > 0) {
    process.exit(1);
  }
}

function safeFilePart(value) {
  return String(value || "consent").replace(/[^A-Za-z0-9._-]/g, "_");
}

async function withdrawConsentCommand(receiptPath, outputPath) {
  if (!receiptPath) {
    console.error("Usage: od4a withdraw-consent <receipt-json> [output-json]");
    process.exit(1);
  }

  const resolvedReceiptPath = resolve(process.cwd(), receiptPath);
  const receipt = await readJsonFile(resolvedReceiptPath, "consent receipt");
  const preflightIssues = validateConsentReceipt(receipt, null);

  if (preflightIssues.length > 0) {
    console.log("Consent withdrawal: failed");
    console.log(`Issues: ${preflightIssues.length}`);
    for (const issue of preflightIssues) {
      console.log(`- ${issue}`);
    }
    process.exit(1);
  }

  if (receipt.status !== "active") {
    console.log("Consent withdrawal: failed");
    console.log("Issues: 1");
    console.log("- active_status_required_for_withdrawal");
    process.exit(1);
  }

  const withdrawn = {
    ...receipt,
    receipt_id: `${receipt.receipt_id}-withdrawn`,
    status: "withdrawn",
    tombstone: {
      created_at: new Date().toISOString(),
      previous_status: receipt.status,
      reason_class: "user_withdrawal",
      deletion_scope: "future_processing_only",
    },
  };
  const targetPath = outputPath
    ? resolve(process.cwd(), outputPath)
    : resolve(dirname(resolvedReceiptPath), `${safeFilePart(withdrawn.receipt_id)}.json`);

  await mkdir(dirname(targetPath), { recursive: true });
  await writeFile(targetPath, `${JSON.stringify(withdrawn, null, 2)}\n`);

  console.log(`Wrote withdrawn consent receipt to ${targetPath}`);
  console.log(`Status: ${withdrawn.status}`);
  console.log(`Previous status: ${withdrawn.tombstone.previous_status}`);
  console.log(`Reason class: ${withdrawn.tombstone.reason_class}`);
}

async function inspectPackage(packageDir) {
  const { manifest } = await readPackageManifest(packageDir);

  const fileCount = Array.isArray(manifest.files) ? manifest.files.length : 0;
  const consentCount = Array.isArray(manifest.consent_receipts) ? manifest.consent_receipts.length : 0;
  const reportCount = Array.isArray(manifest.redaction_reports) ? manifest.redaction_reports.length : 0;

  console.log(`Package: ${manifest.package_id ?? "(unknown)"}`);
  console.log(`Version: ${manifest.version ?? "(unknown)"}`);
  console.log(`Release tier: ${manifest.release_tier ?? "(unknown)"}`);
  console.log(`Schema version: ${manifest.schema_version ?? "(unknown)"}`);
  console.log(`Files: ${fileCount}`);
  console.log(`Consent receipts: ${consentCount}`);
  console.log(`Redaction reports: ${reportCount}`);
  console.log(`Validation: ${manifest.validation?.status ?? "(unknown)"}`);
}

function printHelp() {
  console.log(`opendata4all

Usage:
  od4a init [package-dir]
  od4a import <source-jsonl> [package-dir]
  od4a import-openai-api <app-log-jsonl> [package-dir]
  od4a import-codex-hook <hook-jsonl> [package-dir]
  od4a import-claude-code-hook <hook-jsonl> [package-dir]
  od4a export [package-dir] [output-jsonl]
  od4a manifest [package-dir]
  od4a dataset-card [package-dir] [output-md]
  od4a hf-sample [package-dir] [output-dir]
  od4a derive-tables [package-dir] [output-dir]
  od4a scan [package-dir]
  od4a report [package-dir] [output-json]
  od4a preview [package-dir]
  od4a validate-package [package-dir]
  od4a consent-draft [package-dir] [output-json]
  od4a validate-consent <receipt-json> [package-dir]
  od4a withdraw-consent <receipt-json> [output-json]
  od4a validate
  od4a validate-schemas
  od4a validate-examples
  od4a inspect [package-dir]
  od4a help

Current commands are intentionally narrow. The initial CLI only performs local
package scaffolding, JSONL import/export, first adapter normalization, risk
scanning, redaction reporting, preview summaries, fail-closed package
validation, local manifest and dataset-card generation, draft consent receipt
generation, consent validation, withdrawal records, local Hugging Face sample
materialization, raw-text-free derived table generation, and manifest
inspection.
`);
}

switch (command) {
  case "init":
    await initPackage(args[1] ?? "od4a-package");
    break;
  case "import":
    if (args.length < 2) {
      console.error("Usage: od4a import <source-jsonl> [package-dir]");
      process.exit(1);
    }
    await importJsonl(args[1], args[2] ?? ".");
    break;
  case "import-openai-api":
    if (args.length < 2) {
      console.error("Usage: od4a import-openai-api <app-log-jsonl> [package-dir]");
      process.exit(1);
    }
    await importOpenAiApiLog(args[1], args[2] ?? ".");
    break;
  case "import-codex-hook":
    if (args.length < 2) {
      console.error("Usage: od4a import-codex-hook <hook-jsonl> [package-dir]");
      process.exit(1);
    }
    await importCodexHookLog(args[1], args[2] ?? ".");
    break;
  case "import-claude-code-hook":
    if (args.length < 2) {
      console.error("Usage: od4a import-claude-code-hook <hook-jsonl> [package-dir]");
      process.exit(1);
    }
    await importClaudeCodeHookLog(args[1], args[2] ?? ".");
    break;
  case "export":
    await exportJsonl(args[1] ?? ".", args[2]);
    break;
  case "manifest":
    await writePackageManifest(args[1] ?? ".");
    break;
  case "dataset-card":
    await writeDatasetCard(args[1] ?? ".", args[2]);
    break;
  case "hf-sample":
    await writeHfSample(args[1] ?? ".", args[2] ?? "hf-sample");
    break;
  case "derive-tables":
    await writeDerivedTables(args[1] ?? ".", args[2]);
    break;
  case "scan":
    await scanPackage(args[1] ?? ".");
    break;
  case "report":
    await writeRedactionReport(args[1] ?? ".", args[2]);
    break;
  case "preview":
    await previewPackage(args[1] ?? ".");
    break;
  case "validate-package":
    await validatePackage(args[1] ?? ".");
    break;
  case "consent-draft":
    await writeConsentDraft(args[1] ?? ".", args[2]);
    break;
  case "validate-consent":
    await validateConsentCommand(args[1], args[2]);
    break;
  case "withdraw-consent":
    await withdrawConsentCommand(args[1], args[2]);
    break;
  case "validate":
    runNodeScripts([
      resolve(root, "scripts", "check-schemas.mjs"),
      resolve(root, "scripts", "check-examples.mjs"),
    ]);
    break;
  case "validate-schemas":
    runNodeScript(resolve(root, "scripts", "check-schemas.mjs"));
    break;
  case "validate-examples":
    runNodeScript(resolve(root, "scripts", "check-examples.mjs"));
    break;
  case "inspect":
    await inspectPackage(args[1] ?? ".");
    break;
  case "help":
  case "--help":
  case "-h":
    printHelp();
    break;
  default:
    console.error(`Unknown command: ${command}`);
    printHelp();
    process.exit(1);
}
