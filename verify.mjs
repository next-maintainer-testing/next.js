import { rmSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import vm from 'node:vm';

function fail(message, details = '') {
  console.error(`CHECK_FAILED: ${message}`);
  if (details) console.error(details);
  process.exitCode = 2;
}

function javascriptFiles(root) {
  const files = [];
  const visit = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) visit(path);
      else if (entry.isFile() && entry.name.endsWith('.js')) files.push(path);
    }
  };
  visit(root);
  return files;
}

rmSync('.next', { recursive: true, force: true });
const build = spawnSync('npm', ['run', 'build'], {
  cwd: process.cwd(),
  env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
  encoding: 'utf8',
  timeout: 240_000,
  maxBuffer: 20 * 1024 * 1024,
});

if (build.error || build.status !== 0) {
  fail(
    build.error ? `next build could not run: ${build.error.message}` : `next build exited ${build.status}`,
    `${build.stdout || ''}\n${build.stderr || ''}`.slice(-12000),
  );
} else {
  const chunkRoot = join('.next', 'static', 'chunks');
  let matchedChunk = null;
  let matchedFactory = null;
  let matchedSandbox = null;

  try {
    for (const path of javascriptFiles(chunkRoot)) {
      const source = readFileSync(path, 'utf8');
      if (!/\.prototype\.veV\s*=/.test(source)) continue;

      const payloads = [];
      const turbopack = { push(payload) { payloads.push(payload); } };
      const sandbox = { TURBOPACK: turbopack, window: {}, console };
      sandbox.globalThis = sandbox;
      vm.createContext(sandbox);
      vm.runInContext(source, sandbox, { filename: path, timeout: 10_000 });

      const factory = payloads
        .flat()
        .find((value) => typeof value === 'function' && /\.prototype\.veV\s*=/.test(Function.prototype.toString.call(value)));
      if (factory) {
        matchedChunk = path;
        matchedFactory = factory;
        matchedSandbox = sandbox;
        break;
      }
    }
  } catch (error) {
    fail(`could not load the emitted client chunk: ${error?.stack || error}`);
  }

  if (process.exitCode === undefined) {
    if (!matchedFactory) {
      fail('the production client module containing prototype.veV was not found');
    } else {
      const runtime = new Proxy({}, {
        get(target, property) {
          if (property in target) return target[property];
          return (...args) => {
            throw new Error(`unexpected Turbopack runtime call ${String(property)}(${args.length} args)`);
          };
        },
      });
      const module = { exports: {} };

      try {
        matchedFactory.call(undefined, runtime, module, module.exports);
      } catch (error) {
        fail(`the emitted veV module could not be initialized: ${error?.stack || error}`, `chunk: ${matchedChunk}`);
      }

      if (process.exitCode === undefined) {
        const exported = module.exports;
        const Constructor = matchedSandbox.window.t
          || (typeof exported === 'function' ? exported : exported?.default);
        if (typeof Constructor !== 'function') {
          fail('the emitted veV constructor was not exported by the client module', `chunk: ${matchedChunk}`);
        } else {
          const instance = new Constructor({ getShapes: () => [] });
          const data = { JVV: { editor: 'test-editor' } };
          const selection = {
            shapes: {
              all: () => [
                { isSelected: () => true, ctV: 'Shape1' },
                { isSelected: () => false, ctV: 'Shape2' },
              ],
            },
          };

          try {
            instance.veV(data, selection);
            console.log(`SYMPTOM_ABSENT: emitted veV completed without an exception (${matchedChunk})`);
            process.exitCode = 1;
          } catch (error) {
            console.log(`SYMPTOM_PRESENT: emitted veV threw ${error?.name || 'Error'}: ${error?.message || error}`);
            console.log(`chunk: ${matchedChunk}`);
            process.exitCode = 0;
          }
        }
      }
    }
  }
}
