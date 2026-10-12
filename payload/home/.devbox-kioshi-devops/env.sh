# PATH/toolchains compartilhados entre o shell interativo e o servico claude-rc
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
[ -f "$HOME/.local/bin/env" ] && . "$HOME/.local/bin/env"
export PYENV_ROOT="$HOME/.pyenv"
[[ -d $PYENV_ROOT/bin ]] && export PATH="$PYENV_ROOT/bin:$PATH"
command -v pyenv >/dev/null && eval "$(pyenv init - "$(basename "${SHELL:-bash}")")"
export PATH="$HOME/.local/bin:$PATH"
