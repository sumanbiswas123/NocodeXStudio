import fs from "fs";
import path from "path";
import { execFileSync } from "child_process";

const args = new Set(process.argv.slice(2));
const release = args.has("--release");

const repoRoot = process.cwd();
const manifestPath = path.join(repoRoot, "native", "cdp_bridge", "Cargo.toml");
const profile = release ? "release" : "debug";
const builtBinaryPath = path.join(
  repoRoot,
  "native",
  "cdp_bridge",
  "target",
  profile,
  "cdp_bridge.exe",
);
const stableBinaryPath = path.join(repoRoot, "native", "cdp_bridge.exe");
const binBinaryPath = path.join(repoRoot, "bin", "native", "cdp_bridge.exe");

if (!fs.existsSync(manifestPath)) {
  throw new Error(`Rust sidecar manifest not found at ${manifestPath}`);
}

const cargoArgs = ["build", "--manifest-path", manifestPath];
if (release) cargoArgs.push("--release");

console.log(
  `Preparing Rust sidecar (${profile}) with: cargo ${cargoArgs.join(" ")}`,
);

execFileSync("cargo", cargoArgs, {
  cwd: repoRoot,
  stdio: "inherit",
  shell: process.platform === "win32",
});

if (!fs.existsSync(builtBinaryPath)) {
  throw new Error(`Expected sidecar binary missing at ${builtBinaryPath}`);
}

fs.copyFileSync(builtBinaryPath, stableBinaryPath);
console.log(`Copied sidecar binary to ${stableBinaryPath}`);

fs.mkdirSync(path.dirname(binBinaryPath), { recursive: true });
fs.copyFileSync(builtBinaryPath, binBinaryPath);
console.log(`Copied sidecar binary to ${binBinaryPath}`);
