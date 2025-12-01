# Scrapbook: Intent Management System

Our intent management system captures the intent of the user for a project. The user can 
* organize, 
* prioritize and 
* focus 
the basic ideas of the project. We must work visually encouraging and support drag & drop and quick editing wherever possible in the frontend.

There is always a root mindmap node with a description which frames the context, example:
----------
Mindmap Root Node: "Building a House"
Description: "I want to build a house for me, my wife and two little children and our cat. It should have a cozy familiar atmosphere."
----------

Then the user can add Category nodes to the root node like:
----------
Category: "Living Room"
Category: "Masterbedroom & Bath"
Category: "Child 1 Room"
Category: "Child 2 Room"
Category: "Kitchen"
--------

Category node names are unique which is enforced when they are entered by the user.

The user then can add subcategories to the categories and so on. Each node can have optional images attached. 

Because the user can add images to the components we call this feature the scrapbook. For example the user can add add subcategory nodes of "fridges" to the "Kitchen" category to compare the features, prices and availability of some fridges. To get a better understanding of the items the uploaded images help visually.

Scrapbook has the following features:
1. A scrapbook.jsx React component in the frontend
2. A scrapbook service in the backend which provides the API endpoints
3. Some scrapbook MCP tools which allows agents to use the scrapbook

The user can call the scrapbook component from the project menu which has a tile with the image scrapbook.jpg and opens a new tab "Scrapbook" in the preview pane. The tab content area shows the scrapbook.jsx component.

## Scrapbook component in the frontend

The scrapbook component has two tabs "Mindmap" and "Topics".

The mindmap shows the Mindmap nodes which are expandable with a right aligned caret button.

### Sample data option button
There is a small context menu right aligned with an item "Use example data" which intializes the knowledge graph with the "Building a House" example. Add 3 to 5 subcategories to ech of the categories of the toot node.

### Rendering of a node

A node is rendered as a rounded rectangle with the following components:
* Row 1: Drag Handle, Title, Open/Close caret icon button (right aligned)
* Row 2: the first 30 characters of the description, context menu vertical elipsis icon button (right aligned)
* Row 3: a 40px width rounded rectangle (border radius 50%) which is initally empty. the rectangle is centered horizontally and overlaps 50% with the lower border of the node rectangle. A icon can be assigned when clicking on the rounded rectangle: if the user clicks a modal dialog is shown containing a text input line. When the user enters characters the icon set (npm package: react-icons) is searched and matching icons are displayed below the text input box (2 rows with 15 icons). If the user clicks on an icon it is selected as icon for the node and stored in the rdf data.

The context menu is the standard mui v7 menu with thes items:
* Edit: Brings up the modal dialog from "Topics"
* Delete: Deletes the node with all subnodes after a mui v7 confirmation dialog (root cannot be deleted)

The root node has a 3px solid border with 6px border radius. The first level categories have a 2 px solid border. The second level subcategories have a 1 px solid border and all deeper categories have no border.

There is a color coding for border and text color:
* normal items: black
* prioritized/attention items: 10 light blue - 1 dark blue border and a 30% lighter background of the node rectangle
* items without attention: dark gray
* active item: border color "gold", pale yellow rod as background color

The font size inside the node is 14px Roboto font.

If the user clicks on the node:
1. The node is selected as active (there can be only one active node at a time) 
2. the tab switches to topics tab.

### Rendering of topics

A topic is rendered as sorted list of direct child nodes of the selected node as a table.

The table displays the node title in the first column, a thumbnail of the first image in the second column and then the other properties of the node in the other rows.

The user can sort the table by priority or by creation timestamp of the nodes.

The user can edit existing lines in a modal dialog which also contains a drag & drop area for uploading images.

The user can add a new line to the table and enter the information in a modal dialog (no inline editing in the table!). The new line is of course stored in the RDF graph.

Uploaded images are stored in the <workspace>/<project name>/scrapbook/images directory.

Added, modified or deleted nodes are immediatelly updated in the "Mindmap" tab content.

The user can export the table as an MS Excel file.

### React Flow as base UI component

We will use react flow in the community edition - we never use PRO features.

Feature Overview: https://reactflow.dev/examples/overview

Read the following techniques:
1. Custom Nodes https://reactflow.dev/examples/nodes/custom-node
2. Node Toolbar https://reactflow.dev/examples/nodes/node-toolbar
3. Drag Handle https://reactflow.dev/examples/nodes/drag-handle 

