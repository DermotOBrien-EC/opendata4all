#!/usr/bin/env node
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

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
  od4a export [package-dir] [output-jsonl]
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
validation, draft consent receipt generation, consent validation, withdrawal
records, and manifest inspection.
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
  case "export":
    await exportJsonl(args[1] ?? ".", args[2]);
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
