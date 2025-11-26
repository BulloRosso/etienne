# Context scoping and tagging

I want to introduce a concept from notebook llm to the workspace:
----------
Context scoping and cell tagging in notebook-style agents means the agent explicitly declares what part of the workspace it is reasoning about, instead of letting the whole notebook become implicit context.
-------------

Our project folder <workspace>/<project name> is comparable to a notebook. But notebook workbooks are linear sequences like in a python notebook with interleaved blocks of markdown (promts) and code.

## Goal
I want to enable the user to **precisely scope the context** for a prompt. It should be done by
* applying tags to files via the file explorer
* being able to define a tag on data in the vector store
* being able to define a tag on data in the rdf store (knowledge graph)

These three data input items should be composable with UI support into named context with simple tagging.

## Examples from Notebook LLM

Example below shows the minimal pattern.

Example: Cell tagging for context control

Cell 1 — Data ingestion (tag: data.load)

# tag: data.load
import pandas as pd

df_customers = pd.read_csv("customers.csv")
df_orders = pd.read_csv("orders.csv")


Cell 2 — Declare context scope (tag: context.use:customers)

# tag: context.use:customers
Use only the dataframe `df_customers` for the next reasoning step.
Ignore `df_orders` unless explicitly referenced.
Summarize customer risk segments.


Cell 3 — Agent reasoning limited to declared scope

# tag: analysis
High-risk customers are those with:
– outstanding balance > 10k  
– last payment older than 180 days

Proceed to compute the flagged subset.


Cell 4 — Execution (tag: exec:customers.risk)

# tag: exec:customers.risk
high_risk = df_customers[
    (df_customers.outstanding > 10_000) &
    (df_customers.last_payment_days > 180)
]
high_risk.head()


Here the tags enforce:

The agent must treat df_customers as the only valid context (scoped context).

The agent must operate only within the task attached to exec:customers.risk.

No accidental use of variables or tables outside that declared scope.

Example: Multi-context scoping (KG + embeddings + metadata)

Cell 1 — Load sources (tag: load.sources)

# tag: load.sources
kg = load_neo4j()
vec = load_pgvector()
docs = load_metadata_index()


Cell 2 — Declare scoped context (tag: context.use:vector-search)

# tag: context.use:vector-search
Use only the `vec` vector store for this step.
Do NOT access kg or docs.
Plan a similarity search for the query: "carbon seal leakage causes".


Cell 3 — Execute vector search (tag: exec:vec.search)

# tag: exec:vec.search
results = vec.similarity_search("carbon seal leakage causes", top_k=20)
results


Cell 4 — Switch context (tag: context.use:kg-filter)

# tag: context.use:kg-filter
Now restrict reasoning to the knowledge graph `kg`.
Take the previous vector results as input IDs only.
Filter them by whether they connect to a `Material` node.


This isolates stages:

* Stage 1: vector store only
* Stage 2: KG only
* Prevents the LLM from blending all memory into one flattened prompt
* Improves correctness and interpretability
* Produces clean, audit-ready execution traces