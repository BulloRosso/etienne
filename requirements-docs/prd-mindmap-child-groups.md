# Scrapbook Mindmap: Extended features

I want to introduce a grouping option for mindmap child nodes. Each of the children can be in 0 or 1 groupt. A group indicates a set of alternative options.

## Backend API
We need to introduce new API endpoints in the scrapbook service to assign nodes of the mindmap to agroup or remove nodes from a group. 

**Important**: A node can only be part of one group at a time!

The group is stored in the RDF store with this strategy,

### Modelling groups in the RDF graph

The cleanest solution uses intermediate "group" nodes that define the relationship semantics without changing your subcategory types:
turtle@prefix ex: <http://example.org/> .
@prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .
```
# Your main node
ex:nodeX a ex:Category .

# Alternative Group 1 (x1 OR x2)
ex:nodeX ex:hasChildGroup ex:group1 .
ex:group1 a ex:AlternativeGroup ;
    ex:hasMember ex:x1 ;
    ex:hasMember ex:x2 .

# Alternative Group 2 (x5 OR x6)
ex:nodeX ex:hasChildGroup ex:group2 .
ex:group2 a ex:AlternativeGroup ;
    ex:hasMember ex:x5 ;
    ex:hasMember ex:x6 .

# Required nodes (x3 AND x4)
ex:nodeX ex:hasChildGroup ex:group3 .
ex:group3 a ex:RequiredGroup ;
    ex:hasMember ex:x3 ;
    ex:hasMember ex:x4 .

# The subcategories retain their type
ex:x1 a ex:Subcategory .
ex:x2 a ex:Subcategory .
# ... etc
```
**Why this works well**:

* Subcategory types unchanged
* Clear semantics (Alternative vs Required)
* Easy to query: "give me all alternative groups under nodeX"
* Extensible (add cardinality constraints, priorities, etc.)

## Defining groups in the user interface

In the list view of the scrapbook modal dialog we need to introduce these features:
* a new column "Group" is introduced
* we must move the action icons of a line item into a context menu with a vertical elipsis icon button, the menut has 3 menu items "Edit", "Delete", "Remove from group" (greyed out if the item is not part of a group)
* by clicking on a list item the line is selected
* a click on an seleted line item deselects it
* if at least two items are selected a text input named "Group of alternatives" is displayed left of the settings icon. The default value is "Alternatives A". Left of the text input there's a "Set" button. If it is pressed the items are assigned to the group by the backend and the list is refreshed to update the "group" column
* the sort order should keep group items together while sorting the list by title ascending first

## Rendering
If a node is part of a group then the attention color is rendered in shades of orange instead of blue. So the user can see alternative options on the canvas