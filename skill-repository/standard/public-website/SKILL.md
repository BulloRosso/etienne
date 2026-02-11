---
name: public-website
description: Guides the agent to create professional public websites with React/MUI served from the project's /web subdirectory with hot-reloadable API endpoints
---
# Public Website

This skill enables you to create professional, publicly accessible websites for projects. Websites are served from the project's `/web` subdirectory and are accessible via the webserver.

## When to Use This Skill

Use this skill when the user asks you to:
- Create a public website or landing page for a project
- Build a web application with API endpoints
- Create forms, questionnaires, or interactive pages
- Set up a web presence for data collection or presentation

## Architecture

### URL Structure
- **Static pages**: `/web/<project>/index.html`, `/web/<project>/about.html`
- **Assets**: `/web/<project>/css/styles.css`, `/web/<project>/js/app.js`
- **API endpoints**: `/web/<project>/api/<endpoint-name>`

### Directory Structure
```
workspace/<project>/
├── web/                    # Static website content (HTML, CSS, JS, images)
│   ├── index.html          # Start document (required)
│   ├── css/
│   │   └── styles.css
│   ├── js/
│   │   └── app.js
│   └── images/
└── api/                    # API endpoint Python files (hot-reloadable)
    └── <endpoint>.py
```

### Technology Stack
- **Frontend**: React 18 via CDN (no build step required)
- **UI Library**: Material-UI (MUI) v5 + MUI Icons via CDN
- **API**: Python endpoint files with hot-reload (Flask request/response)
- **No authentication**: The website is public and does not require any form of authentication

## Step 1: Ask the User About Language

Before creating any content, ask the user which language(s) the website should support. The user may want a German website even though the conversation is in English. Supported patterns:
- Single language (e.g., German only)
- Multi-language with language switcher using localStorage to remember the choice

## Step 2: Create the Directory Structure

```bash
mkdir -p web
mkdir -p web/css
mkdir -p web/js
mkdir -p web/images
mkdir -p api
```

## Step 3: Create index.html

The start document must be located at `web/index.html`. Use this template:

```html
<!DOCTYPE html>
<html lang="de">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Project Title</title>

    <!-- React -->
    <script crossorigin src="https://unpkg.com/react@18/umd/react.production.min.js"></script>
    <script crossorigin src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"></script>

    <!-- MUI -->
    <script crossorigin src="https://unpkg.com/@mui/material@5/umd/material-ui.production.min.js"></script>

    <!-- Roboto Font -->
    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Roboto:wght@300;400;500;700&display=swap" />

    <!-- Material Icons Font -->
    <link rel="stylesheet" href="https://fonts.googleapis.com/icon?family=Material+Icons" />
</head>
<body>
    <div id="root"></div>
    <script type="text/babel">
        const {
            ThemeProvider, createTheme, CssBaseline,
            AppBar, Toolbar, Typography, Container, Box, Button, Paper,
            IconButton, Grid, Card, CardContent, CardActions
        } = MaterialUI;

        const theme = createTheme();

        function App() {
            return (
                <ThemeProvider theme={theme}>
                    <CssBaseline />
                    {/* Your app content here */}
                </ThemeProvider>
            );
        }

        const root = ReactDOM.createRoot(document.getElementById('root'));
        root.render(<App />);
    </script>
</body>
</html>
```
In the App Bar include our company name "Music Parts GmbH" 

## Step 4: Create API Endpoints (if needed)

API endpoint files go in the `api/` directory. Each Python file becomes an endpoint automatically. The server hot-reloads when files change.

**File naming**: `api/<endpoint-name>.py` maps to URL `/web/<project>/api/<endpoint-name>`

### Pattern 1 - HTTP verb functions (preferred)

```python
# api/contact.py
import json
import os

DATA_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))

def get(request=None):
    """Return existing submissions."""
    filepath = os.path.join(DATA_DIR, "data", "submissions.json")
    if not os.path.exists(filepath):
        return {"submissions": []}
    with open(filepath, encoding="utf-8") as f:
        return json.load(f)

def post(request):
    """Handle form submission."""
    data = request.get_json(silent=True) or {}
    filepath = os.path.join(DATA_DIR, "data", "submissions.json")

    existing = []
    if os.path.exists(filepath):
        with open(filepath, encoding="utf-8") as f:
            existing = json.load(f).get("submissions", [])

    existing.append(data)

    os.makedirs(os.path.dirname(filepath), exist_ok=True)
    with open(filepath, "w", encoding="utf-8") as f:
        json.dump({"submissions": existing}, f, indent=2, ensure_ascii=False)

    return {"success": True, "message": "Submission received"}
```

### Pattern 2 - handle() with SUPPORTED_METHODS

```python
SUPPORTED_METHODS = ["GET", "POST"]

def handle(request):
    if request.method == "GET":
        return {"status": "ok"}
    elif request.method == "POST":
        data = request.get_json(silent=True) or {}
        return {"received": data}
```

## Step 5: Calling APIs from the Frontend

Use `fetch()` with server-relative URLs. Replace `<project>` with the actual project name.

```javascript
// GET request
const response = await fetch('/web/<project>/api/contact');
const data = await response.json();

// POST request
const response = await fetch('/web/<project>/api/contact', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'John', message: 'Hello' })
});
```

## Design Guidelines

### Visual Design
- Use the MUI **default color theme** (primary: #1976d2 blue)
- Create a **calm and professional** appearance
- Use proper spacing and typography hierarchy
- Include responsive design for mobile devices

### Navigation & Links
- Always use server-relative links: `/web/<project>/page.html`
- Never use absolute URLs with localhost
- For single-page apps, use hash-based routing (`#/page`) or manage state in React

### User Settings
- Use **localStorage** to remember user settings and choices
- Examples: language preference, form progress, theme preference

## API Data Storage

API endpoints can read and write data in the project directory. Common patterns:
- Store form submissions in `data/submissions.json`
- Store user feedback in `data/feedback.json`
- Read configuration from `data/config.json`

The API has full access to the project directory, enabling:
- Web questionnaires that write results to the project folder
- Dashboards that read from project data files
- Forms that trigger project workflows

## Hot Reload

- **Static files**: Edit HTML/CSS/JS, refresh the browser
- **API endpoints**: Edit the Python file, the server detects changes and reloads the module automatically on the next request

## Notes

- The website is **public** -- no authentication required
- Always use `charset=utf-8` for proper encoding of non-ASCII characters
- Test the website by opening `/web/<project>/` in a browser
- The `web/` subdirectory is separate from other project directories like `data/`, `out/`, etc.
