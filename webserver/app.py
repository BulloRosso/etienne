# app.py
import os
import types
import threading
import importlib.util
from typing import Dict, Tuple
from flask import Flask, jsonify, request, send_from_directory, abort, Response

# ------------------------------------------------------------
# Konfiguration: workspace liegt als Geschwisterordner neben app.py
# project-root/
# ├─ server/
# │  └─ app.py
# └─ workspace/
#    └─ <projekt>/
# ------------------------------------------------------------
BASE_DIR = os.path.abspath(os.path.dirname(__file__))
WORKSPACE = os.path.abspath(os.path.join(BASE_DIR, "..", "workspace"))
WORKSPACE = os.environ.get("WORKSPACE_DIR", WORKSPACE)  # optionales Override
PORT = int(os.environ.get("PORT", "4000"))

app = Flask(__name__)
app.config["TEMPLATES_AUTO_RELOAD"] = True

# ------------------------------------------------------------
# Hilfsfunktionen
# ------------------------------------------------------------
def list_projects():
    if not os.path.isdir(WORKSPACE):
        return []
    return sorted(
        d for d in os.listdir(WORKSPACE)
        if os.path.isdir(os.path.join(WORKSPACE, d)) and not d.startswith(".")
    )

def project_root(project: str) -> str:
    return os.path.join(WORKSPACE, project)

def api_dir(project: str) -> str:
    return os.path.join(project_root(project), "api")

def _ensure_in_dir(root: str, path: str):
    # Sicherheitscheck gegen Pfad-Traversal
    root_abs = os.path.abspath(root)
    path_abs = os.path.abspath(path)
    if os.path.commonpath([root_abs, path_abs]) != root_abs:
        abort(403, description="Forbidden path")

# ------------------------------------------------------------
# Dynamischer API-Dispatcher (hot-load pro Request)
#   - /<project>/api/<module_name>
#   Modulformen:
#     1) Verb-spezifische Funktionen get()/post()/...
#     2) handle(request) + optional SUPPORTED_METHODS = [...]
# ------------------------------------------------------------
registry_lock = threading.RLock()
loaded_modules: Dict[Tuple[str, str], Dict[str, object]] = {}
HTTP_METHODS = ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS", "HEAD"]

def api_file_path(project: str, module_name: str) -> str:
    return os.path.join(api_dir(project), f"{module_name}.py")

def _import_module(unique_name: str, path: str) -> types.ModuleType:
    spec = importlib.util.spec_from_file_location(unique_name, path)
    if spec is None or spec.loader is None:
        abort(500, description=f"Cannot import: {path}")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod

def load_module(project: str, module_name: str) -> types.ModuleType:
    path = api_file_path(project, module_name)
    if not os.path.isfile(path):
        abort(404, description=f"API module not found: {project}/api/{module_name}.py")
    _ensure_in_dir(api_dir(project), path)
    mtime = os.path.getmtime(path)
    key = (project, module_name)
    with registry_lock:
        entry = loaded_modules.get(key)
        if entry and entry["mtime"] == mtime:
            return entry["module"]  # unverändert, aus Cache
        mod = _import_module(f"dyn_{project}_{module_name}", path)
        loaded_modules[key] = {"module": mod, "mtime": mtime, "path": path}
        return mod

def _as_response(res):
    if isinstance(res, Response):
        return res
    if isinstance(res, (str, bytes)):
        return res
    return jsonify(res)

@app.route("/<project>/api/<module_name>", methods=HTTP_METHODS)
def dynamic_api(project: str, module_name: str):
    # Modul laden bzw. bei M-Time-Änderung neu laden
    mod = load_module(project, module_name)

    # 1) Verb-spezifische Funktion vorhanden?
    func = getattr(mod, request.method.lower(), None)
    if callable(func):
        return _as_response(func() if func.__code__.co_argcount == 0 else func(request))

    # 2) handle(request) vorhanden?
    handle = getattr(mod, "handle", None)
    if callable(handle):
        methods = getattr(mod, "SUPPORTED_METHODS", ["GET"])
        if request.method not in methods:
            abort(405)
        return _as_response(handle(request))

    abort(500, description=f"{project}/api/{module_name}.py must define verb functions or handle(request)")

@app.route("/<project>/api/")
def list_api_modules(project: str):
    p = api_dir(project)
    if not os.path.isdir(p):
        abort(404, description=f"No api/ directory in project '{project}'")
    mods = sorted(
        fn[:-3] for fn in os.listdir(p)
        if fn.endswith(".py") and not fn.startswith("_")
    )
    return jsonify({"project": project, "modules": mods})

# ------------------------------------------------------------
# Statische Auslieferung unter /<project>/...
# ------------------------------------------------------------
@app.route("/<project>/")
def serve_index(project: str):
    root = project_root(project)
    if not os.path.isdir(root):
        abort(404, description=f"Project not found: {project}")
    idx = os.path.join(root, "index.html")
    if os.path.isfile(idx):
        return send_from_directory(root, "index.html")
    # einfache Verzeichnisliste
    entries = []
    for name in sorted(os.listdir(root)):
        if name.startswith("."):
            continue
        p = os.path.join(root, name)
        entries.append({"name": name, "is_dir": os.path.isdir(p)})
    html = ["<h3>/{}</h3>".format(project), "<ul>"]
    for e in entries:
        suffix = "/" if e["is_dir"] else ""
        html.append(f'<li><a href="/{project}/{e["name"]}{suffix}">{e["name"]}{suffix}</a></li>')
    html.append("</ul>")
    return Response("\n".join(html), mimetype="text/html")

@app.route("/<project>/<path:filepath>")
def serve_file(project: str, filepath: str):
    root = project_root(project)
    full = os.path.join(root, filepath)
    _ensure_in_dir(root, full)

    if os.path.isdir(full):
        # Verzeichnisliste
        try:
            entries = sorted(os.listdir(full))
        except Exception:
            abort(404)
        html = [f"<h3>/{project}/{filepath}</h3>", "<ul>"]
        for name in entries:
            if name.startswith("."):
                continue
            p = os.path.join(full, name)
            suffix = "/" if os.path.isdir(p) else ""
            html.append(f'<li><a href="/{project}/{filepath}/{name}{suffix}">{name}{suffix}</a></li>')
        html.append("</ul>")
        return Response("\n".join(html), mimetype="text/html")

    directory = os.path.dirname(filepath)
    filename = os.path.basename(filepath)
    directory_fs = os.path.join(root, directory)
    if not os.path.isdir(directory_fs):
        abort(404)
    return send_from_directory(directory_fs, filename)

# ------------------------------------------------------------
# Root/Health
# ------------------------------------------------------------
@app.route("/")
def root_info():
    return jsonify({
        "workspace": WORKSPACE,
        "projects": list_projects(),
        "static_hint": "/<project>/... (liefert Dateien aus workspace/<project>)",
        "api_hint": "/<project>/api/<module> (lädt workspace/<project>/api/<module>.py dynamisch)"
    })

# ------------------------------------------------------------
# Bootstrap
# ------------------------------------------------------------
if __name__ == "__main__":
    os.makedirs(WORKSPACE, exist_ok=True)
    app.run(host="127.0.0.1", port=PORT, debug=True, use_reloader=True)
