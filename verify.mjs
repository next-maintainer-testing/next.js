import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import net from 'node:net';

const cwd = new URL('.', import.meta.url).pathname;
let serverProcess;

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
      stdio: 'inherit',
    });
    child.once('error', reject);
    child.once('close', (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} ${args.join(' ')} exited with code ${code} signal ${signal ?? 'none'}`));
    });
  });
}

function reservePort() {
  return new Promise((resolve, reject) => {
    const socket = net.createServer();
    socket.once('error', reject);
    socket.listen(0, '127.0.0.1', () => {
      const address = socket.address();
      const port = typeof address === 'object' && address ? address.port : null;
      socket.close(error => error ? reject(error) : resolve(port));
    });
  });
}

async function stopServer() {
  if (!serverProcess || serverProcess.exitCode !== null) return;
  const closed = new Promise(resolve => serverProcess.once('close', resolve));
  serverProcess.kill('SIGTERM');
  const stopped = await Promise.race([
    closed.then(() => true),
    new Promise(resolve => setTimeout(() => resolve(false), 5000)),
  ]);
  if (!stopped && serverProcess.exitCode === null) {
    serverProcess.kill('SIGKILL');
    await closed;
  }
}

async function fetchRenderedPage(port) {
  const url = `http://127.0.0.1:${port}/ja/tag/groovy?nxtPslugList=groovy`;
  let lastError;
  for (let attempt = 0; attempt < 120; attempt++) {
    if (serverProcess.exitCode !== null) {
      throw new Error(`next start exited before serving the page (code ${serverProcess.exitCode})`);
    }
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.text();
    } catch (error) {
      lastError = error;
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
  throw new Error(`server did not become ready: ${lastError}`);
}

try {
  const nextVersion = JSON.parse(await readFile(new URL('./node_modules/next/package.json', import.meta.url), 'utf8')).version;
  const reactVersion = JSON.parse(await readFile(new URL('./node_modules/react/package.json', import.meta.url), 'utf8')).version;
  console.log(`Testing next=${nextVersion} react=${reactVersion}`);

  await run('npm', ['run', 'build']);

  const port = await reservePort();
  serverProcess = spawn(process.execPath, ['./node_modules/next/dist/bin/next', 'start', '-p', String(port)], {
    cwd,
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
    stdio: ['ignore', 'inherit', 'inherit'],
  });

  const html = await fetchRenderedPage(port);
  const englishHref = html.match(/href="([^"]*)"[^>]*>English<\/a>/)?.[1];
  const spanishHref = html.match(/href="([^"]*)"[^>]*>Español<\/a>/)?.[1];
  console.log(`SSR locale links: English=${englishHref ?? 'missing'} Español=${spanishHref ?? 'missing'}`);

  const leakedInternalParam = [englishHref, spanishHref].some(href => href?.includes('nxtPslugList=groovy'));
  const cleanLinks = englishHref === '/tag/groovy' && spanishHref === '/es/tag/groovy';

  if (leakedInternalParam) {
    console.log('SYMPTOM PRESENT: the internal nxtPslugList route parameter leaked into SSR locale links.');
    process.exitCode = 0;
  } else if (cleanLinks) {
    console.log('SYMPTOM ABSENT: SSR locale links contain the public path and no internal route parameter.');
    process.exitCode = 1;
  } else {
    console.error('CHECK FAILED: rendered locale links matched neither the reported nor expected output.');
    process.exitCode = 2;
  }
} catch (error) {
  console.error(error?.stack ?? error);
  process.exitCode = 2;
} finally {
  await stopServer();
}
