# Dynamic Webserver

Flask-based webserver running on port 4000 that serves static content and hot-reloadable Python API endpoints for all workspace projects.

## Vite Proxy Mapping

The frontend's Vite dev server (port 5000) forwards `/web` requests to this webserver:

```
Browser → http://localhost:5000/web/myproject/index.html
         ↓ Vite proxy (no path rewrite)
Flask  → http://localhost:4000/web/myproject/index.html
         ↓ matches /web/<project>/<path:filepath>
Serves → workspace/myproject/web/index.html
```

Configured in `frontend/vite.config.js`:
```js
'/web': { target: 'http://localhost:4000', changeOrigin: true }
```

## URL Schema

### Public Web Routes (`/web/...`)

Used for outward-facing public websites. Static files are served from the project's `web/` subdirectory, isolating public content from internal project files.

| Route | Serves from |
|-------|-------------|
| `/web/` | Lists all projects with a `web/` subdirectory |
| `/web/<project>/` | `workspace/<project>/web/index.html` |
| `/web/<project>/<path>` | `workspace/<project>/web/<path>` |
| `/web/<project>/api/<module>` | `workspace/<project>/api/<module>.py` |
| `/web/<project>/api/` | Lists available API modules |

### Legacy Routes (`/<project>/...`)

Serve files directly from the project root directory. Used by the HTML previewer iframe.

| Route | Serves from |
|-------|-------------|
| `/<project>/` | `workspace/<project>/index.html` |
| `/<project>/<path>` | `workspace/<project>/<path>` |
| `/<project>/api/<module>` | `workspace/<project>/api/<module>.py` |

## Project Directory Convention

```
workspace/<project>/
├── web/                    # Public website content (HTML, CSS, JS, images)
│   ├── index.html          # Start document for /web/<project>/
│   ├── css/
│   ├── js/
│   └── images/
├── api/                    # Python API endpoint files (shared by both route sets)
│   └── <endpoint>.py       # Becomes /web/<project>/api/<endpoint>
├── data/                   # Data storage (API read/write)
└── out/                    # Output files
```

## API Endpoints (Hot-Reload)

Python files in `workspace/<project>/api/` are dynamically loaded and reloaded when modified. Two patterns are supported:

**Pattern 1 — Verb functions (preferred):**
```python
def get(request=None):
    return {"data": "..."}

def post(request):
    data = request.get_json(silent=True) or {}
    return {"status": "created"}
```

**Pattern 2 — Universal handler:**
```python
SUPPORTED_METHODS = ["GET", "POST"]

def handle(request):
    if request.method == "GET":
        return {"items": []}
    return {"status": "created"}
```

See `example_api_endpoint.py` for a working example.

## Skill

The `public-website` skill in `skill-repository/standard/public-website/SKILL.md` guides the AI coding agent to create professional public websites using React 18 + MUI v5 via CDN, with server-relative links (`/web/<project>/...`) and localStorage for user preferences.
