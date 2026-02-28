# I18n for Frontend Project

Our fronend is currently in English language with hardcoded text. I want to introduce dynamic translations using variables/placeholders with english as the default.

**Important** We don't modify data in the backend and we don't introduce i18n components in the backend project!

## React Library

We will use react-18next with the following parameters:

* automatic language detection using browser locale (no language switcher component in the UI)
* one JSON file per language which is loaded initially on demand
* english is the default language
* we support de,en(default),chinese(mandarin)

## How to introduce the Placeholders

1. Extract all english labels in the frontend files and components and order them in the JSON file en.json in the public folder i18n
2. Use prefixes for the component or page names, so we can clearly see where the components are from
3. Use the prefix common. for all labels which occur more than once (like 'Cancel','OK')
4. If the en.json file is complete translate in the other supported languages
5. Introduce the language selection on app load