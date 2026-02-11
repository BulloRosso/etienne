# app.py - Enhanced Flask Server for React + API
"""
Erweiterter Flask-Server für:
- Statische React-Anwendungen (CDN-basiert, kein Build)
- Dynamische API-Endpoints (Hot-Reload)
- Korrekte MIME-Types für alle Dateitypen
- CORS-Support für lokale Entwicklung

Verzeichnisstruktur:
project-root/
├─ server/
│  └─ app.py
└─ workspace/
   ├─ data/
   │  ├─ in/    # CSV-Input
   │  └─ out/   # Analyse-Output
   └─ <projekt>/
      ├─ index.html
      └─ api/
         └─ *.py
"""

import os
import types
import threading
import importlib.util
import mimetypes
from typing import Dict, Tuple
from flask import Flask, jsonify, request, send_from_directory, abort, Response, make_response

# ------------------------------------------------------------
# Konfiguration
# ------------------------------------------------------------
BASE_DIR = os.path.abspath(os.path.dirname(__file__))
WORKSPACE = os.path.abspath(os.path.join(BASE_DIR, "..", "workspace"))
WORKSPACE = os.environ.get("WORKSPACE_DIR", WORKSPACE)
PORT = int(os.environ.get("PORT", "4000"))

app = Flask(__name__)
app.config["TEMPLATES_AUTO_RELOAD"] = True

# ------------------------------------------------------------
# MIME-Types für React/Web-Entwicklung
# ------------------------------------------------------------
MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.htm': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.mjs': 'application/javascript; charset=utf-8',
    '.jsx': 'application/javascript; charset=utf-8',
    '.ts': 'application/typescript; charset=utf-8',
    '.tsx': 'application/typescript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.jsonl': 'application/x-ndjson; charset=utf-8',
    '.map': 'application/json',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.ico': 'image/x-icon',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.ttf': 'font/ttf',
    '.eot': 'application/vnd.ms-fontobject',
    '.otf': 'font/otf',
    '.csv': 'text/csv; charset=utf-8',
    '.txt': 'text/plain; charset=utf-8',
    '.md': 'text/markdown; charset=utf-8',
    '.xml': 'application/xml; charset=utf-8',
    '.pdf': 'application/pdf',
    '.zip': 'application/zip',
}

def get_mime_type(filename: str) -> str:
    """Ermittle MIME-Type für eine Datei."""
    ext = os.path.splitext(filename)[1].lower()
    return MIME_TYPES.get(ext, 'application/octet-stream')

# ------------------------------------------------------------
# CORS-Middleware für lokale Entwicklung
# ------------------------------------------------------------
@app.after_request
def add_cors_headers(response):
    """Füge CORS-Header für lokale Entwicklung hinzu."""
    response.headers['Access-Control-Allow-Origin'] = '*'
    response.headers['Access-Control-Allow-Methods'] = 'GET, POST, PUT, DELETE, OPTIONS'
    response.headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization'
    response.headers['Access-Control-Max-Age'] = '3600'
    return response

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

def web_root(project: str) -> str:
    """Return the path to the public web subdirectory for a project."""
    return os.path.join(WORKSPACE, project, "web")

def api_dir(project: str) -> str:
    return os.path.join(project_root(project), "api")

def _ensure_in_dir(root: str, path: str):
    """Sicherheitscheck gegen Pfad-Traversal."""
    root_abs = os.path.abspath(root)
    path_abs = os.path.abspath(path)
    if os.path.commonpath([root_abs, path_abs]) != root_abs:
        abort(403, description="Forbidden path")

# ------------------------------------------------------------
# Dynamischer API-Dispatcher (Hot-Reload)
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
            return entry["module"]
        # Modul neu laden
        mod = _import_module(f"dyn_{project}_{module_name}_{mtime}", path)
        loaded_modules[key] = {"module": mod, "mtime": mtime, "path": path}
        print(f"[Hot-Reload] Loaded: {project}/api/{module_name}.py")
        return mod

def _as_response(res):
    if isinstance(res, Response):
        return res
    if isinstance(res, tuple):
        # (data, status_code) oder (data, status_code, headers)
        return make_response(*res)
    if isinstance(res, (str, bytes)):
        return res
    return jsonify(res)

@app.route("/<project>/api/<module_name>", methods=HTTP_METHODS)
def dynamic_api(project: str, module_name: str):
    """Dynamischer API-Dispatcher mit Hot-Reload."""
    # OPTIONS für CORS Preflight
    if request.method == "OPTIONS":
        return "", 204
    
    mod = load_module(project, module_name)

    # 1) Verb-spezifische Funktion
    func = getattr(mod, request.method.lower(), None)
    if callable(func):
        try:
            if func.__code__.co_argcount == 0:
                return _as_response(func())
            else:
                return _as_response(func(request))
        except Exception as e:
            return jsonify({"error": str(e)}), 500

    # 2) handle(request) Funktion
    handle = getattr(mod, "handle", None)
    if callable(handle):
        methods = getattr(mod, "SUPPORTED_METHODS", ["GET"])
        if request.method not in methods:
            abort(405)
        try:
            return _as_response(handle(request))
        except Exception as e:
            return jsonify({"error": str(e)}), 500

    abort(500, description=f"{project}/api/{module_name}.py must define verb functions or handle(request)")

