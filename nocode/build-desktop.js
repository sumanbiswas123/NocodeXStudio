import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { rcedit } from 'rcedit';

const copyDir = (src, dest) => {
    if (!fs.existsSync(src)) return;
    fs.mkdirSync(dest, { recursive: true });
    for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
        const srcPath = path.join(src, entry.name);
        const destPath = path.join(dest, entry.name);
        if (entry.isDirectory()) {
            copyDir(srcPath, destPath);
        } else if (entry.isFile()) {
            fs.copyFileSync(srcPath, destPath);
        }
    }
};

const configFile = 'neutralino.config.json';
const devConfig = fs.readFileSync(configFile, 'utf8');
const config = JSON.parse(devConfig);
const args = new Set(process.argv.slice(2));
const standalone = args.has('--standalone');
const release = args.has('--release');
const clean = args.has('--clean');

// Switch to Prod settings
config.documentRoot = 'dist/';
config.url = '/';
    config.modes.window.enableInspector = true; // Enable inspector for prod debugging

console.log('Switching to Production Config...');
fs.writeFileSync(configFile, JSON.stringify(config, null, 2));

try {
    // Generate .ico from public/app-icon.svg (if present)
    execSync('node scripts/generate-windows-icon.js', { stdio: 'inherit', shell: true });

    const flags = [];
    if (standalone) flags.push('--embed-resources');
    if (release) flags.push('--release');
    const resourcesPath = (config.cli?.resourcesPath || '').replace(/^\/+/, '');
    const distributionPath = (config.cli?.distributionPath || '').replace(/^\/+/, '');
    const canClean = clean && resourcesPath !== distributionPath;
    if (clean && !canClean) {
        console.log('Skipping --clean because resourcesPath and distributionPath are the same directory.');
    }
    if (canClean) flags.push('--clean');

    const cmd = `npx neu build${flags.length ? ` ${flags.join(' ')}` : ''}`;
    console.log(`Running Neutralino Build: ${cmd}`);
    execSync(cmd, { stdio: 'inherit', shell: true });

    const binaryName = config?.cli?.binaryName || 'nocode-x-studio';
    const exePath = path.join(process.cwd(), 'dist', binaryName, `${binaryName}-win_x64.exe`);
    const iconPath = path.join(process.cwd(), 'installer', 'assets', 'app.ico');
    const appRoot = path.join(process.cwd(), 'dist', binaryName);
    const nodeSource = process.execPath;
    const nodeDir = path.join(appRoot, 'node');
    const nodeTarget = path.join(nodeDir, 'node.exe');
    try {
      if (!fs.existsSync(nodeDir)) fs.mkdirSync(nodeDir, { recursive: true });
      fs.copyFileSync(nodeSource, nodeTarget);
      console.log(`Bundled node.exe at ${nodeTarget}`);
    } catch (err) {
      console.warn('Failed to bundle node.exe:', err?.message || err);
    }

    try {
      const workerSrc = path.join(process.cwd(), 'scripts', 'pdf_annotation_worker.mjs');
      const workerDir = path.join(appRoot, 'scripts');
      if (!fs.existsSync(workerDir)) fs.mkdirSync(workerDir, { recursive: true });
      if (fs.existsSync(workerSrc)) {
        fs.copyFileSync(workerSrc, path.join(workerDir, 'pdf_annotation_worker.mjs'));
        console.log('Bundled pdf_annotation_worker.mjs');
      }
    } catch (err) {
      console.warn('Failed to bundle pdf_annotation_worker.mjs:', err?.message || err);
    }

    try {
      const pdfjsSrc = path.join(process.cwd(), 'node_modules', 'pdfjs-dist');
      const pdfjsDest = path.join(appRoot, 'node_modules', 'pdfjs-dist');
      copyDir(pdfjsSrc, pdfjsDest);
      console.log('Bundled pdfjs-dist for PDF worker.');
    } catch (err) {
      console.warn('Failed to bundle pdfjs-dist:', err?.message || err);
    }
    if (fs.existsSync(exePath) && fs.existsSync(iconPath)) {
      console.log(`Patching EXE icon: ${exePath}`);
      await rcedit(exePath, { icon: iconPath });
    } else {
      console.warn('Skipping EXE icon patch. Missing exe or icon file.');
    }
} catch (e) {
    console.error('Desktop build failed.');
    process.exit(1);
} finally {
    // Restore Dev settings
    fs.writeFileSync(configFile, devConfig);
    console.log('Restored Development Config.');
}
