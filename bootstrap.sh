#!/usr/bin/env bash
# Bootstrap da devbox-kioshi-devops (roda como root no primeiro boot, via user-data).
# Replica o ambiente do desktop: zsh + oh-my-zsh + p10k, nvm/Node, pyenv/Python, uv,
# AWS CLI, gh, Docker, Terraform, CDK, Java e Claude Code com Remote Control.
set -euxo pipefail
exec > >(tee -a /var/log/devbox-kioshi-devops-bootstrap.log) 2>&1

: "${DEVBOX_BUCKET:?}" "${DEVBOX_REGION:?}"
export DEBIAN_FRONTEND=noninteractive
USERNAME=ubuntu
USER_HOME=/home/$USERNAME
NODE_VERSION=24.21.0
PYTHON_VERSION=3.12.15
TERRAFORM_VERSION=1.16.5
NVM_VERSION=0.40.1
NPM_GLOBALS="pnpm@12.10.1 yarn@1.22.22 aws-cdk@2.1145.0 tsx typescript esbuild"

apt_try() { for p in "$@"; do apt-get install -y "$p" || echo "WARN: pacote $p indisponivel"; done; }

# --- Pacotes de sistema ---------------------------------------------------------------
apt-get update
apt-get -y upgrade
apt-get install -y zsh tmux git jq unzip zip curl wget ca-certificates gnupg htop \
  build-essential pkg-config libssl-dev zlib1g-dev libbz2-dev libreadline-dev libsqlite3-dev \
  libncursesw5-dev xz-utils tk-dev libxml2-dev libxmlsec1-dev libffi-dev liblzma-dev \
  ripgrep fd-find bat direnv docker.io
apt_try docker-compose-v2 docker-buildx
apt-get install -y openjdk-17-jdk-headless || apt-get install -y openjdk-21-jdk-headless

# GitHub CLI
mkdir -p -m 755 /etc/apt/keyrings
wget -nv -O /etc/apt/keyrings/githubcli-archive-keyring.gpg https://cli.github.com/packages/githubcli-archive-keyring.gpg
chmod go+r /etc/apt/keyrings/githubcli-archive-keyring.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" \
  > /etc/apt/sources.list.d/github-cli.list
apt-get update && apt-get install -y gh

# Terraform (binario oficial arm64)
curl -fsSL "https://releases.hashicorp.com/terraform/${TERRAFORM_VERSION}/terraform_${TERRAFORM_VERSION}_linux_arm64.zip" -o /tmp/tf.zip
unzip -o -q /tmp/tf.zip -d /usr/local/bin terraform

# AWS CLI v2 (user-data ja instala; garante atualizacao)
curl -fsSL https://awscli.amazonaws.com/awscli-exe-linux-aarch64.zip -o /tmp/awscli.zip
rm -rf /tmp/aws && unzip -q /tmp/awscli.zip -d /tmp && /tmp/aws/install --update

usermod -aG docker "$USERNAME"
chsh -s /usr/bin/zsh "$USERNAME"
systemctl enable --now docker
hostnamectl set-hostname devbox-kioshi-devops

# --- Payload (dotfiles e scripts) enviado pelo desktop ------------------------------------
aws s3 cp "s3://${DEVBOX_BUCKET}/payload.tar.gz" /tmp/payload.tar.gz --region "$DEVBOX_REGION"
mkdir -p /tmp/payload && tar -xzf /tmp/payload.tar.gz -C /tmp/payload

# --- Ambiente do usuario ------------------------------------------------------------------
sudo -u "$USERNAME" -H env NODE_VERSION="$NODE_VERSION" PYTHON_VERSION="$PYTHON_VERSION" \
  NVM_VERSION="$NVM_VERSION" NPM_GLOBALS="$NPM_GLOBALS" DEVBOX_REGION="$DEVBOX_REGION" bash -euxo pipefail <<'USER_SETUP'
cd "$HOME"

# oh-my-zsh + powerlevel10k
[ -d ~/.oh-my-zsh ] || RUNZSH=no CHSH=no KEEP_ZSHRC=yes \
  sh -c "$(curl -fsSL https://raw.githubusercontent.com/ohmyzsh/ohmyzsh/master/tools/install.sh)" "" --unattended
[ -d ~/.oh-my-zsh/custom/themes/powerlevel10k ] || \
  git clone --depth=1 https://github.com/romkatv/powerlevel10k.git ~/.oh-my-zsh/custom/themes/powerlevel10k

# nvm + Node + globais
export NVM_DIR="$HOME/.nvm"
[ -d "$NVM_DIR" ] || curl -fsSL "https://raw.githubusercontent.com/nvm-sh/nvm/v${NVM_VERSION}/install.sh" | PROFILE=/dev/null bash
set +x; . "$NVM_DIR/nvm.sh"
nvm install "$NODE_VERSION" && nvm alias default "$NODE_VERSION"
set -x
npm install -g $NPM_GLOBALS

# pyenv + Python
[ -d ~/.pyenv ] || curl -fsSL https://pyenv.run | bash
export PYENV_ROOT="$HOME/.pyenv" PATH="$HOME/.pyenv/bin:$PATH"
eval "$(pyenv init - bash)"
pyenv install -s "$PYTHON_VERSION" && pyenv global "$PYTHON_VERSION"

# uv
curl -LsSf https://astral.sh/uv/install.sh | sh

# Claude Code (instalador nativo -> ~/.local/bin/claude)
curl -fsSL https://claude.ai/install.sh | bash

# AWS: usa as credenciais da instance role (sem chaves estaticas)
mkdir -p ~/.aws
cat > ~/.aws/config <<EOF
[default]
region = ${DEVBOX_REGION}
output = json
EOF

mkdir -p ~/github ~/.claude
USER_SETUP

# Dotfiles por cima do que os instaladores geraram
cp -a /tmp/payload/home/. "$USER_HOME"/
chown -R "$USERNAME:$USERNAME" "$USER_HOME"
chmod +x "$USER_HOME"/.local/bin/devbox-kioshi-devops-* "$USER_HOME"/.claude/statusline.sh || true

# --- Claude Code Remote Control como servico ----------------------------------------------
cat > /etc/systemd/system/claude-rc.service <<EOF
[Unit]
Description=Claude Code Remote Control (tmux: claude-rc)
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
RemainAfterExit=yes
User=$USERNAME
WorkingDirectory=$USER_HOME
ExecStart=/usr/bin/tmux new-session -d -s claude-rc $USER_HOME/.local/bin/devbox-kioshi-devops-rc-loop
# Ctrl-C primeiro para o claude se desregistrar no servidor; senao o proximo boot fica
# com "already served" ate o registro antigo expirar.
ExecStop=-/usr/bin/tmux send-keys -t claude-rc C-c
ExecStop=/bin/sleep 8
ExecStop=-/usr/bin/tmux kill-session -t claude-rc
TimeoutStopSec=30

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
# Sempre habilitado no boot; o loop espera o login do Claude (devbox-kioshi-devops-setup-auth) antes de iniciar.
systemctl enable --now claude-rc

mkdir -p /var/lib/devbox-kioshi-devops && touch /var/lib/devbox-kioshi-devops/bootstrapped
echo "DEVBOX BOOTSTRAP OK"
