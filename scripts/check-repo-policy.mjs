import { readFileSync } from "node:fs";

const packageJsonPath = "package.json";
const ciWorkflowPath = ".github/workflows/ci.yml";

const dependencySections = [
  "dependencies",
  "devDependencies",
  "peerDependencies",
  "optionalDependencies",
  "bundledDependencies",
  "bundleDependencies",
];

const expectedValidationScripts = {
  "validate:schemas": "node scripts/check-schemas.mjs",
  "validate:examples": "node scripts/check-examples.mjs",
  "validate:secrets": "node scripts/check-repo-secrets.mjs",
  "validate:policy": "node scripts/check-repo-policy.mjs",
  "validate:cli": "node scripts/check-cli.mjs",
  "validate:templates": "node scripts/check-policy-templates.mjs",
};

const expectedValidateSteps = [
  "npm run validate:schemas",
  "npm run validate:examples",
  "npm run validate:secrets",
  "npm run validate:policy",
  "npm run validate:cli",
  "npm run validate:templates",
];

const forbiddenCiPatterns = [
  { label: "npm install", pattern: /\bnpm\s+install\b/ },
  { label: "npm ci", pattern: /\bnpm\s+ci\b/ },
  { label: "yarn install", pattern: /\byarn\s+install\b/ },
  { label: "pnpm install", pattern: /\bpnpm\s+install\b/ },
  { label: "bun install", pattern: /\bbun\s+install\b/ },
  { label: "actions/cache", pattern: /\bactions\/cache\b/ },
  { label: "dependency cache", pattern: /\bdependency-cache\b/i },
  { label: "setup-node cache", pattern: /^\s*cache:\s*/m },
];

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function readJson(path) {
  const text = readFileSync(path, "utf8");
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`${path} must be valid JSON: ${error.message}`);
  }
}

function isEmptyDependencySection(value) {
  if (Array.isArray(value)) {
    return value.length === 0;
  }
  if (value && typeof value === "object") {
    return Object.keys(value).length === 0;
  }
  return false;
}

function validatePackageJson() {
  const packageJson = readJson(packageJsonPath);
  assert(packageJson.private === true, "package.json private must be exactly true");

  for (const section of dependencySections) {
    assert(
      packageJson[section] === undefined || isEmptyDependencySection(packageJson[section]),
      `package.json ${section} must be absent or empty`,
    );
  }

  assert(packageJson.scripts && typeof packageJson.scripts === "object", "package.json scripts must exist");
  assert(typeof packageJson.scripts.validate === "string", "package.json scripts.validate must exist");

  for (const [name, expected] of Object.entries(expectedValidationScripts)) {
    assert(packageJson.scripts[name] === expected, `package.json scripts.${name} must be ${JSON.stringify(expected)}`);
  }

  const validateSteps = packageJson.scripts.validate.split("&&").map((step) => step.trim());
  assert(
    validateSteps.length === expectedValidateSteps.length,
    "package.json scripts.validate must run exactly the expected validation gates",
  );

  for (const step of expectedValidateSteps) {
    assert(validateSteps.includes(step), `package.json scripts.validate must include ${JSON.stringify(step)}`);
  }
}

function validateCiWorkflow() {
  const workflowText = readFileSync(ciWorkflowPath, "utf8");

  assert(
    workflowText.includes("node --check scripts/check-repo-policy.mjs"),
    "CI syntax checks must include scripts/check-repo-policy.mjs",
  );
  assert(workflowText.includes("run: npm run validate"), "CI must validate with npm run validate");

  for (const forbidden of forbiddenCiPatterns) {
    assert(!forbidden.pattern.test(workflowText), `CI must not use ${forbidden.label}`);
  }
}

validatePackageJson();
validateCiWorkflow();

console.log("Repository policy validation: passed");
