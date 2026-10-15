import { test } from 'node:test';
import { App } from 'aws-cdk-lib';
import { Template, Match } from 'aws-cdk-lib/assertions';
import { DropStack } from '../infra/stack.js';

const template = Template.fromStack(new DropStack(new App(), 'Test'));

test('bucket blocks all public access', () => {
  template.hasResourceProperties('AWS::S3::Bucket', {
    PublicAccessBlockConfiguration: {
      BlockPublicAcls: true,
      BlockPublicPolicy: true,
      IgnorePublicAcls: true,
      RestrictPublicBuckets: true,
    },
  });
});

test('objects expire after 7 days', () => {
  template.hasResourceProperties('AWS::S3::Bucket', {
    LifecycleConfiguration: { Rules: [Match.objectLike({ ExpirationInDays: 7, Status: 'Enabled' })] },
  });
});

test('bucket rejects non-TLS requests', () => {
  template.hasResourceProperties('AWS::S3::BucketPolicy', {
    PolicyDocument: {
      Statement: Match.arrayWith([
        Match.objectLike({ Effect: 'Deny', Condition: { Bool: { 'aws:SecureTransport': 'false' } } }),
      ]),
    },
  });
});