@app.route("/<project>/api/")
def list_api_modules(project: str):
    """Liste alle verfügbaren API-Module eines Projekts."""
    p = api_dir(project)
    if not os.path.isdir(p):
        return jsonify({"project": project, "modules": [], "error": "No api/ directory"})
    mods = sorted(
        fn[:-3] for fn in os.listdir(p)
        if fn.endswith(".py") and not fn.startswith("_")
    )
    return jsonify({"project": project, "modules": mods})

# ------------------------------------------------------------
# Public Web Routes (/web/<project>/...)
# Serves static content from workspace/<project>/web/
# API endpoints reuse the existing hot-reload dispatcher
# ------------------------------------------------------------
@app.route("/web/")
def web_project_list():
    """List all projects that have a web/ subdirectory."""
    projects = [p for p in list_projects()
                if os.path.isdir(web_root(p))]

    html = [
        "<!DOCTYPE html>",
        "<html><head><meta charset='utf-8'><title>Public Websites</title>",
        "<style>body{font-family:system-ui;padding:2rem;max-width:800px;margin:0 auto}",
        "a{color:#1976d2;text-decoration:none}a:hover{text-decoration:underline}",
        "ul{list-style:none;padding:0}li{padding:0.5rem 0;border-bottom:1px solid #eee}</style></head>",
        "<body>",
        "<h2>Public Websites</h2>",
    ]
    if projects:
        html.append("<ul>")
        for p in projects:
            html.append(f'<li><a href="/web/{p}/">{p}</a></li>')
        html.append("</ul>")
    else:
        html.append("<p>No projects with public websites found.</p>")
    html.append("</body></html>")

    return Response("\n".join(html), mimetype="text/html")

@app.route("/web/<project>/api/<module_name>", methods=HTTP_METHODS)
def web_dynamic_api(project: str, module_name: str):
    """API dispatcher for public web endpoints (delegates to existing hot-reload)."""
    return dynamic_api(project, module_name)

@app.route("/web/<project>/api/")
def web_list_api_modules(project: str):
    """List API modules for a project (via /web prefix)."""
    return list_api_modules(project)

@app.route("/web/<project>/")
def web_serve_index(project: str):
    """Serve index.html from the project's web/ subdirectory."""
    root = web_root(project)
    if not os.path.isdir(root):
        abort(404, description=f"No web directory for project: {project}")

    idx = os.path.join(root, "index.html")
    if os.path.isfile(idx):
        response = send_from_directory(root, "index.html")
        response.headers['Content-Type'] = 'text/html; charset=utf-8'
        response.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate'
        return response

    # Directory listing for web/ subdirectory
    entries = []
    for name in sorted(os.listdir(root)):
        if name.startswith("."):
            continue
        p = os.path.join(root, name)
        entries.append({"name": name, "is_dir": os.path.isdir(p)})

    html = [
        "<!DOCTYPE html>",
        "<html><head><meta charset='utf-8'><title>{} - Web</title>".format(project),
        "<style>body{font-family:system-ui;padding:2rem;max-width:800px;margin:0 auto}",
        "a{color:#1976d2;text-decoration:none}a:hover{text-decoration:underline}",
        "ul{list-style:none;padding:0}li{padding:0.5rem 0;border-bottom:1px solid #eee}</style></head>",
        "<body>",
        "<h2>/web/{}</h2>".format(project),
        '<p><a href="/web/">Back to project list</a></p>',
        "<ul>"
    ]
    for e in entries:
        suffix = "/" if e["is_dir"] else ""
        icon = "📁" if e["is_dir"] else "📄"
        html.append(f'<li>{icon} <a href="/web/{project}/{e["name"]}{suffix}">{e["name"]}{suffix}</a></li>')
    html.append("</ul></body></html>")

    return Response("\n".join(html), mimetype="text/html")

