# Onboarding agent Seed

I want to create a new seed project which behaves differently for users in the role "user" and "guest":

* for user role the agent acts as a knowledge conserver: the user provides expert knowledge in form of uploaded documents or chat input. this input is structured into the wiki, indexed in RAG, etc.
* for guest role the agent acts as a personal knowledge trainer: the user is guided by the agent through a personalized learning path

Our agent is meant as a knowledge transfer tool for new employees which must be onboarded quickly and individual.

The onboarding agent uses the project directory for an individual role in the company: a sales employee onboarding project is a different project folder than a HR employee onboarding project.

For this project we must implement a way that the agent can bring up documents into the workspace to be displayed in the previewer tab, like emitting a <preview:path/filename/> tag in the response which then is parsed by the frontend.

## User progress

If a user is logged in in the role "user" the agent keeps track of its progress with the login name. therefore we must extend the mission (claude.md) with 2 variables inserted from oauth login (user_name and user_role).

The progress is logged in the project folder subdirectory progress/<user_name>.progress.json

Typically we go through these phases:

1. Your Role in the company 
1.1. Your Responsibility
1.2. Your Colleagues
1.3. ...
2. What our Company does
2.1. Products you need to know
2.2. Manufacturing process
2.3. ...
3. Applications you need to know
3.1. SAP Fertigung & Produktion MD04
3.2. SAP Fertigung & Produktion COGI
3.3. ...

The progress should be visualized with checkmarks.

This is a two column layout: left column ToC and if there are Q/A items recorded the user can select a item in the toc and in the right column the questions and answers are displayed. This is the individualized learning path.

## User questions & Agent answers

The user can ask the agent questions in the chat anytime and does not need to progress sequentially - so the user can start with 2. What our company does withouth having completed 1. Your Role in the company

The important feature is that the agent presents answers to users' questions and records these in the user progress: so any question in e. g. in the context of 2.2. manufacturing process answered, should be recorded in the JSON below the 2.2. item in a Q/A section (we store the complete markdown of the response). The agent can also produce example files in the workspace dynamically additionally to a response: these are stored in examples/ and are also linked as a file[] in the Q/A section.

## "What's next?" / User guidance

The agent is a pro-active personal trainer and suggest the next topic from the progress file.

## Personal progress

If the user asks about progress the agent brings up the <user_name>.progress.json file with a special file preview renderer MCP UI. It visualizes the json file as a nicely styled (blue theme) progress bar. 

## General knowledge structure
In the workspace directory documents/ there are RAG indexed PDFs, Word Documents and other typicall office formats. They form one base of the knowledge base.

In the workspace directory wiki/ there is the auto-wiki skill managed wiki which serves as a structured memory of the expert knowledge.

## Training by the expert (=role "user")

During the training the agent tries to produce a wiki structure from all the input provided by the expert via the documents/ folder and in the chat.

The expert can add pages to the wiki manually. The content of the wiki frames the structure and size of the user progress, e. g. in the wiki there should be a page and subpages for 3.1. SAP Fertigung & Produktion MD04 in the example. 

The agent can suggest additional info it got via web_query or web_fetch tools.

## Explanations from the agent (=role "guest")

The agents formulates the answers to user questions adopted to the user's understanding and prior knowledge. This requires the agent to ask the user a few questions in the beginning and remembering them in .progress.json file as a  non-displayed baseline for formulating answers. E. g. the company could be German speaking, but the new employee only speaks English - so the agent should translate everything to English to avoid understanding gaps caused by language.

For explaining things the agent can bring up items in the preview pane: PDFs, Images, Excel-Example Files etc. This is the two column tutoring environment:
1. User asks in chat
2. Agent answers in chat and optionally brings up one item in the preview pane
3. Agent internally records Q/A
4. User acknowledges understanding or asks follow up questions
5. ...

## Testing the knowledge

There should be a little quiz whenever the agent sees a main topic (like 1. or 2. has been finished by the user). It should then actively bring up a little interactive Quiz with 4 - 9 multiple choice questions created on the fly as HTML file using MUI REACT components with default theme. Questions should be vertically and horizontally centered.


