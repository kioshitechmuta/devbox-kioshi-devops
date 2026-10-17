#!/usr/bin/env node
import { App } from 'aws-cdk-lib';
import { loadConfig } from '../lib/config';
import { DevboxStack } from '../lib/devbox-stack';
import { SharedStack } from '../lib/shared-stack';

const app = new App();
const config = loadConfig();
// Conta/regiao vem do profile passado pelo ./devbox-kioshi-devops (AWS_REGION=$DEVBOX_REGION).
const env = { account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION };

const shared = new SharedStack(app, `${config.prefix}-shared`, {
  env,
  description: 'devbox-kioshi-devops - VPC, security group e bucket compartilhados pelas devboxes',
});
for (const project of config.projects) {
  new DevboxStack(app, `${config.prefix}-${project.name}`, {
    env,
    prefix: config.prefix,
    project,
    shared,
    description: `devbox-kioshi-devops - devbox do projeto ${project.name} (Claude Code Remote Control, acesso apenas via SSM)`,
  });
}
