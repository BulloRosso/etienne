# Skill Store

I want to create a new feature skill store which enable the admin role to manage the skills inside the /skill-repository using a new frontend component.

We need to extend the metadata inside a skill directory by adding an optional dependency file .dependencies.json. It contains the following information:

* Required binaries/packages separated by package managers (npm | pypi)
* Required environment variables (with description and example format)

Also there can be a optional .metadata.json. It contains things like:
* Creator (name, email)
* Semantic version (e. g. v.1.0)
* category tags
* comments 
* known issues (description and optional ticketID)

Inside the skill directory there can be a thumbnail.png which will be displaced as a 50px width / 50px height image for the skill in lists.

## Backend API

Backend API is only accessible in the admin role. The user can upload a zip file which contains SKILL.md and all the other files. The upload can be either 
* a new file if the user is in the catalog and has admin role
* a update file if the user is in the settings modal and has user role
Update files are stored inside a separate folder for later review by the admin. 

There's a function detect_modifications(<project skill>) which compares whether the repository in the project is different from the current in the project. We compare all files inside the skill directory to find out
* The skill was updated in the repository (newer semantic version in .metatdata.json) --> the API returns "status": "updated" and the list of files which are different in size
* The skill was modified in the project (same semantic version in .metadata.json) --> the API returns "status": "refined" and the list of files which are different in size

There's a function check_dependencies(<project skill>) which checks the environment and the installed packages. If violations are detected they are only reported by this function - no package installation!


## Frontend 

Skill store is invoked as a new tile in the project menu and only visible for the admin role.

The SkillCatalog component has 3 tabs "Catalog", "Skill", "Requests for Review". The tab content of "Catalog" lists the available skills from skill-repository as a tile view (png icon + title). If there's no png thumbnail we use the standard atom icon. There's a filter box on top which allows to filter for substring case-insensitive in the skill title. Skills are always listed in alphabetical order.

When the user klicks a skill tile the component switches to the Skill tab. In the skill tab the user can see
* Title and description of the skill (read-only)
* input fields for .dependencies.json 
* input fields for .metadata.json 
A left aligned "Delete Skill" button and right aligned "Upload .zip" and "Save" buttons on the bottom.

The "Requests for Review" tab content lists all the zip files uploaded by the users listed by the date they were received. The administrator can click a zip file to review it outside of the application. If the external review was successfull there's a right aligned vertical elipsis for each item with the menu items "Reject/Delete" and "Accept as new version". The new version from the zip overwrites the existing skill directory and after that in .metadata.json the semantic version is updated automatically by incrementing the current number with .1

The existing SkillSettings.jsx and SkillSelector.jsx components must be adjusted to:
* display the thumbnail png if available instead the atom icon
* if the skill was updated or modified (use a orange right aligned badge)
* if the skill was updated or modified where's a right aligned vertical elipsis icon button which opens a menu which gives the user to eiter update the project file from the repository or send the modified version to the administrator for review

Whenever a new skill is installed (eiter with the new project modal or the settings modal) internally the check_dependencies function is evaluated: if any missing packages or environment variables are detected these are recorded in a file workspace/<project name>/.etienne/skill-dependencies.json per skill. If records the entered secrets and the missing secrets and packages.

There is a new tab "API Keys/Tokens" as 4th tab in the skill settings dialog where there's a orange bullet indicator if any secrets are missing and/or any packages need to be installed.
There are all secrets listed per skill as recorded in .etienne/skill-dependencies.json and the user can edit or enter required api keys. If packages are missing the list is displayed with a "Install now" action button.