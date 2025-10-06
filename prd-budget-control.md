# Budget Control
We want the end user to be able to see and track the budget of AI inference used inside a project.

## Storage
The inference costs are tracked inside the file workspace/<project>/.etienne/costs.json. We record 
* timesteamp
* input tokens
* output tokens
* request costs in currency
* accumulated costs in currency

The JSON is sorted from newest to oldest item. So we have a mild optimization because when we append a new item at the top we only need to read the first existing item and add the current request costs to get the accumulated costs for the new item.

## Costs
In the backend .env file there are two items related to budget control:
* COSTS_CURRENCY_UNIT=EURO
* COSTS_PER_MIO_INPUT_TOKENS=<decimal for currency unit, e. g. per EURO>
* COSTS_PER_MIO_OUTPUT_TOKENS=<decimal for currency unit, e. g. per EURO>

## Backend
In the backend we have a separate src/budgetmonitoring controller and service.

After receiving a response from Claude Code we call an async method in the service passing input and output tokens. The method then calculates the costs using the COSTS_ entries in .env and updates the file workspace/<project>/.etienne/costs.json.

The backend emits a SSE event for the frontend to update the costs (so we don't have a separate API call for sync)

### Monitoring Settings
There is a file workspace/<project>/.etienne/budget-monitoring.settings.json which stores the current limit and whether budget monitoring is activated or not.

### API Endpoints
The costs controlle exposes endpoints for the frontend:
* GET api/budget-monitoring/<project>/current (used by the frontend to initalize the cost display in the app bar)
* GET api/budget-monitoring/<project>/all
* GET,POST api/budget-monitoring/<project>/settings

## Frontend
In the frontend we can enable or disable budget control in the settings menu in ProjectMenu.jsx. 

### Budget Indicator
If budget control is enabled for the project ther is a white icon 24 px right from the app bar title. We use the icon import { TbPercentage0 } from "react-icons/tb"; to visualize the current consumption. If no budget limit is set the TbPercentage0 icon is always used, otherwise we show progress towards the limit in 10% steps, e.g. TbPercentag20 for >=20% and <30% of the limit reached. The maximum is TbPercentage100 icon. Additionally if the limit has exceeded the color of the icon is yellow.

A click on the Budget Indicator opens a drawer from the left screen side to display the BudgetOverview.jsx component.

### Budget Overview
The budget overview is a dashboard visualizing the costs.json file for the project. On top it has three boxes:
* Current Costs with currency symbol
* Current limit with currency symbol (if limit is set)
* Number of requests (=items in costs.json)
After the three boxes we show the most recent ten items from cost.json:
* Input tokens
* Output tokens
* request costs with currency symbol
Below the items there is a right aligned "Budget Settings" button which opens a modal dialog to set:
* budget limit (which can be 0 or any decimal number)