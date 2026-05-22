#!/usr/bin/env bash
# Etienne developer installer (macOS + Linux)
#
# Bootstrap one-liner:
#   curl -fsSL https://raw.githubusercontent.com/bullorosso/etienne/master/scripts/install.sh | bash -s -- ~/etienne
#
# Usage:
#   ./install.sh                   # prompts for install dir
#   ./install.sh ~/dev/etienne     # non-interactive install dir
#   SKIP_START=1 ./install.sh ...  # install only, do not launch services

set -euo pipefail

REPO_URL="${REPO_URL:-https://github.com/bullorosso/etienne.git}"
INSTALL_DIR="${1:-}"
SKIP_START="${SKIP_START:-0}"

# name|kind|start_cmd|port|wave
SERVICES=(
    "oauth-server|node|npm run dev|5950|1"
    "rdf-store|node|npm run dev|7000|1"
    "vector-store|python|uv run python multi-tenant-chromadb.py|7100|1"
    "knowledge-graph|node|npm run start:dev|3000|2"
    "webserver|python|uv run python app.py|4000|2"
    "backend|node|npm run dev|6060|2"
    "frontend|node|npm run dev|5000|3"
)
ALL_PORTS=(3000 4000 5000 5950 6060 7000 7100)

C_CYAN=$'\033[36m'
C_GREEN=$'\033[32m'
C_YELLOW=$'\033[33m'
C_RED=$'\033[31m'
C_RESET=$'\033[0m'

step() { printf '\n%s==> %s%s\n' "$C_CYAN" "$1" "$C_RESET"; }
ok()   { printf '    %s%s%s\n'     "$C_GREEN" "$1" "$C_RESET"; }
warn() { printf '    %s%s%s\n'     "$C_YELLOW" "$1" "$C_RESET"; }
err()  { printf '    %s%s%s\n'     "$C_RED" "$1" "$C_RESET" >&2; }
die()  { err "$1"; exit 1; }
have() { command -v "$1" >/dev/null 2>&1; }

os_kind() {
    case "$(uname -s)" in
        Darwin) echo macos ;;
        Linux)  echo linux ;;
        *)      echo unknown ;;
    esac
}

