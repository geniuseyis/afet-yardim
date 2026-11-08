const fs = require("fs");
const path = require("path");

const root = process.cwd();
const issues = [];

function readJson(relPath) {
  const full = path.join(root, relPath);
  return JSON.parse(fs.readFileSync(full, "utf8"));
}

function checkAppJson() {
  const app = readJson("app.json");
  const projectId = app?.expo?.extra?.eas?.projectId;
  if (!projectId) {
    issues.push("app.json: expo.extra.eas.projectId eksik");
    return;
  }
  if (projectId === "REPLACE_WITH_EAS_PROJECT_ID") {
    issues.push("app.json: expo.extra.eas.projectId placeholder olarak duruyor");
  }
}

function checkFiles() {
  const required = [
    "firestore.rules",
    "storage.rules",
    "firestore.indexes.json",
    "eas.json",
    "docs/privacy-policy.md",
    "docs/terms-of-service.md",
    "docs/data-safety-checklist.md",
  ];
  for (const rel of required) {
    if (!fs.existsSync(path.join(root, rel))) {
      issues.push(`Eksik dosya: ${rel}`);
    }
  }
}

function main() {
  try {
    checkAppJson();
    checkFiles();
  } catch (err) {
    console.error("Preflight okuma hatasi:", err.message);
    process.exit(1);
  }

  if (issues.length) {
    console.error("Release preflight basarisiz:");
    for (const issue of issues) console.error(`- ${issue}`);
    process.exit(1);
  }

  console.log("Release preflight basarili: temel yerel kontroller gecti.");
}

main();