The user can rearrange the nodes on the canvas, open and close child nodes and change the zoom ration. All these settings are remembered in the file <workspace>/<project name>/.etienne/scrapbook.json

## Scrapbook service in the backend

The scrapbook service is implemented in the backend/src/scrapbook directory.

Each project has a single knowledge graph in the the project's RDF store. So we must always pay attention to store the nodes in the current project.

There are API endpoints /scrapbook, like the one to rembember the canvas settings in  the file <workspace>/<project name>/.etienne/scrapbook.json

### RDF store as technical store

The scrapbook items will be stored as RDF triples in quadstore. Read backend/src/knowledge-graph/knowledge-graph.service.ts as example how we use it.

### RDF-Based Personal Research Mindmap System

#### System Intent

A knowledge graph structure for managing personal research topics as an interconnected mindmap. The system serves as a visual, priority-driven scratchpad where:

- **Priority** indicates importance/urgency of topics
- **Attention Weight** reflects current research focus direction
- **Images** provide visual memory aids and context
- **Timestamps** track when topics were last updated
- **Hierarchical structure** organizes knowledge from themes to specific concepts

#### Core Structure

##### Node Types (Hierarchical)
```turtle
:MindMapNode a owl:Class .
    :ProjectTheme rdfs:subClassOf :MindMapNode .      # Top-level focus areas
    :Category rdfs:subClassOf :MindMapNode .          # Major subdivisions
    :Subcategory rdfs:subClassOf :MindMapNode .       # Detailed breakdowns
    :Concept rdfs:subClassOf :MindMapNode .           # Specific ideas
    :Attribute rdfs:subClassOf :MindMapNode .         # Properties/characteristics
```

##### Core Properties (Every Node Has These)
```turtle
# Essential metadata
rdfs:label          # Human-readable name
:priority           # Integer 1-10 (10 = highest importance)
:attentionWeight    # Decimal 0.01-1.00 (current relevance)
:updatedAt          # ISO datetime of last modification

# Optional enrichment
:hasImage           # URL to visual representation
:imageAltText       # Accessibility description
:description        # Detailed explanation
```

##### Relationship Properties
```turtle
# Hierarchical relationships
:hasCategory        # Theme → Category
:hasSubcategory     # Category → Subcategory
:belongsToTheme     # Category → Theme
:isPartOf          # General part-whole relationship

# Associative relationships
:relatedTo         # General semantic connection
:influences        # Causal/impact relationship
:requires          # Dependency relationship
:similarTo         # Similarity relationship
```

#### Complete Example: Personal Research Setup

```turtle
# Main research theme
:aiSafety a :ProjectTheme ;
    rdfs:label "AI Safety Research" ;
    :priority 10 ;
    :attentionWeight 1.00 ;
    :updatedAt "2025-11-28T15:30:00Z"^^xsd:dateTime ;
    :hasImage <https://example.com/images/ai_safety_overview.png> ;
    :imageAltText "AI safety research landscape diagram" ;
    :description "Understanding risks and mitigation strategies for advanced AI systems" ;
    :hasCategory :alignmentProblem, :robustness, :interpretability .

# Major categories
:alignmentProblem a :Category ;
    rdfs:label "Alignment Problem" ;
    :belongsToTheme :aiSafety ;
    :priority 9 ;
    :attentionWeight 0.85 ;
    :updatedAt "2025-11-28T14:20:00Z"^^xsd:dateTime ;
    :hasImage <https://example.com/images/alignment_diagram.jpg> ;
    :hasImage <https://example.com/images/reward_hacking.png> ;
    :imageAltText "Illustration of AI alignment challenges" ;
    :hasSubcategory :rewardHacking, :goalMisalignment .

:robustness a :Category ;
    rdfs:label "AI Robustness" ;
    :belongsToTheme :aiSafety ;
    :priority 7 ;
    :attentionWeight 0.60 ;
    :updatedAt "2025-11-27T11:45:00Z"^^xsd:dateTime ;
    :hasImage <https://example.com/images/adversarial_examples.png> ;
    :hasSubcategory :adversarialAttacks, :distributionShift .

:interpretability a :Category ;
    rdfs:label "AI Interpretability" ;
    :belongsToTheme :aiSafety ;
    :priority 6 ;
    :attentionWeight 0.40 ;
    :updatedAt "2025-11-26T09:15:00Z"^^xsd:dateTime ;
    :hasImage <https://example.com/images/attention_visualization.jpg> ;
    :hasSubcategory :mechanisticInterpretability, :postHocExplanation .

# Detailed subcategories
:rewardHacking a :Subcategory ;
    rdfs:label "Reward Hacking" ;
    :isPartOf :alignmentProblem ;
    :priority 8 ;
    :attentionWeight 0.75 ;
    :updatedAt "2025-11-28T13:10:00Z"^^xsd:dateTime ;
    :hasImage <https://example.com/images/reward_hacking_examples.png> ;
    :description "When AI systems find unexpected ways to maximize rewards" ;
    :relatedTo :goalMisalignment .

:adversarialAttacks a :Subcategory ;
    rdfs:label "Adversarial Attacks" ;
    :isPartOf :robustness ;
    :priority 5 ;
    :attentionWeight 0.30 ;
    :updatedAt "2025-11-25T16:30:00Z"^^xsd:dateTime ;
    :hasImage <https://example.com/images/adversarial_perturbations.jpg> ;
    :imageAltText "Examples of adversarial perturbations on images" .

# Cross-domain connections
:goalMisalignment :influences :rewardHacking .
:mechanisticInterpretability :requires :robustness .
:adversarialAttacks :relatedTo :distributionShift .
```

