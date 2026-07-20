import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const brokenTemplatePackage = {
  private: true,
  dependencies: {
    '@heroicons/react': '^2.0.18',
    next: '15.0.0-rc.0',
    react: '19.0.0-rc-6230622a1a-20240610',
    'react-dom': '19.0.0-rc-6230622a1a-20240610',
  },
};

const workspace = await mkdtemp(join(tmpdir(), 'next-66942-'));
let output = '';
let result;

try {
  await writeFile(
    join(workspace, 'package.json'),
    `${JSON.stringify(brokenTemplatePackage, null, 2)}\n`,
  );

  result = await new Promise((resolve) => {
    const child = spawn(
      'npm',
      ['install', '--dry-run', '--ignore-scripts', '--package-lock=false'],
      {
        cwd: workspace,
        env: { ...process.env, npm_config_fund: 'false', npm_config_audit: 'false' },
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: 90_000,
      },
    );

    child.stdout.on('data', (chunk) => { output += chunk; });
    child.stderr.on('data', (chunk) => { output += chunk; });
    child.on('error', (error) => resolve({ code: null, error }));
    child.on('close', (code, signal) => resolve({ code, signal }));
  });

  const hasReportedSymptom =
    result.code !== 0 &&
    /ERESOLVE unable to resolve dependency tree/i.test(output) &&
    /While resolving:\s*undefined@undefined/i.test(output);

  if (hasReportedSymptom) {
    console.log('Reproduced: npm install failed with ERESOLVE while resolving undefined@undefined.');
    process.exitCode = 0;
  } else if (result.code === 0) {
    console.log('Not reproduced: npm resolved the template dependency tree successfully.');
    process.exitCode = 1;
  } else {
    console.error(`Check failed before a conclusive result (code=${result.code}, signal=${result.signal ?? 'none'}).`);
    if (result.error) console.error(result.error);
    console.error(output.slice(-4000));
    process.exitCode = 2;
  }
} catch (error) {
  console.error('Check failed:', error);
  process.exitCode = 2;
}

await rm(workspace, { recursive: true, force: true });
