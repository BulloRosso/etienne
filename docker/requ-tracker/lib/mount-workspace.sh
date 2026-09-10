#!/bin/bash
# Resolve WORKSPACE_ROOT from WORKSPACE_ROOT_AZURE_FILESHARE.
#
# Two deployment shapes are supported, chosen automatically:
#
#   platform mount (recommended on Azure App Service)
#     The App Service "Path mappings" feature mounts the file share for us.
#     Give the connection string no credentials, just the mount path:
#       ShareName=workspace;MountPath=/app/workspace
#     We only verify the path exists and is writable.
#
#   in-container CIFS mount (docker run / plain container hosts)
#     Give an AccountKey= or SasToken= and we mount it ourselves. Needs
#     --cap-add SYS_ADMIN --device /dev/fuse (or --privileged).
#
# Force one with Mode=platform | Mode=cifs.
#
# Exports WORKSPACE_ROOT (backend) and WORKSPACE_DIR (rdf-store, vector-store).
# On failure the container keeps running against the local /app/workspace so an
# operator can still reach the UI and read the logs.

set -u

DEFAULT_WORKSPACE=/app/workspace

# Read one key out of the Azure-style `Key=Value;Key=Value` string.
# Only the first '=' splits, because account keys end in '=' padding.
fileshare_value() {
    local wanted="$1"
    local rest="${WORKSPACE_ROOT_AZURE_FILESHARE:-}"
    local segment key value
    while [ -n "$rest" ]; do
        segment="${rest%%;*}"
        if [ "$segment" = "$rest" ]; then rest=""; else rest="${rest#*;}"; fi
        case "$segment" in
            *=*) : ;;
            *) continue ;;
        esac
        key="${segment%%=*}"
        value="${segment#*=}"
        # trim surrounding whitespace
        key="$(echo "$key" | tr -d '[:space:]' | tr '[:upper:]' '[:lower:]')"
        value="${value#"${value%%[![:space:]]*}"}"
        value="${value%"${value##*[![:space:]]}"}"
        if [ "$key" = "$wanted" ]; then
            printf '%s' "$value"
            return 0
        fi
    done
    return 0
}

workspace_fallback() {
    echo "[workspace] Falling back to the container-local workspace at $DEFAULT_WORKSPACE"
    echo "[workspace] Project data will NOT survive a container restart."
    mkdir -p "$DEFAULT_WORKSPACE"
    export WORKSPACE_ROOT="$DEFAULT_WORKSPACE"
    export WORKSPACE_DIR="$DEFAULT_WORKSPACE"
}

verify_workspace_writable() {
    local path="$1"
    mkdir -p "$path" 2>/dev/null || true
    if [ ! -d "$path" ]; then
        echo "[workspace] ERROR: $path does not exist and could not be created"
        return 1
    fi
    if ! touch "$path/.etienne-write-probe" 2>/dev/null; then
        echo "[workspace] ERROR: $path is not writable"
        return 1
    fi
    rm -f "$path/.etienne-write-probe"
    return 0
}

