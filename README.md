# drop

A CLI for moving files and clipboard text between machines through an S3 bucket.

## How it works

- `infra/` is an AWS CDK stack with one S3 bucket. Public access is blocked, objects are encrypted with S3-managed keys, non-TLS requests are rejected, and objects expire after 7 days.
- `cli/drop.js` reads and writes the bucket directly with the AWS SDK, using the local AWS credentials. There is no server.
- Clipboard access uses OS tools: PowerShell on Windows, `pbcopy`/`pbpaste` on macOS, `xclip` on Linux.

## Setup

Needs Node 20+ and AWS credentials (`aws configure`). Every machine must use the same region as the bucket.

```sh
npm install
npx cdk bootstrap   # once per account/region
npm run deploy      # prints the BucketName output
npm link            # puts `drop` on your PATH
```

On other machines, run only `npm install` and `npm link`.

Set the bucket name on each machine:

```sh
setx DROP_BUCKET <BucketName>     # Windows, then open a new terminal
export DROP_BUCKET=<BucketName>   # macOS/Linux
```

## Usage

```sh
drop push <file...>   # upload files
drop ls               # list files
drop pull [name]      # download a file, the newest if no name is given
drop clip             # upload clipboard text
drop paste            # copy the uploaded text to the clipboard
```

`pull` won't overwrite an existing local file. Pushing a file with an existing name replaces it.

## Tests

```sh
npm test                # CDK assertion tests
npx cdk synth --quiet   # check the stack synthesizes
```

## Limits

- Files over 5 GB need a multipart upload, which the CLI doesn't do.
- Folders aren't supported; zip them first.
