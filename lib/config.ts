import { readFileSync } from 'node:fs';
import * as path from 'node:path';
import * as ec2 from 'aws-cdk-lib/aws-ec2';

// Permissao AWS que o Claude tera de dentro da instancia.
export const MANAGED_POLICIES = ['AdministratorAccess', 'PowerUserAccess', 'ReadOnlyAccess'] as const;
export type ManagedPolicy = (typeof MANAGED_POLICIES)[number];

// So os campos usados pela infra; repos/rcDir sao lidos pelo script local ao montar o payload.
export interface Project {
  readonly name: string;
  readonly instanceType: string;
  readonly volumeGiB: number;
  readonly managedPolicy: ManagedPolicy;
  // AMI Ubuntu 26.04 arm64 por regiao. Fixa de proposito: trocar substitui a instancia (apaga o disco).
  readonly ubuntuAmi: Readonly<Record<string, string>>;
}

export interface DevboxConfig {
  readonly prefix: string;
  readonly projects: readonly Project[];
}

interface RawConfig {
  readonly prefix: string;
  readonly defaults: Omit<Project, 'name'>;
  readonly projects: readonly (Partial<Omit<Project, 'name'>> & { readonly name: string })[];
}

export const DEFAULT_CONFIG_FILE = path.join(__dirname, '..', 'projects.json');

export function loadConfig(file = DEFAULT_CONFIG_FILE): DevboxConfig {
  const raw = JSON.parse(readFileSync(file, 'utf8')) as RawConfig;
  const projects = raw.projects.map((p) => ({ ...raw.defaults, ...p }));
  const names = new Set<string>();
  for (const p of projects) {
    // "shared" e reservado para a stack compartilhada (VPC, SG, bucket).
    if (!/^[a-z0-9][a-z0-9-]*$/.test(p.name) || p.name === 'shared') {
      throw new Error(`Nome de projeto invalido: '${p.name}'`);
    }
    if (names.has(p.name)) throw new Error(`Projeto duplicado: '${p.name}'`);
    names.add(p.name);
    if (!MANAGED_POLICIES.includes(p.managedPolicy)) {
      throw new Error(`${p.name}: managedPolicy deve ser uma de ${MANAGED_POLICIES.join(', ')}`);
    }
    const amis = Object.values(p.ubuntuAmi ?? {});
    if (amis.length === 0 || !amis.every((ami) => /^ami-[0-9a-f]{8,17}$/.test(ami))) {
      throw new Error(`${p.name}: ubuntuAmi deve mapear regiao -> ami-...`);
    }
    // AMI, AWS CLI e Terraform do bootstrap sao arm64.
    if (new ec2.InstanceType(p.instanceType).architecture !== ec2.InstanceArchitecture.ARM_64) {
      throw new Error(`${p.name}: instanceType '${p.instanceType}' precisa ser Graviton (arm64)`);
    }
  }
  return { prefix: raw.prefix, projects };
}
