# This is an example for a dynamically created api endpoint by the agent
# which must be located in workspace/<project name>/api
# the filename becomes the endpoint's name, e. g. /api/animals
# The webserver is hot-reloading, so endpoints can be created by the agent on the fly

SUPPORTED_METHODS = ["GET", "POST"]

def handle(request):
    if request.method == "GET":
        return {"animals": [{"id": 1, "name": "Mia Cat"}]}
    data = request.get_json(silent=True) or {}
    return {"status": "created", "payload": data}