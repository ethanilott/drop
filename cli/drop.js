#!/usr/bin/env node
import { S3Client, PutObjectCommand, GetObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { createReadStream, createWriteStream, statSync } from 'node:fs';
import { basename } from 'node:path';
import { pipeline } from 'node:stream/promises';

const USAGE = `usage:
  drop push <file...>   upload files
  drop pull [name]      download a file (newest if no name)
  drop ls               list files`;

const Bucket = process.env.DROP_BUCKET;
if (!Bucket) {
  console.error('DROP_BUCKET is not set. Set it to the BucketName output from `npm run deploy`.');
  process.exit(1);
}

const s3 = new S3Client({});

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

const commands = { push, pull, ls };
const [cmd, ...args] = process.argv.slice(2);

if (!commands[cmd]) {
  console.error(USAGE);
  process.exit(1);
}

commands[cmd](cmd === 'push' ? args : args[0]).catch((err) => {
  console.error(err.message);
  process.exitCode = 1;
});
