import { CfnOutput, RemovalPolicy, Stack, StackProps } from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';

// Rede e bucket compartilhados por todas as devboxes.
export class SharedStack extends Stack {
  readonly vpc: ec2.Vpc;
  readonly securityGroup: ec2.SecurityGroup;
  readonly bucket: s3.Bucket;

  constructor(scope: Construct, id: string, props: StackProps) {
    super(scope, id, props);

    // Uma subnet publica, sem NAT.
    this.vpc = new ec2.Vpc(this, 'Vpc', {
      ipAddresses: ec2.IpAddresses.cidr('10.42.0.0/16'),
      maxAzs: 1,
      natGateways: 0,
      subnetConfiguration: [{ name: 'public', subnetType: ec2.SubnetType.PUBLIC, cidrMask: 24 }],
    });

    // Sem nenhuma regra de entrada: acesso shell apenas via SSM Session Manager.
    this.securityGroup = new ec2.SecurityGroup(this, 'SecurityGroup', {
      vpc: this.vpc,
      description: 'devbox - sem ingress, egress liberado',
      allowAllOutbound: true,
    });

    // Guarda bootstrap.sh e o payload de dotfiles de cada projeto (projects/<nome>/payload.tar.gz).
    this.bucket = new s3.Bucket(this, 'Artifacts', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    new CfnOutput(this, 'BucketName', { value: this.bucket.bucketName });
  }

  // AZ fixa (<regiao>a) em vez de lookup na conta: o synth nao depende de cdk.context.json (que leva o account ID).
  override get availabilityZones(): string[] {
    return [`${this.region}a`];
  }
}
