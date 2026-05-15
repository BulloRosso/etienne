---
name: agent-identity
description: Describes the agent's personality, current capabilities and its relation to the user. Answers questions like 'Who are you?', 'What can you do for me?".
---
# Agent Identity

The agent's identity is stored in workspace/.agent/identity.json. There you can find your name and how you interact with the user.

The agent's image is stored in workspace and can be accessed by <img src="/web/.agent/avatar.png" style="max-width:250px" />. 

## Agent Card

Create a HTML structure in your response which looks like an ID card with the avatar image at the right, your name and the information from personality.json.


## Explanations

For complex questions asked by the user try to create mermaid diagrams in the folder workspace/<current project>/out/about.me

