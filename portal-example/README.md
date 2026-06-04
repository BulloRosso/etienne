# Portal Example — Lumitec LED Onboarding

A minimal React + MUI portal that wraps Etienne for the `lumitec-led-onboarding`
project. Serves a branded welcome page with a single **Start Onboarding Agent**
button that opens the Etienne UI at http://localhost:5000.

## Run

```bash
cd portal-example
npm install
npm run dev
```

The portal runs on http://localhost:5001 with base path `/app/`, so it is reachable at:

- http://localhost:5001/app — direct
- http://localhost:5000/app — via the Etienne Vite proxy (requires
  `PORTAL_APP_HOST=http://localhost:5001` in `frontend/.env` and a Vite
  restart)

## How it fits in

1. User opens http://localhost:5000 and logs in.
2. Etienne reads the active project's `.etienne/user-interface.json`. If
   `appDirectory` is set (here: `/app`), it redirects the browser to
   http://localhost:5000/app.
3. The Vite proxy forwards that request to http://localhost:5001/app — this
   portal renders.
4. Clicking **Start Onboarding Agent** sends the user back to
   http://localhost:5000 to interact with the agent.
5. A dashboard icon in Etienne's preview pane lets the user jump back to the
   portal at any time.

Fork this directory to build your own portal — only `src/App.jsx` needs
project-specific content.
