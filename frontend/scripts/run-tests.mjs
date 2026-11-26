import { spawn } from 'node:child_process';
import { readdirSync, statSync } from 'node:fs';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const testRoot = resolve(root, 'tests');
const requested = process.argv.slice(2);
const tests = requested.length
  ? requested.map(file => resolve(root, file))
  : readdirSync(testRoot).filter(file => file.endsWith('.test.js')).sort()
    .map(file => resolve(testRoot, file));

for (const file of tests) {
  const path = relative(testRoot, file);
  if (path.startsWith(`..${sep}`) || isAbsolute(path)
      || !file.endsWith('.test.js') || !statSync(file).isFile()) {
    throw new Error(`Expected a test file under ${testRoot}: ${file}`);
  }
}
if (!tests.length) throw new Error('No test files selected');

const RUN_TIMEOUT_MS = 120_000;
const child = spawn(process.execPath, [
  '--test', '--test-concurrency=1', '--test-timeout=30000', ...tests,
], {
  cwd: root,
  stdio: 'inherit',
  windowsHide: true,
  detached: process.platform !== 'win32',
});

let timedOut = false;
let interrupted = false;
let stopping = false;
let escalation;
let killer;

function stopOwnedTree(reason) {
  if (stopping || child.exitCode !== null || child.signalCode !== null || !child.pid) return;
  stopping = true;
  console.error(`[test runner] ${reason}; stopping owned test tree ${child.pid}`);
  if (process.platform === 'win32') {
    killer = spawn('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], {
      stdio: 'inherit', windowsHide: true,
    });
    killer.once('error', error => {
      console.error(`[test runner] Tree cleanup failed: ${error.message}`);
      process.exitCode = 1;
    });
  } else {
    try { process.kill(-child.pid, 'SIGTERM'); } catch (error) {
      if (error.code !== 'ESRCH') throw error;
    }
    escalation = setTimeout(() => {
      try { process.kill(-child.pid, 'SIGKILL'); } catch (error) {
        if (error.code !== 'ESRCH') throw error;
      }
    }, 5_000);
  }
}

const deadline = setTimeout(() => {
  timedOut = true;
  stopOwnedTree(`Run exceeded ${RUN_TIMEOUT_MS}ms`);
}, RUN_TIMEOUT_MS);

process.once('SIGINT', () => { interrupted = true; stopOwnedTree('Interrupted'); });
process.once('SIGTERM', () => { interrupted = true; stopOwnedTree('Termination requested'); });
child.once('error', error => {
  clearTimeout(deadline);
  console.error(`[test runner] Could not start tests: ${error.message}`);
  process.exitCode = 1;
});
child.once('close', (code, signal) => {
  clearTimeout(deadline);
  clearTimeout(escalation);
  process.exitCode = timedOut ? 124 : interrupted ? 130 : code ?? (signal ? 1 : 0);
});
