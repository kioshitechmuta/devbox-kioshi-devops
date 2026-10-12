# .zshrc da devbox-kioshi-devops (derivado do desktop)
if [[ -r "${XDG_CACHE_HOME:-$HOME/.cache}/p10k-instant-prompt-${(%):-%n}.zsh" ]]; then
  source "${XDG_CACHE_HOME:-$HOME/.cache}/p10k-instant-prompt-${(%):-%n}.zsh"
fi
export ZSH="$HOME/.oh-my-zsh"
ZSH_THEME="powerlevel10k/powerlevel10k"
plugins=(git)
source $ZSH/oh-my-zsh.sh
[[ ! -f ~/.p10k.zsh ]] || source ~/.p10k.zsh

alias ll='ls -alF'
alias gs='git status'
alias gl='git log --oneline --graph -15'
alias gp='git pull'
alias dcu='docker compose up -d'
alias dcd='docker compose down'
alias dcl='docker compose logs -f'
alias proj='cd ~/github'
alias bat='batcat'
alias fd='fdfind'
alias awsid='aws sts get-caller-identity'
alias rc='tmux attach -t claude-rc'
export EDITOR='vim'
export AWS_PAGER=""

source "$HOME/.devbox-kioshi-devops/env.sh"
[ -s "$NVM_DIR/bash_completion" ] && \. "$NVM_DIR/bash_completion"
eval "$(direnv hook zsh)"
