# Etienne - Headless Claude Code

<img src="/docs/images/etienne-logo.png" alt="Etienne Logo" width="200">

How to use Claude Code 2.0 in non-interactive mode to build a agent engine for virtual collaborator use cases.

Contains a node.js/nest.js backend and React/Vite frontend which operate on an existing Claude Code 2.0 Docker devcontainer.

An example for learning the internals, integrations and configuration details of Claude Code with the "-p" command line parameter in multi-tenant scenarios.

## Architecture
<img src="/docs/images/building-blocks.jpg" alt="Architecture Diagram" width="500">

## Demo
[![Youtube Video](https://img.youtube.com/vi/zjoiCkf6LhM/0.jpg)](https://www.youtube.com/watch?v=zjoiCkf6LhM)

## SETUP

### API Keys
We use **Anthropic Sonnet 4.5** via an console account (default). If you want to switch to OpenAI then you need to add an OpenAI API account and your preferred model as well.

You need to create an .env file inside the backend directory:
```
# Anthropic API Key (used for direct Claude API calls)
ANTHROPIC_API_KEY=sk-ant-api03-...AA

# OpenAI Configuration via our custom proxy (used when aiModel=openai)
# Claude Code calls our proxy at port 6060, which translates to OpenAI API
ANTHROPIC_MODEL=gpt-4.1-mini
ANTHROPIC_BASE_URL=http://host.docker.internal:6060/api/modelproxy
ANTHROPIC_AUTH_TOKEN=sk-ant-api03-...AA

# OpenAI API settings (used by our proxy service to call OpenAI)
OPENAI_API_KEY=sk-proj-...MsA
OPENAI_BASE_URL=https://api.openai.com/v1
```

## Install Claude Code 2.0 inside a docker container
The name of the container needs to be claude-code (this is the entrypoint for the backend).
You will find a dockerfile with pre-installed python and pip libs in this project - this enables your agents to write and
execute Python 3.x scripts when solving problems.

Of course the container should be running when you start up the services of Etienne.

### Starting up the services
Start the backend on :6060
```
cd backend
npm i
npm run dev
```
Start the frontend on :5000
```
cd frontend
npm i
npm run dev
```
Then **open your browser** with http://localhost:5000