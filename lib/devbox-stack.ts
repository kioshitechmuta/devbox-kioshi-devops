import { CfnOutput, Stack, StackProps, Tags } from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';
import { Project } from './config';
import { SharedStack } from './shared-stack';

export const PROJECT_TAG = 'devbox:project';

export interface DevboxStackProps extends StackProps {
  readonly prefix: string;
  readonly project: Project;
  readonly shared: SharedStack;
}

// Uma devbox por projeto: EC2 t4g Ubuntu ARM com Claude Code Remote Control (acesso apenas via SSM).
export class DevboxStack extends Stack {
  constructor(scope: Construct, id: string, props: DevboxStackProps) {
    super(scope, id, props);
    const { prefix, project, shared } = props;
    const name = `${prefix}-${project.name}`;
    const payloadKey = `projects/${project.name}/payload.tar.gz`;
    Tags.of(this).add(PROJECT_TAG, project.name);

    // Sem chaves estaticas na maquina: AWS CLI/CDK/Terraform usam a role.
    const role = new iam.Role(this, 'InstanceRole', {
      assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonSSMManagedInstanceCore'),
        iam.ManagedPolicy.fromAwsManagedPolicyName(project.managedPolicy),
      ],
    });
    shared.bucket.grantRead(role, 'bootstrap.sh');
    shared.bucket.grantRead(role, payloadKey);

    const bucket = shared.bucket.bucketName;
    const region = this.region;
    const userData = ec2.UserData.forLinux();
    userData.addCommands(`# Espera o script local enviar bootstrap.sh + payload do projeto para o S3 e executa o bootstrap uma unica vez.
set -eux
exec > >(tee -a /var/log/devbox-kioshi-devops-userdata.log) 2>&1
[ -f /var/lib/devbox-kioshi-devops/bootstrapped ] && exit 0
apt-get update && apt-get install -y unzip curl
if ! command -v aws >/dev/null; then
  curl -fsSL https://awscli.amazonaws.com/awscli-exe-linux-aarch64.zip -o /tmp/awscli.zip
  unzip -q /tmp/awscli.zip -d /tmp && /tmp/aws/install --update
fi
for i in $(seq 1 120); do
  aws s3 ls s3://${bucket}/${payloadKey} --region ${region} \\
    && aws s3 cp s3://${bucket}/bootstrap.sh /root/bootstrap.sh --region ${region} && break
  sleep 10
done
DEVBOX_BUCKET=${bucket} DEVBOX_REGION=${region} DEVBOX_PROJECT=${project.name} DEVBOX_NAME=${name} bash /root/bootstrap.sh`);

    const instance = new ec2.Instance(this, 'Instance', {
      instanceName: name,
      vpc: shared.vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
      securityGroup: shared.securityGroup,
      instanceType: new ec2.InstanceType(project.instanceType),
      // AMI fixada em projects.json. Resolvida via SSM a cada deploy, uma AMI nova do Ubuntu
      // SUBSTITUIRIA a instancia (o disco tem DeleteOnTermination: perde home, repos e logins).
      machineImage: ec2.MachineImage.genericLinux(project.ubuntuAmi),
      role,
      userData,
      creditSpecification: ec2.CpuCredits.UNLIMITED,
      httpTokens: ec2.HttpTokens.REQUIRED,
      httpPutResponseHopLimit: 2,
      blockDevices: [
        {
          deviceName: '/dev/sda1',
          volume: ec2.BlockDeviceVolume.ebs(project.volumeGiB, {
            volumeType: ec2.EbsDeviceVolumeType.GP3,
            encrypted: true,
            deleteOnTermination: true,
          }),
        },
      ],
    });

    new CfnOutput(this, 'InstanceId', { value: instance.instanceId });
    new CfnOutput(this, 'InstanceRoleArn', { value: role.roleArn });
  }
}
