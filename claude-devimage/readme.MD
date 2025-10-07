# How to build and run the Dockerfile
This image should run Claude Code in headless mode (non-interactive). 

Intially it was built for Claude Code 2.0 in late 2025. When you build it it will pull the latest Claude Code version from npm (which might be good or bad).

## Rebuilding the image 
After you have modified the dockerfile:
```
docker build -t claude-code .
```
Then pick a folder for your workspace location on your computer and start the container with a mapped path:
```
LOCAL_WIN='C:\Data\GitHub\claude-multitenant\workspace'
MSYS_NO_PATHCONV=1 docker run -d \
  --name claude-code \
  -v "$LOCAL_WIN":/workspace \
  -w /workspace \
  --user node \
  claude-code \
  tail -f /dev/null
```
You will see the container id in the console as response and claude-code should be up and running.