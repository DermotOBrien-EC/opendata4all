import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const excludedPathSegments = new Set([
  ".git",
  ".cache",
  ".next",
  ".turbo",
  ".venv",
  "__pycache__",
  "build",
  "coverage",
  "dist",
  "node_modules",
  "vendor",
  "venv",
]);

const detectors = [
  {
    label: "secret.openai_api_key",
    pattern: /\bsk-[A-Za-z0-9_-]{32,}\b/g,
  },
  {
    label: "secret.aws_access_key",
    pattern: /\bA[KS]IA[0-9A-Z]{16}\b/g,
  },
  {
    label: "secret.github_token",
    pattern: /\bgh[pousr]_[A-Za-z0-9_]{30,}\b/g,
  },
  {
    label: "secret.github_fine_grained_token",
    pattern: /\bgithub_pat_[A-Za-z0-9_]{20,}_[A-Za-z0-9_]{40,}\b/g,
  },
  {
    label: "secret.pem_private_key",
    pattern: /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----/g,
  },
];

const allowlistedMatches = new Set([
  [
    "examples/redaction-canaries/high-risk-secret.jsonl",
    "secret.openai_api_key",
    ["sk", "synthetic", "redaction", "canary", "000000000000"].join("-"),
  ].join("\0"),
  [
    "examples/redaction-canaries/high-risk-aws-access-key.jsonl",
    "secret.aws_access_key",
    ["AKIA", "SYNTHETIC", "0000000"].join(""),
  ].join("\0"),
  [
    "examples/redaction-canaries/high-risk-github-token.jsonl",
    "secret.github_token",
    ["ghp", "syntheticredactioncanary000000"].join("_"),
  ].join("\0"),
  [
    "examples/redaction-canaries/high-risk-private-key.jsonl",
    "secret.pem_private_key",
    ["-----BEGIN", "SYNTHETIC PRIVATE KEY-----"].join(" "),
  ].join("\0"),
]);

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function repoFiles() {
  const result = spawnSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"], {
    encoding: "buffer",
  });

  if (result.error) {
    throw result.error;
  }

  assert(result.status === 0, "git ls-files failed while preparing repository secret scan");

  return result.stdout
    .toString("utf8")
    .split("\0")
    .filter((path) => path.length > 0)
    .filter((path) => !path.split("/").some((segment) => excludedPathSegments.has(segment)))
    .sort();
}

function isBinary(buffer) {
  return buffer.includes(0);
}

function lineNumberAt(text, index) {
  let line = 1;
  for (let cursor = 0; cursor < index; cursor += 1) {
    if (text.charCodeAt(cursor) === 10) {
      line += 1;
    }
  }
  return line;
}

function isAllowlisted(path, label, value) {
  return allowlistedMatches.has([path, label, value].join("\0"));
}

function scanFile(path) {
  const buffer = readFileSync(path);
  if (isBinary(buffer)) {
    return [];
  }

  const text = buffer.toString("utf8");
  const findings = [];

  for (const detector of detectors) {
    detector.pattern.lastIndex = 0;
    for (const match of text.matchAll(detector.pattern)) {
      const value = match[0];
      if (isAllowlisted(path, detector.label, value)) {
        continue;
      }

      findings.push({
        path,
        line: lineNumberAt(text, match.index ?? 0),
        label: detector.label,
      });
    }
  }

  return findings;
}

const findings = repoFiles().flatMap(scanFile);

if (findings.length > 0) {
  console.log("Repository secret scan: failed");
  console.log(`Findings: ${findings.length}`);
  for (const finding of findings) {
    console.log(`- ${finding.path}:${finding.line} ${finding.label}`);
  }
  process.exit(1);
}

console.log("Repository secret scan: passed");
