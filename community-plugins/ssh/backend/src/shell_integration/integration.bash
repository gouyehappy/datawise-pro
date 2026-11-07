# DataWise local terminal shell integration (bash).
#
# Same contract as integration.zsh: OSC 133 A/C/D;code, 633;E command line,
# 633;P cwd and OSC 7. Bash has no preexec hooks, so command-start is detected
# with a flag-gated DEBUG trap and command-end from PROMPT_COMMAND; the guard
# flags keep our own bookkeeping from emitting spurious marks. Fail-safe:
# every definition is plain function/trap assignment that cannot abort the rc.
__datawise_si_precmd() {
  local __datawise_ec=$?
  printf '\e]633;D;%s\a' "$__datawise_ec"
  printf '\e]133;D;%s\a' "$__datawise_ec"
  printf '\e]633;A\a'
  printf '\e]133;A\a'
  printf '\e]633;P;Cwd=%s\a' "$PWD"
  printf '\e]7;file://%s%s\a' "${HOSTNAME:-localhost}" "$PWD"
}

__datawise_si_preexec() {
  printf '\e]633;E;%s\a' "$BASH_COMMAND"
  printf '\e]633;C\a'
  printf '\e]133;C\a'
}

__datawise_si_in_command=0
__datawise_si_skip=0

__datawise_si_debug() {
  [ "$__datawise_si_skip" = 1 ] && return
  if [ "$__datawise_si_in_command" = 0 ]; then
    __datawise_si_in_command=1
    __datawise_si_preexec
  fi
}

__datawise_si_wrap_prompt() {
  if [ "$__datawise_si_in_command" = 1 ]; then
    __datawise_si_in_command=0
    __datawise_si_skip=1
    __datawise_si_precmd
    __datawise_si_skip=0
  fi
}

trap '__datawise_si_debug' DEBUG
PROMPT_COMMAND="__datawise_si_wrap_prompt${PROMPT_COMMAND:+;$PROMPT_COMMAND}"

# Initial prompt marks so the first prompt is decorated like every later one.
__datawise_si_skip=1
__datawise_si_precmd
__datawise_si_skip=0