#### Key Usage Patterns

##### Research Focus Queries
```sparql
# What should I focus on next?
SELECT ?node ?label ?priority ?attention WHERE {
    ?node rdfs:label ?label ;
          :priority ?priority ;
          :attentionWeight ?attention .
    FILTER(?priority >= 7 && ?attention >= 0.50)
}
ORDER BY DESC(?priority) DESC(?attention)
```

##### Visual Content Discovery
```sparql
# Find all topics with multiple images
SELECT ?node ?label (COUNT(?image) AS ?imageCount) WHERE {
    ?node rdfs:label ?label ;
          :hasImage ?image .
}
GROUP BY ?node ?label
HAVING (COUNT(?image) > 1)
```

##### Recent Activity Tracking
```sparql
# What have I worked on recently?
SELECT ?node ?label ?updated ?priority WHERE {
    ?node rdfs:label ?label ;
          :updatedAt ?updated ;
          :priority ?priority .
    FILTER(?updated >= "2025-11-27T00:00:00Z"^^xsd:dateTime)
}
ORDER BY DESC(?updated)
```

##### Knowledge Navigation
```sparql
# Explore connections from high-attention topics
SELECT ?topic ?relation ?connected WHERE {
    ?topic :attentionWeight ?weight ;
           rdfs:label ?topicLabel .
    ?topic ?relation ?connected .
    ?connected rdfs:label ?connectedLabel .
    FILTER(?weight >= 0.70 && 
           ?relation IN (:relatedTo, :influences, :requires))
}
```

We need to add a property "icon-name" for eacht category.

#### System Benefits

1. **Flexible Hierarchy**: Can model any research domain from broad themes to specific details
2. **Attention Management**: Track and shift focus dynamically across topics
3. **Visual Enhancement**: Images provide context and improve memory retention
4. **Priority Awareness**: Always know what's most important to work on
5. **Temporal Tracking**: Understand research activity patterns over time
6. **Semantic Connections**: Discover relationships between different research areas
7. **Query Power**: Find information by priority, attention, recency, or connections
8. **Extensible**: Easy to add new properties or node types as research evolves

This structure serves as a personal research command center, helping you navigate complex knowledge domains while maintaining awareness of priorities, current focus, and visual context.

## Scrapbook MCP tools

The tools allow the AI agents to understand the content of the knowledge graph. The tools internally read the knowledge graph recursively, create a markdown description and return it.

We add the new tools a a separate class in the existing MCP implementation.

### Tools

#### scrapbook_describe_node(category node name: [optional]str):
category node name is case insensitive and searches the RDF store recursively. If category node name is empty this means we will return the full scrapbook content.

We use the markdown structure levels # to ##### to preserve the structure. We also translate numerical properties in sentences, e. g. "priority": 10 --> "This is of highest priority.".

#### scrapbook_add_node(parent node name: str, description: str)
Gives the user's description of a new string, translates it to RDF representation and stores it under the parent node. If there are mandatory fields missing the method returns "Node could not be created because: * <reason 1> * <reason 2> ..". So the AI agent can get these properties from the user
