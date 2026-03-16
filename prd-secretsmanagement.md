# Introduce Secrets management

Currently sensitive information like API keys are managed in the the backend's .env file. These keys are available at runtime to the model and can be exposed.

We want to create a new root directory /secrets-manager which hosts a new service to manage these secrets similar to Azure Keyvault or other solutions. We need to make sure they have got no cloud dependencies and are MIT licensed.

## Implementation of first Secret Provider

To keep the implementation flexible we need to introduce an abstraction layer for secrets manager in backend/src/secrets-manager which can use different providers which are determined by the .env variable SECRET_VAULT_PROVIDER 

We will use https://github.com/openbao/openbao as the first provider. Please set up the instance in the root directory /secrets-manager first.

Then create the abstraction layer and add a first provider in backend/src/secrets-manager/providers/openbao using openbao.

Find all usage of sensitive API keys in our code and replace by calls to the abstraction layer.

## Make secrets manager known to process manager

Add the secrets manager service and port to the list of known services for backend/src/process-manager

## Frontend warning

In the frontend use a public endpoint for running backend services of the process manager API to check whether secrets manager AND oauth-server processes are running as a first step on startup (before showing the login page).

Report an error using the public/claude-needs-charging.png image as a side illustration. Add a start services button for the user there to use process-manager to start both backend services.

