import fs from "node:fs";
import path from "node:path";
import process from "node:process";

type JsonObject = { [key: string]: any };

function getFlatKeys(obj: JsonObject, prefix = ""): string[] {
  let keys: string[] = [];
  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === "object" && !Array.isArray(value)) {
      keys = keys.concat(getFlatKeys(value, fullKey));
    } else {
      keys.push(fullKey);
    }
  }
  return keys.sort();
}

function checkSymmetry(name: string, fileA: string, fileB: string): boolean {
  if (!fs.existsSync(fileA)) {
    console.error(`Error: File not found: ${fileA}`);
    return false;
  }
  if (!fs.existsSync(fileB)) {
    console.error(`Error: File not found: ${fileB}`);
    return false;
  }

  const contentA = JSON.parse(fs.readFileSync(fileA, "utf-8"));
  const contentB = JSON.parse(fs.readFileSync(fileB, "utf-8"));

  const keysA = getFlatKeys(contentA);
  const keysB = getFlatKeys(contentB);

  const missingInB = keysA.filter((k) => !keysB.includes(k));
  const missingInA = keysB.filter((k) => !keysA.includes(k));

  let passed = true;
  if (missingInB.length > 0) {
    console.error(`\n[${name}] Missing keys in ${path.basename(fileB)} (present in ${path.basename(fileA)}):`);
    for (const key of missingInB) {
      console.error(`  - ${key}`);
    }
    passed = false;
  }

  if (missingInA.length > 0) {
    console.error(`\n[${name}] Missing keys in ${path.basename(fileA)} (present in ${path.basename(fileB)}):`);
    for (const key of missingInA) {
      console.error(`  - ${key}`);
    }
    passed = false;
  }

  if (passed) {
    console.log(`[OK] ${name}: Keys in ${path.basename(fileA)} and ${path.basename(fileB)} are fully symmetrical (${keysA.length} keys).`);
  }

  return passed;
}

function main() {
  const rootDir = path.resolve(import.meta.dirname, "..");
  
  const desktopZh = path.join(rootDir, "apps/desktop/src/renderer/i18n/locales/zh.json");
  const desktopEn = path.join(rootDir, "apps/desktop/src/renderer/i18n/locales/en.json");
  
  const webZh = path.join(rootDir, "apps/web/src/client/locales/zh.json");
  const webEn = path.join(rootDir, "apps/web/src/client/locales/en.json");

  console.log("Validating PromptHub translation key symmetry...");

  const desktopPassed = checkSymmetry("Desktop Locales", desktopZh, desktopEn);
  const webPassed = checkSymmetry("Web Client Locales", webZh, webEn);

  if (!desktopPassed || !webPassed) {
    console.error("\nI18n validation failed! Please synchronize translation keys.");
    process.exitCode = 1;
  } else {
    console.log("\nAll translations are fully synchronized.");
  }
}

main();
