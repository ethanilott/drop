import { Stack, Duration, CfnOutput } from 'aws-cdk-lib';
import { Bucket, BlockPublicAccess, BucketEncryption } from 'aws-cdk-lib/aws-s3';

export class DropStack extends Stack {
  constructor(scope, id, props) {
    super(scope, id, props);

    const bucket = new Bucket(this, 'Bucket', {
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      encryption: BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      // objects are in transit between machines, not stored, so they expire
      lifecycleRules: [{ expiration: Duration.days(7) }],
    });

    new CfnOutput(this, 'BucketName', { value: bucket.bucketName });
  }
}