@app.route("/web/<project>/<path:filepath>")
def web_serve_file(project: str, filepath: str):
    """Serve static files from the project's web/ subdirectory."""
    root = web_root(project)
    full = os.path.join(root, filepath)
    _ensure_in_dir(root, full)

    if os.path.isdir(full):
        # Check for index.html in subdirectory
        idx = os.path.join(full, "index.html")
        if os.path.isfile(idx):
            response = send_from_directory(full, "index.html")
            response.headers['Content-Type'] = 'text/html; charset=utf-8'
            return response

        # Directory listing
        try:
            entries = sorted(os.listdir(full))
        except Exception:
            abort(404)

        html = [
            "<!DOCTYPE html>",
            "<html><head><meta charset='utf-8'><title>{}/{}</title>".format(project, filepath),
            "<style>body{font-family:system-ui;padding:2rem;max-width:800px;margin:0 auto}",
            "a{color:#1976d2;text-decoration:none}a:hover{text-decoration:underline}",
            "ul{list-style:none;padding:0}li{padding:0.5rem 0;border-bottom:1px solid #eee}</style></head>",
            "<body>",
            "<h2>/web/{}/{}</h2>".format(project, filepath),
            '<p><a href="/web/{}/{}">Parent</a></p>'.format(project, "/".join(filepath.split("/")[:-1])),
            "<ul>"
        ]
        for name in entries:
            if name.startswith("."):
                continue
            p = os.path.join(full, name)
            is_dir = os.path.isdir(p)
            suffix = "/" if is_dir else ""
            icon = "📁" if is_dir else "📄"
            html.append(f'<li>{icon} <a href="/web/{project}/{filepath}/{name}{suffix}">{name}{suffix}</a></li>')
        html.append("</ul></body></html>")

        return Response("\n".join(html), mimetype="text/html")

    # Serve the file
    if not os.path.isfile(full):
        abort(404)

    directory = os.path.dirname(filepath)
    filename = os.path.basename(filepath)
    directory_fs = os.path.join(root, directory) if directory else root

    response = send_from_directory(directory_fs, filename)
    response.headers['Content-Type'] = get_mime_type(filename)

    # Cache-Control for development
    if filename.endswith(('.html', '.js', '.jsx', '.css')):
        response.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate'

    return response

# ------------------------------------------------------------
# Statische Datei-Auslieferung (legacy routes)
# ------------------------------------------------------------
@app.route("/<project>/")
def serve_index(project: str):
    """Liefere index.html oder Verzeichnisliste."""
    root = project_root(project)
    if not os.path.isdir(root):
        abort(404, description=f"Project not found: {project}")
    
    idx = os.path.join(root, "index.html")
    if os.path.isfile(idx):
        response = send_from_directory(root, "index.html")
        response.headers['Content-Type'] = 'text/html; charset=utf-8'
        response.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate'
        return response
    
    # Verzeichnisliste
    entries = []
    for name in sorted(os.listdir(root)):
        if name.startswith("."):
            continue
        p = os.path.join(root, name)
        entries.append({"name": name, "is_dir": os.path.isdir(p)})
    
    html = [
        "<!DOCTYPE html>",
        "<html><head><meta charset='utf-8'><title>{}</title>".format(project),
        "<style>body{font-family:system-ui;padding:2rem;max-width:800px;margin:0 auto}",
        "a{color:#1976d2;text-decoration:none}a:hover{text-decoration:underline}",
        "ul{list-style:none;padding:0}li{padding:0.5rem 0;border-bottom:1px solid #eee}</style></head>",
        "<body>",
        "<h2>📁 /{}</h2>".format(project),
        "<ul>"
    ]
    for e in entries:
        suffix = "/" if e["is_dir"] else ""
        icon = "📁" if e["is_dir"] else "📄"
        html.append(f'<li>{icon} <a href="/{project}/{e["name"]}{suffix}">{e["name"]}{suffix}</a></li>')
    html.append("</ul></body></html>")
    
    return Response("\n".join(html), mimetype="text/html")

@app.route("/<project>/<path:filepath>")
def serve_file(project: str, filepath: str):
    """Liefere statische Dateien mit korrektem MIME-Type."""
    root = project_root(project)
    full = os.path.join(root, filepath)
    _ensure_in_dir(root, full)

    if os.path.isdir(full):
        # Prüfe auf index.html in Unterverzeichnis
        idx = os.path.join(full, "index.html")
        if os.path.isfile(idx):
            response = send_from_directory(full, "index.html")
            response.headers['Content-Type'] = 'text/html; charset=utf-8'
            return response
        
        # Verzeichnisliste
        try:
            entries = sorted(os.listdir(full))
        except Exception:
            abort(404)
        
        html = [
            "<!DOCTYPE html>",
            "<html><head><meta charset='utf-8'><title>{}/{}</title>".format(project, filepath),
            "<style>body{font-family:system-ui;padding:2rem;max-width:800px;margin:0 auto}",
            "a{color:#1976d2;text-decoration:none}a:hover{text-decoration:underline}",
            "ul{list-style:none;padding:0}li{padding:0.5rem 0;border-bottom:1px solid #eee}</style></head>",
            "<body>",
            "<h2>📁 /{}/{}</h2>".format(project, filepath),
            '<p><a href="/{}/{}">⬆️ Parent</a></p>'.format(project, "/".join(filepath.split("/")[:-1])),
            "<ul>"
        ]
        for name in entries:
            if name.startswith("."):
                continue
            p = os.path.join(full, name)
            is_dir = os.path.isdir(p)
            suffix = "/" if is_dir else ""
            icon = "📁" if is_dir else "📄"
            html.append(f'<li>{icon} <a href="/{project}/{filepath}/{name}{suffix}">{name}{suffix}</a></li>')
        html.append("</ul></body></html>")
        
        return Response("\n".join(html), mimetype="text/html")

    # Datei ausliefern
    if not os.path.isfile(full):
        abort(404)
    
    directory = os.path.dirname(filepath)
    filename = os.path.basename(filepath)
    directory_fs = os.path.join(root, directory) if directory else root
    
    response = send_from_directory(directory_fs, filename)
    response.headers['Content-Type'] = get_mime_type(filename)
    
    # Cache-Control für Entwicklung
    if filename.endswith(('.html', '.js', '.jsx', '.css')):
        response.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate'
    
    return response

