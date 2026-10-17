# devbox-kioshi-devops

Uma EC2 `t4g.medium` (Ubuntu 26.04 ARM, us-west-2) **por projeto**, com o mesmo ambiente do desktop e
Claude Code em **Remote Control**, para usar pelo app Claude no celular ou por claude.ai/code em outro notebook.
Infra em **AWS CDK (TypeScript)**.

## Projetos (`projects.json`)
Cada projeto vira uma stack `devbox-kioshi-devops-<nome>` com instância, disco, role e logins próprios.
Campos opcionais por projeto sobrescrevem `defaults`:

| Campo | Default | |
|---|---|---|
| `instanceType` | `t4g.medium` | precisa ser Graviton (arm64) |
| `volumeGiB` | `50` | |
| `managedPolicy` | `AdministratorAccess` | ou `PowerUserAccess` / `ReadOnlyAccess`: permissão AWS do Claude na instância |
| `ubuntuAmi` | AMI fixa em `us-west-2` | Ubuntu 26.04 arm64 por região (ver abaixo) |
| `repos` | — | `{ "repo": "Org/nome", "dir": "~/..." }`, clonados pelo setup-auth |
| `rcDir` | `dir` do 1º repo | pasta onde o Remote Control abre |

Renomear um projeto já criado gera uma stack (e instância) nova; a antiga continua até o `destroy`.

## O que é criado (`bin/devbox.ts` + `lib/`)
`bin/devbox.ts` cria a stack compartilhada e uma stack por projeto de `projects.json` (validado em `lib/config.ts`).
- `devbox-kioshi-devops-shared` (`lib/shared-stack.ts`): VPC própria com uma subnet pública em `<região>a`, Security Group
  **sem nenhuma porta de entrada** (shell só via SSM) e bucket S3 com `bootstrap.sh` e os payloads de dotfiles
  (`projects/<nome>/payload.tar.gz`).
- `devbox-kioshi-devops-<nome>` (`lib/devbox-stack.ts`, inclusive o user-data): instance role com
  `AmazonSSMManagedInstanceCore` + `managedPolicy` (sem chaves estáticas: AWS CLI/CDK/Terraform usam a role),
  EBS gp3 criptografado, IMDSv2 obrigatório, tag `devbox:project`.
- O CloudFormation gerado (equivalente ao antigo `template.yaml`) fica em `cdk.out/<stack>.template.json`
  depois de um `diff` ou `deploy`.
- A AMI do Ubuntu fica **fixada em `projects.json`** (`ubuntuAmi`). Se fosse resolvida a cada deploy, uma AMI nova
  **substituiria a instância, apagando o disco**. Trocar a AMI em `defaults` substitui, no próximo deploy, as instâncias
  dos projetos que não a sobrescrevem; para atualizar pacotes use `apt upgrade` dentro da instância. AMI mais recente:
  `aws ssm get-parameter --name /aws/service/canonical/ubuntu/server/26.04/stable/current/arm64/hvm/ebs-gp3/ami-id --query Parameter.Value --output text`

## Comandos (no desktop)
```bash
./devbox-kioshi-devops deploy <projeto>    # cria/atualiza shared + devbox do projeto e envia bootstrap e dotfiles
./devbox-kioshi-devops diff <projeto>      # o que o deploy vai mudar ("requires replacement" na Instance = disco apagado)
./devbox-kioshi-devops logs <projeto>      # acompanha o bootstrap (~15-20 min no primeiro boot)
./devbox-kioshi-devops shell <projeto>     # shell como ubuntu via SSM
./devbox-kioshi-devops start | stop <projeto>
./devbox-kioshi-devops status [projeto]    # sem projeto: todas as devboxes
./devbox-kioshi-devops sync <projeto>      # reenvia dotfiles (zshrc, p10k, settings/skills do Claude, rc.env, repos)
./devbox-kioshi-devops destroy <projeto>   # apaga a devbox e o disco
./devbox-kioshi-devops destroy shared      # apaga VPC e bucket (só depois de destruir todas as devboxes)
npm test                                   # testes da infra: AMI fixa, logical ID da instância, IMDSv2, SG sem ingress
```
Usa o profile `Kioshi-DevOps` e `us-west-2` (sobrescreva com `DEVBOX_PROFILE` / `DEVBOX_REGION`; outra região
precisa de uma entrada em `ubuntuAmi` e de `cdk bootstrap`). O CLI roda `npm ci` se faltar `node_modules` e usa o CDK fixado no `package.json` (`npx cdk`).

Mudar o user-data em `lib/devbox-stack.ts` faz o próximo deploy **parar e religar** a instância (não substitui).
Mudanças em `bootstrap.sh` só valem para instâncias novas.

## Adicionar um projeto
1. Acrescente o projeto em `projects.json`.
2. `./devbox-kioshi-devops deploy <projeto>`, acompanhe com `logs` e faça o setup único abaixo.

## Setup único (depois do bootstrap de cada projeto)
```bash
./devbox-kioshi-devops shell <projeto>
devbox-kioshi-devops-setup-auth   # gh login (device code), clona os repos do projeto, aws-mcp, /login no Claude
```

## Uso fora de casa
1. Ligue a instância pelo app **AWS Console** no celular (EC2 → `devbox-kioshi-devops-<projeto>` → Start).
2. Em ~1 min o serviço `claude-rc` sobe `claude remote-control` na pasta do projeto.
3. Abra o app Claude → Code (ou claude.ai/code): a sessão **devbox-kioshi-devops-&lt;projeto&gt;** aparece na lista.
4. Ao terminar, **pare a instância** (Stop). Parada custa só o EBS (~US$4/mês por projeto); ligada ~US$0,067/h.

Ajustes do Remote Control (modo de spawn, modo de permissão) ficam em `~/.devbox-kioshi-devops/rc.env` na instância
(o `sync` sobrescreve esse arquivo); depois `sudo systemctl restart claude-rc`. Ver o processo: `tmux attach -t claude-rc`.
