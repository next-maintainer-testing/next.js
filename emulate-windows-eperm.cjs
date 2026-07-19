const fs = require('node:fs');
const path = require('node:path');

function isAffectedStandaloneNext(target) {
  const normalized = path.resolve(String(target)).replaceAll('\\', '/');
  return /\/\.next\/standalone\/(?:.*\/)?node_modules\/next\/?$/i.test(normalized);
}

function eperm(target) {
  const error = new Error(`EPERM: operation not permitted, scandir '${target}'`);
  error.errno = -4048;
  error.code = 'EPERM';
  error.syscall = 'scandir';
  error.path = String(target);
  return error;
}

const originalReaddir = fs.readdir;
fs.readdir = function patchedReaddir(target, options, callback) {
  if (!isAffectedStandaloneNext(target)) {
    return originalReaddir.apply(this, arguments);
  }
  const done = typeof options === 'function' ? options : callback;
  process.nextTick(() => done(eperm(target)));
};

const originalReaddirSync = fs.readdirSync;
fs.readdirSync = function patchedReaddirSync(target) {
  if (isAffectedStandaloneNext(target)) throw eperm(target);
  return originalReaddirSync.apply(this, arguments);
};

const originalPromisesReaddir = fs.promises.readdir.bind(fs.promises);
fs.promises.readdir = async function patchedPromisesReaddir(target, options) {
  if (isAffectedStandaloneNext(target)) throw eperm(target);
  return originalPromisesReaddir(target, options);
};
