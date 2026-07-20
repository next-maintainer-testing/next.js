import path from 'node:path';
import { CacheHandler } from '@neshca/cache-handler';

const logPath = path.join(process.cwd(), '.cache-set-keys.log');

const observationHandler = {
  name: 'filesystem-observer',
  async get() {
    return null;
  },
  async set(key) {
    const { appendFile } = await import('node:fs/promises');
    await appendFile(logPath, `${key}\n`);
  },
  async revalidateTag() {},
};

CacheHandler.onCreation(() => ({ handlers: [observationHandler] }));

export default CacheHandler;