resolve_install_dir() {
    if [[ -z "$INSTALL_DIR" ]]; then
        local default="$HOME/etienne"
        read -r -p "Install directory [$default]: " answer
        INSTALL_DIR="${answer:-$default}"
    fi
    # Expand ~ and resolve to absolute path. If the parent doesn't exist yet,
    # leave the path as-is — git clone will create it.
    INSTALL_DIR="${INSTALL_DIR/#\~/$HOME}"
    case "$INSTALL_DIR" in
        /*) ;;                            # already absolute
        *)  INSTALL_DIR="$PWD/$INSTALL_DIR" ;;
    esac
    parent_abs="$(cd "$(dirname "$INSTALL_DIR")" 2>/dev/null && pwd || true)"
    if [[ -n "$parent_abs" ]]; then
        INSTALL_DIR="$parent_abs/$(basename "$INSTALL_DIR")"
    fi
    if [[ -e "$INSTALL_DIR" ]] && [[ -n "$(ls -A "$INSTALL_DIR" 2>/dev/null || true)" ]]; then
        die "Install directory '$INSTALL_DIR' exists and is not empty. Pick another path or remove it."
    fi
}

require_git() {
    step 'Checking git'
    have git || die "git is not installed. Install it and re-run."
    ok "$(git --version)"
}

ensure_node22() {
    step 'Checking Node.js 22'
    if have node; then
        local v
        v="$(node -v | sed 's/^v//')"
        if [[ "$v" == 22.* ]]; then
            ok "Node $v already installed"
            return
        fi
        warn "Node $v found, but version 22 is required"
    fi
    case "$(os_kind)" in
        macos)
            have brew || die "Homebrew is required to install Node 22 on macOS. Install from https://brew.sh and re-run."
            ok 'Installing Node 22 via Homebrew'
            brew install node@22
            brew link --overwrite --force node@22
            ;;
        linux)
            have curl || die "curl is required to install Node 22."
            ok 'Installing Node 22 via NodeSource'
            curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
            sudo apt-get install -y nodejs
            ;;
        *)
            die "Unsupported OS. Install Node 22 manually and re-run."
            ;;
    esac
    have node || die "Node was installed but is not on PATH. Open a new shell and re-run."
    ok "Installed Node $(node -v)"
}

ensure_uv() {
    step 'Checking uv'
    if have uv; then
        ok "$(uv --version)"
        return
    fi
    ok 'Installing uv'
    curl -LsSf https://astral.sh/uv/install.sh | sh
    # uv installs to ~/.local/bin (Linux) or ~/.cargo/bin on some configs; both are added to PATH by the installer
    # but the current shell needs help.
    export PATH="$HOME/.local/bin:$HOME/.cargo/bin:$PATH"
    have uv || die "uv installation finished but 'uv' is not on PATH. Open a new shell and re-run."
}

ensure_python() {
    step 'Installing Python 3.14 (via uv)'
    if ! uv python install 3.14 >/dev/null 2>&1; then
        warn 'Python 3.14 not available via uv yet, falling back to 3.13'
        uv python install 3.13 || die 'uv could not install Python 3.13.'
    fi
    ok 'Python ready'
}

clone_repo() {
    step "Cloning $REPO_URL"
    git clone --depth 1 "$REPO_URL" "$INSTALL_DIR"
    ok "Cloned to $INSTALL_DIR"
}

configure_env() {
    step 'Configuring backend/.env'
    local template="$INSTALL_DIR/backend/.env.template"
    local envfile="$INSTALL_DIR/backend/.env"
    [[ -f "$template" ]] || die "Missing $template"
    cp "$template" "$envfile"

    local api_key=''
    # Read with no echo. If stdin is not a TTY (piped install), warn and leave blank.
    if [[ -t 0 ]]; then
        read -r -s -p "Anthropic API key (input hidden): " api_key
        echo
    else
        warn 'No interactive TTY — ANTHROPIC_API_KEY left blank. Edit backend/.env later.'
    fi
    if [[ -z "$api_key" ]]; then
        warn 'No key entered. Backend will fail Claude calls until you edit backend/.env.'
    fi

    local workspace="$INSTALL_DIR/workspace"
    mkdir -p "$workspace"

    # In-place rewrite of the two lines. Use a different sed delimiter because the key
    # may contain slashes and the path contains slashes too.
    # Escape backslash and pipe in the values to keep sed happy.
    local k_escaped p_escaped
    k_escaped="$(printf '%s' "$api_key" | sed -e 's/[\\&|]/\\&/g')"
    p_escaped="$(printf '%s' "$workspace" | sed -e 's/[\\&|]/\\&/g')"
    # macOS sed needs `-i ''`; GNU sed needs `-i`. Use a portable temp-file rewrite instead.
    local tmp
    tmp="$(mktemp)"
    sed -e "s|^ANTHROPIC_API_KEY=.*|ANTHROPIC_API_KEY=$k_escaped|" \
        -e "s|^WORKSPACE_ROOT=.*|WORKSPACE_ROOT=$p_escaped|" \
        "$envfile" > "$tmp"
    mv "$tmp" "$envfile"
    ok "Wrote $envfile"
    ok "WORKSPACE_ROOT = $workspace"
}

install_services() {
    local entry name kind
    for entry in "${SERVICES[@]}"; do
        IFS='|' read -r name kind _ _ _ <<<"$entry"
        local dir="$INSTALL_DIR/$name"
        [[ -d "$dir" ]] || die "Expected directory $dir not found in clone"
        step "Installing $name ($kind)"
        ( cd "$dir" && if [[ "$kind" == 'node' ]]; then npm install; else uv sync; fi )
        ok "$name installed"
    done
}

port_in_use() {
    local p="$1"
    if have ss; then
        ss -ltn "sport = :$p" 2>/dev/null | tail -n +2 | grep -q .
    elif have lsof; then
        lsof -nP -iTCP:"$p" -sTCP:LISTEN >/dev/null 2>&1
    elif have nc; then
        nc -z localhost "$p" >/dev/null 2>&1
    else
        return 1
    fi
}

preflight_ports() {
    step 'Checking ports'
    local busy=()
    local entry name port
    for entry in "${SERVICES[@]}"; do
        IFS='|' read -r name _ _ port _ <<<"$entry"
        if port_in_use "$port"; then busy+=("$port ($name)"); fi
    done
    if (( ${#busy[@]} > 0 )); then
        die "Ports already in use: ${busy[*]}. Stop the conflicting processes and re-run."
    fi
    ok 'All ports free'
}

# Pick a launcher mode once. Echoes one of: tmux | gnome-terminal | konsole | kitty | iterm | osascript | nohup
pick_launcher() {
    if [[ -n "${TMUX:-}" ]] && have tmux;     then echo tmux;            return; fi
    if have tmux;                              then echo tmux;            return; fi
    if [[ "$(os_kind)" == 'macos' ]]; then
        if have osascript;                     then echo osascript;       return; fi
    fi
    if have gnome-terminal;                    then echo gnome-terminal;  return; fi
    if have konsole;                           then echo konsole;         return; fi
    if have kitty;                             then echo kitty;           return; fi
    echo nohup
}

LAUNCHER=''
TMUX_SESSION='etienne'

start_one() {
    local name="$1" cmd="$2" port="$3"
    local dir="$INSTALL_DIR/$name"
    local title="etienne: $name :$port"
    case "$LAUNCHER" in
        tmux)
            if ! tmux has-session -t "$TMUX_SESSION" 2>/dev/null; then
                tmux new-session -d -s "$TMUX_SESSION" -n "$name" -c "$dir" \
                    "echo '== $name (port $port) =='; $cmd"
            else
                tmux new-window -t "$TMUX_SESSION" -n "$name" -c "$dir" \
                    "echo '== $name (port $port) =='; $cmd"
            fi
            ;;
        gnome-terminal)
            gnome-terminal --title="$title" --working-directory="$dir" -- \
                bash -lc "echo '== $name (port $port) =='; $cmd; exec bash"
            ;;
        konsole)
            konsole --workdir "$dir" -p "tabtitle=$title" -e \
                bash -lc "echo '== $name (port $port) =='; $cmd; exec bash" &
            ;;
        kitty)
            kitty --title "$title" --directory "$dir" \
                bash -lc "echo '== $name (port $port) =='; $cmd; exec bash" &
            ;;
        osascript)
            osascript -e "tell application \"Terminal\" to do script \"cd '$dir' && echo '== $name (port $port) ==' && $cmd\"" >/dev/null
            ;;
        nohup)
            mkdir -p "$INSTALL_DIR/.logs"
            ( cd "$dir" && nohup bash -lc "$cmd" >"$INSTALL_DIR/.logs/$name.log" 2>&1 & echo $! > "$INSTALL_DIR/.logs/$name.pid" )
            ;;
    esac
}

start_services() {
    LAUNCHER="$(pick_launcher)"
    step "Starting services (launcher: $LAUNCHER)"
    if [[ "$LAUNCHER" == 'nohup' ]]; then
        warn "No terminal multiplexer or GUI terminal found — logs in $INSTALL_DIR/.logs/, PIDs alongside."
    fi
    local wave entry name kind cmd port w
    for wave in 1 2 3; do
        for entry in "${SERVICES[@]}"; do
            IFS='|' read -r name kind cmd port w <<<"$entry"
            if [[ "$w" == "$wave" ]]; then
                ok "Launching $name (wave $wave)"
                start_one "$name" "$cmd" "$port"
            fi
        done
        if (( wave < 3 )); then sleep 3; fi
    done
}

wait_frontend_and_open() {
    step 'Waiting for frontend on :5000'
    local i
    for ((i=0; i<30; i++)); do
        if curl -fsS -o /dev/null -m 2 http://localhost:5000 2>/dev/null; then
            ok 'Frontend is up'
            case "$(os_kind)" in
                macos) open http://localhost:5000 >/dev/null 2>&1 || true ;;
                linux) have xdg-open && xdg-open http://localhost:5000 >/dev/null 2>&1 || true ;;
            esac
            return
        fi
        sleep 2
    done
    warn 'Frontend did not respond within 60s. Open http://localhost:5000 manually once it finishes building.'
}

final_message() {
    cat <<EOF

${C_GREEN}============================================================
  Etienne developer install complete
============================================================${C_RESET}
  Install dir : $INSTALL_DIR
  Backend env : $INSTALL_DIR/backend/.env
  Open        : http://localhost:5000

  Notes:
   * Stop services by closing the terminal windows, or
     'tmux kill-session -t $TMUX_SESSION', or
     'pkill -f "node|uv run"'.
   * knowledge-graph search requires OPENAI_API_KEY in backend/.env.
   * Office-document parsing (docx/pptx/xlsx) needs LibreOffice (soffice).

EOF
}

# --- main ---
resolve_install_dir
require_git
ensure_node22
ensure_uv
ensure_python
clone_repo
configure_env
install_services
if [[ "$SKIP_START" == '1' ]]; then
    warn 'SKIP_START set — services not launched.'
    final_message
    exit 0
fi
preflight_ports
start_services
wait_frontend_and_open
final_message
