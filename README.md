# devbox-kioshi-devops

EC2 `t4g.medium` (Ubuntu 26.04 ARM, us-west-2) com o mesmo ambiente do desktop e
Claude Code em **Remote Control**, para usar pelo app Claude no celular ou por claude.ai/code em outro notebook.

## O que é criado (`template.yaml`)
- VPC própria com subnet pública e Security Group **sem nenhuma porta de entrada** (shell só via SSM).
- Instance role com `AmazonSSMManagedInstanceCore` + `AdministratorAccess` (parâmetro `InstanceRolePolicyArn`).
  Sem chaves estáticas na máquina: AWS CLI/CDK/Terraform usam a role.
- Bucket S3 `devbox-kioshi-devops-<conta>-<região>` com `bootstrap.sh` e o payload de dotfiles.
- EBS gp3 50 GiB criptografado, IMDSv2 obrigatório.

## Comandos (no desktop)
```bash
./devbox-kioshi-devops deploy    # cria/atualiza stack + envia bootstrap e dotfiles
./devbox-kioshi-devops logs      # acompanha o bootstrap (~15-20 min no primeiro boot)
./devbox-kioshi-devops shell     # shell como ubuntu via SSM
./devbox-kioshi-devops start | stop | status
./devbox-kioshi-devops sync      # reenvia dotfiles (zshrc, p10k, settings/skills do Claude) para a instância
./devbox-kioshi-devops destroy
```
Usa o profile `Kioshi-DevOps` e `us-west-2` (sobrescreva com `DEVBOX_PROFILE` / `DEVBOX_REGION`).

## Setup único (depois do bootstrap)
```bash
./devbox-kioshi-devops shell
devbox-kioshi-devops-setup-auth   # gh login (device code), clona repos de ~/.devbox-kioshi-devops/repos.txt, aws-mcp, /login no Claude
```

## Uso fora de casa
1. Ligue a instância pelo app **AWS Console** no celular (EC2 → `devbox-kioshi-devops` → Start).
2. Em ~1 min o serviço `claude-rc` sobe `claude remote-control` em `~/github`.
3. Abra o app Claude → Code (ou claude.ai/code): a sessão **devbox-kioshi-devops** aparece na lista.
4. Ao terminar, **pare a instância** (Stop). Parada custa só o EBS (~US$4/mês); ligada ~US$0,067/h.

Ajustes do Remote Control (nome, pasta, modo de permissão) ficam em `~/.devbox-kioshi-devops/rc.env` na instância;
depois `sudo systemctl restart claude-rc`. Ver o processo: `tmux attach -t claude-rc`.