mount_cifs_share() {
    local account="$1" share="$2" mount_path="$3" suffix="$4" key="$5" sas="$6" dir="$7"

    if [ -z "$account" ] || [ -z "$share" ]; then
        echo "[workspace] ERROR: CIFS mode needs both AccountName= and ShareName="
        return 1
    fi
    if ! command -v mount.cifs >/dev/null 2>&1; then
        echo "[workspace] ERROR: cifs-utils is not installed in this image"
        return 1
    fi

    local unc="//${account}.file.${suffix}/${share}"
    [ -n "$dir" ] && unc="${unc}/${dir#/}"

    mkdir -p "$mount_path"

    # Credentials go in a 0600 file, never on the command line — /proc/*/cmdline
    # is readable by anything running in the container.
    local cred_file
    cred_file="$(mktemp)"
    chmod 600 "$cred_file"
    if [ -n "$key" ]; then
        printf 'username=%s\npassword=%s\n' "$account" "$key" > "$cred_file"
    else
        # SAS auth travels as the password with an empty username.
        printf 'username=%s\npassword=%s\n' "$account" "${sas#\?}" > "$cred_file"
    fi

    echo "[workspace] Mounting $unc → $mount_path (CIFS)"
    local opts="credentials=${cred_file},dir_mode=0777,file_mode=0777,serverino,nosharesock,actimeo=30,mfsymlinks"

    # Capture into a variable rather than piping to sed: a pipeline's exit
    # status is the LAST command's, so `mount ... | sed` always looks like a
    # success and a failed mount would silently fall through to a local dir.
    local output status
    output="$(mount -t cifs "$unc" "$mount_path" -o "$opts" 2>&1)"
    status=$?
    rm -f "$cred_file"
    [ -n "$output" ] && echo "$output" | sed 's/^/[workspace] /'

    # `mount` can exit 0 having done nothing useful in a capability-restricted
    # container, so confirm the path really became a mount point.
    if [ "$status" -eq 0 ] && mountpoint -q "$mount_path" 2>/dev/null; then
        echo "[workspace] Mounted successfully"
        return 0
    fi

    echo "[workspace] ERROR: CIFS mount failed (exit $status, mountpoint check $(mountpoint -q "$mount_path" 2>/dev/null && echo pass || echo fail))."
    echo "[workspace]        The container needs --cap-add SYS_ADMIN to mount a share itself."
    echo "[workspace]        On Azure App Service use a platform path mapping instead and omit"
    echo "[workspace]        AccountKey=/SasToken= so this image runs in Mode=platform."
    return 1
}

resolve_workspace() {
    if [ -z "${WORKSPACE_ROOT_AZURE_FILESHARE:-}" ]; then
        echo "[workspace] WORKSPACE_ROOT_AZURE_FILESHARE not set — using ${WORKSPACE_ROOT:-$DEFAULT_WORKSPACE}"
        export WORKSPACE_ROOT="${WORKSPACE_ROOT:-$DEFAULT_WORKSPACE}"
        export WORKSPACE_DIR="$WORKSPACE_ROOT"
        mkdir -p "$WORKSPACE_ROOT"
        return 0
    fi

    local account share mount_path suffix key sas dir mode
    account="$(fileshare_value accountname)"
    share="$(fileshare_value sharename)"
    mount_path="$(fileshare_value mountpath)"
    suffix="$(fileshare_value endpointsuffix)"
    key="$(fileshare_value accountkey)"
    sas="$(fileshare_value sastoken)"
    dir="$(fileshare_value directory)"
    mode="$(echo "$(fileshare_value mode)" | tr '[:upper:]' '[:lower:]')"

    [ -z "$mount_path" ] && mount_path="$DEFAULT_WORKSPACE"
    [ -z "$suffix" ] && suffix="core.windows.net"

    if [ -z "$mode" ]; then
        # No credentials supplied → the platform must have mounted it already.
        if [ -n "$key" ] || [ -n "$sas" ]; then mode="cifs"; else mode="platform"; fi
    fi

    echo "[workspace] Azure File Share mode=$mode share=${share:-<unset>} mount=$mount_path"

    if [ "$mode" = "cifs" ]; then
        if ! mountpoint -q "$mount_path" 2>/dev/null; then
            if ! mount_cifs_share "$account" "$share" "$mount_path" "$suffix" "$key" "$sas" "$dir"; then
                workspace_fallback
                return 0
            fi
        else
            echo "[workspace] $mount_path is already a mount point — reusing it"
        fi
    fi

    if ! verify_workspace_writable "$mount_path"; then
        if [ "$mode" = "platform" ]; then
            echo "[workspace] Expected the host to mount the share at $mount_path."
            echo "[workspace] On Azure App Service: Configuration → Path mappings → add an Azure Files mount."
        fi
        workspace_fallback
        return 0
    fi

    echo "[workspace] Using workspace at $mount_path"
    export WORKSPACE_ROOT="$mount_path"
    export WORKSPACE_DIR="$mount_path"
}
