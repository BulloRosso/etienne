# Create Dynamic MCP Tool

This skill enables you to create hot-reloadable Python MCP tools that are automatically discovered and served by the Etienne MCP server.

## When to Use This Skill

Use this skill when the user asks you to:
- Create a new MCP tool
- Build a custom tool for the agent
- Extend the agent's capabilities with Python
- Create a reusable function that should be available as an MCP tool

## Directory Convention

All Python MCP tools MUST be placed in the project's `.etienne/tools/` directory:

```
workspace/<project-name>/
└── .etienne/
    └── tools/
        ├── my_tool.py           # Your tool file
        ├── another_tool.py      # Another tool
        ├── requirements.txt     # Shared dependencies (auto-installed)
        └── .packages/           # Auto-installed packages (don't edit)
```

## Python Tool Template

Every tool MUST follow this exact structure:

```python
#!/usr/bin/env python3
"""
MCP Tool: tool_name_here
Description: Clear description of what this tool does
Input Schema:
    param1:
        type: string
        description: What this parameter does
        required: true
    param2:
        type: number
        description: Optional numeric parameter
        default: 10
    param3:
        type: string
        enum: [option1, option2, option3]
        description: Parameter with allowed values
"""

import json
import sys


def execute(args: dict) -> dict:
    """
    Main entry point for the tool.

    Args:
        args: Dictionary of input parameters from the MCP call

    Returns:
        Dictionary that will be JSON-serialized as the tool result
    """
    # Extract parameters
    param1 = args.get("param1")
    param2 = args.get("param2", 10)  # Use default if not provided

    # Implement your tool logic here
    result = do_something(param1, param2)

    # Return result as dictionary
    return {
        "success": True,
        "result": result,
        # Include any relevant output data
    }


def do_something(param1, param2):
    """Helper function for tool logic."""
    # Your implementation here
    return f"Processed {param1} with {param2}"


if __name__ == "__main__":
    # This block handles MCP execution via stdin/stdout
    input_data = json.loads(sys.stdin.read())
    result = execute(input_data)
    print(json.dumps(result))
```

## Docstring Metadata Format

The docstring at the top of your Python file MUST contain:

### Required Fields

| Field | Format | Example |
|-------|--------|---------|
| `MCP Tool:` | Single word, snake_case | `MCP Tool: weather_lookup` |
| `Description:` | One-line description | `Description: Fetches weather data for a city` |

### Input Schema (Optional but Recommended)

Define parameters using YAML-like indentation:

```
Input Schema:
    parameter_name:
        type: string|number|integer|boolean|array|object
        description: What this parameter does
        required: true|false
        enum: [value1, value2]  # Optional: allowed values
        default: default_value   # Optional: default if not provided
```

### Supported Types

- `string` - Text values
- `number` - Floating point numbers
- `integer` - Whole numbers
- `boolean` - true/false
- `array` - Lists (items type can be specified)
- `object` - Nested objects

## Tool Naming Convention

- Tool names use snake_case: `my_tool_name`
- The MCP server automatically adds `py_` prefix
- Example: `weather_lookup` becomes `py_weather_lookup`

## Dependencies

If your tool needs external packages:

1. Create or update `.etienne/tools/requirements.txt`:
   ```
   requests>=2.28.0
   pandas>=2.0.0
   numpy>=1.24.0
   ```

2. Dependencies are auto-installed when `requirements.txt` changes
3. Packages are installed to `.etienne/tools/.packages/`
4. Your tool can import them normally - `PYTHONPATH` is set automatically

## Environment Variables Available

Your tool receives these environment variables:

| Variable | Description |
|----------|-------------|
| `PROJECT_ROOT` | Absolute path to the project directory |
| `PYTHONPATH` | Includes `.packages` directory for imports |

## Error Handling

Return errors as structured data:

```python
def execute(args: dict) -> dict:
    required_param = args.get("required_param")

    if not required_param:
        return {
            "error": True,
            "message": "Missing required parameter: required_param"
        }

    try:
        result = risky_operation(required_param)
        return {"success": True, "result": result}
    except Exception as e:
        return {
            "error": True,
            "message": str(e),
            "type": type(e).__name__
        }
```

## Testing Your Tool

After creating a tool, it's immediately available. Test it by:

1. The tool appears in `tools/list` with name `py_<your_tool_name>`
2. Call it via MCP with appropriate arguments
3. Check the backend logs for execution details

## Hot-Reload Behavior

- **File created**: Tool available on next `tools/list` request
- **File modified**: Changes reflected on next `tools/list` request
- **File deleted**: Tool removed from next `tools/list` request
- **requirements.txt changed**: Auto pip install, then cache refresh

No server restart needed!

## Complete Example: Weather Tool

```python
#!/usr/bin/env python3
"""
MCP Tool: weather_lookup
Description: Fetches current weather information for a specified city using OpenWeatherMap API
Input Schema:
    city:
        type: string
        description: Name of the city to get weather for
        required: true
    units:
        type: string
        enum: [metric, imperial]
        description: Temperature units (metric=Celsius, imperial=Fahrenheit)
        default: metric
"""

import json
import os
import sys

import requests


def execute(args: dict) -> dict:
    """Fetch weather data for a city."""
    city = args.get("city")
    units = args.get("units", "metric")

    if not city:
        return {"error": True, "message": "City parameter is required"}

    # Get API key from environment or use demo key
    api_key = os.environ.get("OPENWEATHER_API_KEY", "demo")

    try:
        url = f"https://api.openweathermap.org/data/2.5/weather"
        params = {"q": city, "units": units, "appid": api_key}

        response = requests.get(url, params=params, timeout=10)
        response.raise_for_status()

        data = response.json()

        return {
            "success": True,
            "city": data["name"],
            "country": data["sys"]["country"],
            "temperature": data["main"]["temp"],
            "feels_like": data["main"]["feels_like"],
            "humidity": data["main"]["humidity"],
            "description": data["weather"][0]["description"],
            "units": "°C" if units == "metric" else "°F"
        }

    except requests.RequestException as e:
        return {"error": True, "message": f"API request failed: {str(e)}"}
    except KeyError as e:
        return {"error": True, "message": f"Unexpected API response format: {str(e)}"}


if __name__ == "__main__":
    input_data = json.loads(sys.stdin.read())
    result = execute(input_data)
    print(json.dumps(result))
```

With `requirements.txt`:
```
requests>=2.28.0
```

## Checklist Before Creating a Tool

- [ ] Tool file is in `.etienne/tools/` directory
- [ ] Filename ends with `.py` and doesn't start with `_`
- [ ] Docstring contains `MCP Tool:` with valid name
- [ ] Docstring contains `Description:`
- [ ] `execute(args)` function is defined
- [ ] `if __name__ == "__main__":` block handles stdin/stdout
- [ ] Returns dictionary (not raw values)
- [ ] External dependencies listed in `requirements.txt`
