# Onboarding

Onboarding is a new component onboarding.jsx in the frontend project. It is displayed fullscreen. 

## Checking the system status
When the frontend is started up it checks whether a .env file exists in the backend project by calling GET /api/configuration. If this API call returns a 404 the onboarding component must be displayed.

## Process Manager
To check, stop and start services we need a new backend service process-manager. 

It performs shell commands. 

It operates on a services.json file which lists the available services:
```
{
  "services": [
    { "name": "webserver", 
      "directory": "c:\servers\webserver",
      "startCommandBash": "npm run dev"
    }
  ]
}
```
It exposes API methods like:
* GET /api/process-manager  (lists available services)
* GET /api/process-manager/<service name> (returns status "running" or "stopped")
* POST /api/process-manager/<service name> (starts or stops a service)

Get the info from existing /start-scripts directory (excluding frontend and backend)

## Onboarding process

The onboarding process is a sequential process with four steps which use this screen layout with a white background color:

|-----------------------------------------------------------|
|                 Step name                                 |
|-----------------------------------------------------------|
|   Step image              |        Step Actions           |
|-----------------------------------------------------------|
|   Etienne's explanation   |        Next Action Button     |
|-----------------------------------------------------------|

The component takes the full screen height and width. It has no app bar.

Step name is displayed centered with orange color font on #efefef background.

Etienne's explanation can contain markdown.

Step image is displayed in original size horizontally centered and bottom aligned vertically.

Next Action Button displays a right arrow icon with the step name of the next step.

Next action button is disabled until all actions are fullfilled.

### Step 1: What is Etienne?

Step image: /public/etienne-waving-color.png

Etienne's explanation:
```
Hello my name is Etienne.
I am a general AI assistant based on the Anthropic Agent SDK. I can help you when working with files and complex data. You need to copy data into our workspace, so I am able to see them.
```

Step Actions:
* Enter workspace path: <text input with placeholder c:\data\etienne-workspace>
  Description: Etienne has access to this directory only.

Next Action Button is unlocked when user enters text > 3 characters

### Step 2: Connect to an AI model

Step image: /public/claude-needs-charging-color.png

Etienne's explanation:
```
I am smart but small - I need a capable AI model to carry me on my missions.
```

Step Actions:
* Enter Anthropic API key: <text input with placeholder sk-ant-..>
  Description: You can create an account on https://console.anthropic.com

Next Action Button is unlocked when we use the backend's /api/configuration POST method to set the workspace path and the anthropic API key and then try to call /api/health/model endpoint which should return 200 and "healthy": true

### Step 3: What is Etienne?

Step image: /public/claude-is-charged-color.png

Etienne's explanation:
```
Great, we're connected! I can use several local services which store their data in our workspace. So I can remember things and structure complex problems.
```

Step Actions: Several Services - each with an activated toggle switch.
* Knowledge Graph
  Description: A RDF store to hold semantic relations between data objects
* Vector Store
  Description: A fulltext index using embeddings to find similar data
* Internal MCPs
  Description: A few useful sample tools
* A2A Registry & Sample Agents
  Description: Contains two external agents and a list for discovery
* Web Server
  Description: Allows Etienne to create and expose API endpoints. The server is capable of hot-reloading.

Next action button is always unlocked. Pressing it uses the /api/process-manager endpoints to start the selected services. If all selected services are reported by the process-manager to be running we continue to step 4 - otherwise the error is displayed in a small section below the server in the list.

### Step 4: Ready to rumble!

Step image: /public/claude-is-walking-color.png

Etienne's explanation:
```
I organize all my work in separate project directories. This allows me to stay focused and optimize my memory to one task at hand. We can have several sessions in one project.
```

Step Actions:
* Enter project name: <text input with placeholder sample-project>
  Description: This is a directory inside the workspace folder. only numbers, lower-case characters and - are allowed.

Next action button creates the project using the backend API, sets it as the current project so it is loaded by the frontend and then moves to the default page.


