LOCAL_WIN='C:\GitHub\claude-multitenant\workspace'
MSYS_NO_PATHCONV=1 docker run -d \
  --name claude-code \
  -v "$LOCAL_WIN":/workspace \
  -w /workspace \
  --user node \
  claude-code \
  tail -f /dev/null