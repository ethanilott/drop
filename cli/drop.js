#!/usr/bin/env node
import { S3Client, PutObjectCommand, GetObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { createReadStream, createWriteStream, statSync } from 'node:fs';
import { basename } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { execFileSync } from 'node:child_process';

const USAGE = `usage:
  drop push <file...>   upload files
  drop pull [name]      download a file (newest if no name)
  drop ls               list files
  drop clip             upload clipboard text
  drop paste            copy uploaded text to clipboard`;

const Bucket = process.env.DROP_BUCKET;
if (!Bucket) {
  console.error('DROP_BUCKET is not set. Set it to the BucketName output from `npm run deploy`.');
  process.exit(1);
}

const s3 = new S3Client({});
const CLIP_KEY = 'clip.txt';

// PowerShell pipes default to the OEM code page, so switch to UTF-8 (no BOM) to keep non-ASCII text intact
const ps = (script) => ['powershell', ['-NoProfile', '-Command',
  `$e = [Text.UTF8Encoding]::new($false); [Console]::InputEncoding = $e; [Console]::OutputEncoding = $e; ${script}`]];
const clipboard = {
  win32: {
    read: ps('[Console]::Out.Write((Get-Clipboard -Raw))'),
    write: ps('Set-Clipboard -Value ([Console]::In.ReadToEnd())'),
  },
  darwin: { read: ['pbpaste', []], write: ['pbcopy', []] },
  linux: {
    read: ['xclip', ['-o', '-selection', 'clipboard']],
    write: ['xclip', ['-selection', 'clipboard']],
  },
}[process.platform];

async function listFiles() {
  const { Contents = [] } = await s3.send(new ListObjectsV2Command({ Bucket, Prefix: 'files/' }));
  return Contents.sort((a, b) => b.LastModified - a.LastModified);
}

async function push(paths) {
  if (!paths.length) throw new Error('push needs at least one file');
  for (const path of paths) {
    const name = basename(path);
    // single PutObject caps files at 5 GB, switch to @aws-sdk/lib-storage Upload if that's ever hit
    await s3.send(new PutObjectCommand({
      Bucket,
      Key: `files/${name}`,
      Body: createReadStream(path),
      ContentLength: statSync(path).size,
    }));
    console.log(`pushed ${name}`);
  }
}

async function pull(name) {
  if (!name) {
    const [newest] = await listFiles();
    if (!newest) throw new Error('nothing to pull');
    name = newest.Key.slice('files/'.length);
  }
  const { Body } = await s3.send(new GetObjectCommand({ Bucket, Key: `files/${name}` }));
  // 'wx' refuses to overwrite a local file with the same name
  await pipeline(Body, createWriteStream(name, { flags: 'wx' }));
  console.log(`pulled ${name}`);
}

async function ls() {
  for (const { Key, Size, LastModified } of await listFiles()) {
    const kb = (Size / 1024).toFixed(1).padStart(10);
    console.log(`${kb} KB  ${LastModified.toLocaleString()}  ${Key.slice('files/'.length)}`);
  }
}

async function clip() {
  const text = execFileSync(...clipboard.read, { encoding: 'utf8' });
  if (!text) throw new Error('clipboard is empty');
  await s3.send(new PutObjectCommand({ Bucket, Key: CLIP_KEY, Body: text, ContentType: 'text/plain; charset=utf-8' }));
  console.log(`uploaded ${text.length} chars`);
}

async function paste() {
  const { Body } = await s3.send(new GetObjectCommand({ Bucket, Key: CLIP_KEY }));
  const text = await Body.transformToString();
  execFileSync(...clipboard.write, { input: text });
  console.log(`copied ${text.length} chars to clipboard`);
}

const commands = { push, pull, ls, clip, paste };
const [cmd, ...args] = process.argv.slice(2);

if (!commands[cmd]) {
  console.error(USAGE);
  process.exit(1);
}
if ((cmd === 'clip' || cmd === 'paste') && !clipboard) {
  console.error(`clipboard is not supported on ${process.platform}`);
  process.exit(1);
}

commands[cmd](cmd === 'push' ? args : args[0]).catch((err) => {
  console.error(err.message);
  process.exitCode = 1;
});
