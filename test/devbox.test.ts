import { strict as assert } from 'node:assert';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { App } from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { loadConfig, Project } from '../lib/config';
import { DevboxStack } from '../lib/devbox-stack';
import { SharedStack } from '../lib/shared-stack';

const env = { account: '111111111111', region: 'us-west-2' };
const PINNED_AMI = 'ami-0123456789abcdef0';
const project: Project = {
  name: 'demo',
  instanceType: 't4g.medium',
  volumeGiB: 50,
  managedPolicy: 'AdministratorAccess',
  ubuntuAmi: { 'us-west-2': PINNED_AMI },
};

function synth() {
  // Mesmas feature flags do cdk.json.
  const flags = JSON.parse(readFileSync(path.join(__dirname, '..', 'cdk.json'), 'utf8')).context;
  const app = new App({ context: flags });
  const shared = new SharedStack(app, 'devbox-shared', { env });
  const devbox = new DevboxStack(app, 'devbox-demo', { env, prefix: 'devbox', project, shared });
  return { app, shared: Template.fromStack(shared), devbox: Template.fromStack(devbox) };
}

function writeConfig(projects: object[]): string {
  const file = path.join(mkdtempSync(path.join(tmpdir(), 'devbox-test-')), 'projects.json');
  const defaults = { instanceType: 't4g.medium', volumeGiB: 50, managedPolicy: 'AdministratorAccess', ubuntuAmi: { 'us-west-2': PINNED_AMI } };
  writeFileSync(file, JSON.stringify({ prefix: 'devbox', defaults, projects }));
  return file;
}

test('projects.json do repo e valido', () => {
  assert.ok(loadConfig().projects.length > 0);
});

test('AMI vem do projects.json, nao e resolvida a cada deploy', () => {
  const { devbox } = synth();
  devbox.hasResourceProperties('AWS::EC2::Instance', { ImageId: PINNED_AMI });
  assert.deepEqual(Object.keys(devbox.toJSON().Parameters ?? {}), ['BootstrapVersion']);
});

test('synth nao faz lookups na conta (nada vai para o cdk.context.json)', () => {
  const { app } = synth();
  assert.equal(app.synth().manifest.missing, undefined);
});

test('logical ID da instancia e estavel (mudar = substituir a instancia e apagar o disco)', () => {
  const { devbox } = synth();
  assert.deepEqual(Object.keys(devbox.findResources('AWS::EC2::Instance')), ['InstanceC1063A87']);
});

test('instancia com IMDSv2 (hop limit 2 para containers) e disco gp3 criptografado', () => {
  const { devbox } = synth();
  devbox.hasResourceProperties('AWS::EC2::Instance', {
    MetadataOptions: { HttpTokens: 'required', HttpPutResponseHopLimit: 2 },
    BlockDeviceMappings: [{ DeviceName: '/dev/sda1', Ebs: Match.objectLike({ VolumeType: 'gp3', Encrypted: true }) }],
  });
});

test('security group sem nenhuma regra de entrada', () => {
  const { shared } = synth();
  shared.hasResourceProperties('AWS::EC2::SecurityGroup', { SecurityGroupIngress: Match.absent() });
});

test('config rejeita instancia x86, nome reservado/duplicado, policy e AMI invalidas', () => {
  assert.throws(() => loadConfig(writeConfig([{ name: 'a', instanceType: 't3.medium' }])), /Graviton/);
  assert.throws(() => loadConfig(writeConfig([{ name: 'shared' }])), /invalido/);
  assert.throws(() => loadConfig(writeConfig([{ name: 'a' }, { name: 'a' }])), /duplicado/);
  assert.throws(() => loadConfig(writeConfig([{ name: 'a', managedPolicy: 'IAMFullAccess' }])), /managedPolicy/);
  assert.throws(() => loadConfig(writeConfig([{ name: 'a', ubuntuAmi: { 'us-west-2': 'latest' } }])), /ubuntuAmi/);
});
