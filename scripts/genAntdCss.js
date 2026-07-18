import fs from 'fs';
import path from 'path';
import { createHash } from 'crypto';
import { extractStyle } from '@ant-design/cssinjs';

export function doExtraStyle({ cache, dir = 'antd-output', baseFileName = 'antd.min' }) {
  const baseDir = path.resolve(__dirname, '../../static/css');
  const outputCssPath = path.join(baseDir, dir);
  if (!fs.existsSync(outputCssPath)) {
    fs.mkdirSync(outputCssPath, { recursive: true });
  }

  const css = extractStyle(cache, true);
  if (!css) return '';

  const hash = createHash('md5').update(css).digest('hex');
  const fileName = `${baseFileName}.${hash.substring(0, 8)}.css`;
  const fullPath = path.join(outputCssPath, fileName);
  const publicPath = `_next/static/css/${dir}/${fileName}`;
  if (!fs.existsSync(fullPath)) fs.writeFileSync(fullPath, css);
  return publicPath;
}