# ------------------------------------------------------------
# Root/Health/Info
# ------------------------------------------------------------
@app.route("/")
def root_info():
    """Zeige Server-Info und verfügbare Projekte."""
    projects = list_projects()
    
    html = """<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>Anomaly Detection Server</title>
    <style>
        body { font-family: system-ui; padding: 2rem; max-width: 900px; margin: 0 auto; background: #f5f5f5; }
        .card { background: white; padding: 1.5rem; border-radius: 8px; margin-bottom: 1rem; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        h1 { color: #1976d2; }
        a { color: #1976d2; text-decoration: none; }
        a:hover { text-decoration: underline; }
        code { background: #e3f2fd; padding: 0.2rem 0.5rem; border-radius: 4px; font-size: 0.9em; }
        ul { padding-left: 1.5rem; }
        li { padding: 0.3rem 0; }
        .status { display: inline-block; width: 10px; height: 10px; border-radius: 50%; margin-right: 8px; }
        .status.ok { background: #4caf50; }
    </style>
</head>
<body>
    <h1>🔍 Anomaly Detection Server</h1>
    
    <div class="card">
        <h3><span class="status ok"></span>Server Status: Running</h3>
        <p><strong>Port:</strong> """ + str(PORT) + """</p>
        <p><strong>Workspace:</strong> <code>""" + WORKSPACE + """</code></p>
    </div>
    
    <div class="card">
        <h3>📁 Projekte</h3>
        """ + (
            "<ul>" + "".join(f'<li><a href="/{p}/">{p}</a> - <a href="/{p}/api/">API</a></li>' for p in projects) + "</ul>"
            if projects else "<p>Keine Projekte gefunden.</p>"
        ) + """
    </div>
    
    <div class="card">
        <h3>📖 URL-Schema</h3>
        <ul>
            <li><code>/&lt;project&gt;/</code> - Statische Dateien (index.html)</li>
            <li><code>/&lt;project&gt;/api/</code> - Liste der API-Module</li>
            <li><code>/&lt;project&gt;/api/&lt;module&gt;</code> - API-Endpoint</li>
        </ul>
    </div>
    
    <div class="card">
        <h3>🚀 Schnellstart</h3>
        <ol>
            <li>CSV-Datei in <code>workspace/data/in/</code> ablegen</li>
            <li>Analyse mit <code>analyze_csv.py</code> ausführen</li>
            <li>Dashboard unter <code>http://localhost:""" + str(PORT) + """/&lt;project&gt;/</code> öffnen</li>
        </ol>
    </div>
</body>
</html>"""
    
    return Response(html, mimetype="text/html")

@app.route("/health")
def health_check():
    """Health-Check Endpoint."""
    return jsonify({
        "status": "healthy",
        "workspace": WORKSPACE,
        "projects": list_projects()
    })

# ------------------------------------------------------------
# Bootstrap
# ------------------------------------------------------------
if __name__ == "__main__":
    os.makedirs(WORKSPACE, exist_ok=True)
    os.makedirs(os.path.join(WORKSPACE, "data", "in"), exist_ok=True)
    os.makedirs(os.path.join(WORKSPACE, "data", "out"), exist_ok=True)
    
    print(f"""
╔════════════════════════════════════════════════════════════╗
║  🔍 Anomaly Detection Server                               ║
╠════════════════════════════════════════════════════════════╣
║  Port:      {PORT:<45}║
║  Workspace: {WORKSPACE:<45}║
║  Projects:  {', '.join(list_projects()) or 'None':<45}║
╚════════════════════════════════════════════════════════════╝
""")
    
    app.run(host="127.0.0.1", port=PORT, debug=True, use_reloader=True)
