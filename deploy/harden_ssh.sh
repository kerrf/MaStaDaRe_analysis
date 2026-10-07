#!/usr/bin/env bash
#
# Once, on the server, as root, in the repo folder (DEPLOY.md §14):
#
#   cd /opt/mastr && bash deploy/harden_ssh.sh
#
# SSH then lets in keys only, no passwords – the passwords are what bots guess at all day. root keeps logging in, with
# a key (the pipeline's deploy and you). Before it changes anything it checks that the login it runs in came in with a
# key, so you can't lock yourself out; afterwards it shows what the server offers to the internet.
#
# Undo:  rm /etc/ssh/sshd_config.d/00-mastr.conf && systemctl reload ssh

set -Eeuo pipefail

DROPIN=/etc/ssh/sshd_config.d/00-mastr.conf

step() { printf '\n\033[1;34m==> %s\033[0m\n' "$*"; }
info() { printf '    %s\n' "$*"; }
die() {
  printf '\n\033[1;31mStopped: %s\033[0m\n' "$*" >&2
  exit 1
}

reload_ssh() { systemctl reload ssh 2> /dev/null || systemctl reload sshd; }

# The sshd processes above this shell (also through sudo): the one that let this login in noted how, under its id
session_pids() {
  local pid=$$ comm
  while ((pid > 1)); do
    comm=$(cat "/proc/$pid/comm" 2> /dev/null) || return 0
    [[ $comm == sshd || $comm == sshd-session ]] && echo "$pid"
    pid=$(sed -E 's/^.*\) [A-Za-z] ([0-9]+) .*/\1/' "/proc/$pid/stat" 2> /dev/null) || return 0
  done
}

# How this login came in: sshd notes "Accepted publickey for root from …" (or password) in the system log
login_method() {
  local pids
  pids=$(session_pids | paste -sd '|')
  [[ -n $pids ]] || return 0
  {
    journalctl --quiet --no-pager --output short -t sshd -t sshd-session --since '-30 days' 2> /dev/null || true
    cat /var/log/auth.log 2> /dev/null || true
  } | grep -E "sshd(-session)?\[($pids)\]: Accepted " | tail -n 1 | sed -E 's/.*Accepted ([a-z-]+) for .*/\1/' || true
}

main() {
  [[ $EUID == 0 ]] || die "run it as root: sudo bash deploy/harden_ssh.sh"
  command -v sshd > /dev/null || die "there is no sshd on this machine"

  step "How you are logged in"
  local method
  method=$(login_method)
  case $method in
    publickey)
      info "with a key: you keep getting in"
      ;;
    password | keyboard-interactive)
      die "with a password. Set up your key first (DEPLOY.md §14: ssh-copy-id on your computer), log in again with it – it no longer asks for the password – and run this again"
      ;;
    *)
      info "couldn't tell (the system log doesn't say)."
      info "Log in from a second window now. Did it let you in WITHOUT asking for a password?"
      local answer
      read -r -p "    Type yes if so: " answer
      [[ $answer == yes ]] || die "nothing changed. Set up your key first (DEPLOY.md §14)"
      ;;
  esac

  step "Keys that may log in"
  local file
  for file in /root/.ssh/authorized_keys /home/*/.ssh/authorized_keys; do
    [[ -s $file ]] || continue
    info "$file:"
    # Type and comment of each key, e.g. "ssh-ed25519 … github-actions"
    awk '!/^[[:space:]]*(#|$)/ { print "      " $1 " … " $NF }' "$file"
  done

  step "SSH: keys only"
  # The name of the "no keyboard-interactive" setting changed with OpenSSH 8.7; this sshd's own is the one it lists
  local kbd=ChallengeResponseAuthentication
  sshd -T 2> /dev/null | grep -q '^kbdinteractiveauthentication ' && kbd=KbdInteractiveAuthentication
  # sshd takes the first value it reads of each setting, and reads the files in sshd_config.d before the rest (in name
  # order): "00-" comes before e.g. a cloud image's "50-cloud-init.conf", which turns passwords on
  cat > "$DROPIN" << EOF
# deploy/harden_ssh.sh: keys only, no passwords. Undo: delete this file, then systemctl reload ssh
PasswordAuthentication no
$kbd no
PermitRootLogin prohibit-password
EOF
  if ! sshd -t; then
    rm -f "$DROPIN"
    die "sshd refused the settings (see above); nothing changed"
  fi
  reload_ssh
  # What sshd uses now. If its main config doesn't read sshd_config.d first, passwords would still work: go back
  if ! sshd -T | grep -qx 'passwordauthentication no'; then
    rm -f "$DROPIN"
    reload_ssh
    die "sshd still takes passwords: its config doesn't read $DROPIN first (Include at the top of /etc/ssh/sshd_config). Nothing changed"
  fi
  info "passwords: off · root: only with a key · logins that are open now stay open"

  step "What the server offers to the internet"
  # Listening on more than this machine: expected are 22 (ssh) and 80, 443 (Caddy through Docker); the database listens
  # on 127.0.0.1 only (compose.yml)
  ss -tlnpH | awk '$4 !~ /^(127\.|\[::1\]|\[::ffff:127\.)/ { sub(/^users:\(\("/, "", $6); sub(/".*/, "", $6); print "      " $4 "  " $6 }' | sort -u

  step "Done. Keep this window open and log in from a second one"
  info "It works: you're in, and done."
  info "It doesn't: undo it here with"
  info "  rm $DROPIN && systemctl reload ssh"
  info "Window closed and locked out: netcup's Server Control Panel → your server → the console (it isn't SSH), log in"
  info "as root with your password and undo it there."
}

main
