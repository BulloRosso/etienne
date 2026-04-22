---
name: image-generation
description: >
  AI-powered image generation and editing using GPT Images 2.0 with thinking
  mode. Use this skill when the user wants to generate images, create
  illustrations, design infographics, edit photos, create consistent image
  series, or any visual content creation task. Triggers on phrases like
  "generate an image", "create a picture", "edit this image", "make an
  infographic", "design a series of images", "create illustrations for",
  "visualize this", or any request involving image creation or modification.
---

# Image Generation Skill

Generate and edit images using GPT Images 2.0 with **thinking mode**. This skill provides AI-powered visual content creation capabilities, from single images to consistent multi-image series.

---

## Activation

This skill activates when the user expresses intent to create or modify visual content. Trigger phrases include:

- "generate an image of ..."
- "create a picture / illustration / visual ..."
- "design an infographic about ..."
- "make a series of images for ..."
- "edit this image to ..."
- "modify / change the image so that ..."
- "create a banner / poster / diagram ..."
- "visualize this concept ..."
- "use this image as a reference and ..."

---

## Initial Interaction

When the user requests image generation, **always start by**:

1. **Acknowledge capabilities** — briefly explain what the tool can do:
   - Single image generation from text prompts
   - Consistent series of up to 8 images in one pass (e.g. storyboards, step-by-step guides)
   - Image editing using a guiding/reference image from the project
   - Knowledge-aware generation (the model knows about the world up to December 2025)
   - Especially strong for infographics, educational materials, and technical illustrations

2. **Ask for the aspect ratio** — present these options:

| Aspect Ratio | Size | Best For |
|-------------|------|----------|
| 1:1 (square) | `1024x1024` | Social media posts, icons, avatars |
| 3:2 (landscape) | `1536x1024` | Presentations, banners, wide scenes |
| 2:3 (portrait) | `1024x1536` | Posters, phone wallpapers, portraits |
| 2K square | `2048x2048` | High-res prints, detailed artwork |
| Auto | `auto` | Let the model decide based on content |

3. **Ask about quality preference** (optional — default to high if user doesn't specify):
   - **Low** — fast drafts, thumbnails, quick iterations
   - **Medium** — balanced quality and speed
   - **High** — final assets, maximum detail (default)

---

## Thinking Mode

The central innovation of GPT Images 2.0 is its **thinking mode**:

- The model **structures visual tasks** and plans the composition before generating
- It incorporates **web knowledge** (cutoff: December 2025) for accuracy in real-world subjects
- Produces significantly better results for **infographics, educational materials, and explanatory visuals**
- In series mode, thinking ensures **consistent characters, objects, and visual design** across all images
- The model maintains **content continuity** throughout a series

**When to emphasize thinking mode benefits to the user:**
- Infographics with accurate data or real-world references
- Educational step-by-step illustrations
- Technical diagrams that need factual accuracy
- Character-consistent storyboards or comic strips
- Any request where factual knowledge improves the result

---

## Available MCP Tools

### `generate_image`

Generate one or more images from a text prompt.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `project_name` | string | yes | The project directory name in the workspace |
| `prompt` | string | yes | Detailed text prompt describing the image(s) |
| `size` | string | no | Image dimensions (see aspect ratio table). Default: `auto` |
| `quality` | string | no | `low`, `medium`, `high`, or `auto`. Default: `high` |
| `n` | integer | no | Number of images (1-8). For n > 1, creates a consistent series. Default: `1` |

**Returns:** `{ success, images_generated, images_requested, files: [{path, size_bytes}], output_dir, revised_prompt }`

**Example — single image:**
```
generate_image({
  project_name: "my-project",
  prompt: "A modern flat-design infographic showing the water cycle, with labeled arrows for evaporation, condensation, and precipitation. Clean white background, blue and green color palette.",
  size: "1536x1024",
  quality: "high"
})
```

**Example — consistent series:**
```
generate_image({
  project_name: "my-project",
  prompt: "A 4-panel comic strip showing a robot learning to cook. Panel 1: robot reading a cookbook. Panel 2: robot chopping vegetables. Panel 3: robot stirring a pot with too much steam. Panel 4: robot proudly presenting a beautiful dish. Consistent robot character design throughout, warm kitchen setting, cartoon style.",
  size: "1536x1024",
  quality: "high",
  n: 4
})
```

### `edit_image`

Edit or modify an existing image using a text prompt.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `project_name` | string | yes | The project directory name in the workspace |
| `prompt` | string | yes | Edit instruction — describe what to change |
| `source_image` | string | yes | Path to source image relative to project (e.g. `images/photo.png`) |
| `size` | string | no | Output dimensions. Default: `auto` |
| `quality` | string | no | `low`, `medium`, `high`, or `auto`. Default: `high` |

**Returns:** `{ success, images_generated, files: [{path, size_bytes}], source_image, output_dir, revised_prompt }`

**Example:**
```
edit_image({
  project_name: "my-project",
  prompt: "Change the background to a sunset beach scene. Keep the person in the foreground exactly as they are.",
  source_image: "images/portrait.jpg",
  quality: "high"
})
```

---

## File Locations

| Purpose | Path |
|---------|------|
| Generated images (output) | `<project>/out/generated-images/` |
| Source/guiding images (input for editing) | `<project>/images/` |

- Generated files are named `img_<timestamp>_<index>.png`
- The output directory is created automatically if it does not exist
- Source images can be PNG, JPEG, WebP, or GIF

---

## Example Workflows

### Workflow 1: Single Image Generation

> **User:** "Create an illustration of a solar-powered house"

1. Ask for aspect ratio preference (suggest landscape 3:2 for architectural subjects).
2. Call `generate_image` with a detailed prompt including style, colors, and composition.
3. Report success and the file path so the user can view the result.
4. Ask if they'd like adjustments — if so, refine the prompt and generate again.

### Workflow 2: Consistent Image Series

> **User:** "Create a 4-step tutorial showing how to set up a tent"

1. Confirm aspect ratio (landscape works well for tutorials).
2. Call `generate_image` with `n: 4`, describing each step in the prompt while emphasizing visual consistency.
3. Report all generated file paths.
4. If any image in the series needs adjustment, regenerate with a refined prompt.

### Workflow 3: Image Editing with Guiding Image

> **User:** "I have a product photo in images/product.jpg — can you place it on a marble countertop?"

1. Verify the source image exists at the specified path.
2. Call `edit_image` with the source path and a prompt describing the desired change.
3. Report the output file path.
4. Offer to make further edits if needed.

### Workflow 4: Iterative Refinement

> **User:** "The image is good but make the text larger and change the background color to navy blue"

1. Since we cannot edit previously generated images in-place via the Responses API without a new call, call `generate_image` again with the refined prompt incorporating the feedback.
2. Alternatively, if the user wants to edit the previously generated image, use `edit_image` with the generated file as `source_image` (path: `out/generated-images/<filename>`).

### Workflow 5: Infographic / Educational Material

> **User:** "Create an infographic about the planets in our solar system"

1. Suggest portrait (2:3) or landscape (3:2) depending on density of content.
2. Emphasize that thinking mode will use real astronomical data for accuracy.
3. Craft a detailed prompt specifying layout, data points, and visual style.
4. Call `generate_image` with `quality: "high"`.

---

## Prompt Engineering Tips

When crafting prompts for the MCP tools:

1. **Be specific** — describe style, colors, composition, mood, lighting, and camera angle.
2. **For series** — describe the overall theme first, then individual image content. Explicitly mention what should remain consistent (characters, color palette, art style).
3. **For edits** — be precise about what to change AND what to preserve.
4. **For infographics** — specify layout structure (header, sections, data visualization types), color palette, and typography style.
5. **For text in images** — spell out the exact text to include. Note that text rendering, while improved, may not be pixel-perfect.
6. **Reference style** — use terms like "flat design", "watercolor", "photorealistic", "3D render", "minimalist line art", "retro pixel art" to guide the visual style.

---

## Error Handling

- **API key not configured**: The tool will report that `IMAGE_GENERATION_API_KEY` is not set. Inform the user that the backend needs to be configured.
- **Source image not found**: The tool reports the expected path. Ask the user to verify the file location or place the image in the project's `images/` folder.
- **Content policy**: Some prompts may be declined by the model's content filter. Suggest rephrasing the request.
- **Long generation time**: Complex prompts may take up to 2 minutes. The tool reports progress during generation.

---

## Cost Awareness

Image generation costs vary by quality and size:

| Quality | 1024x1024 | 1536x1024 | 1024x1536 |
|---------|-----------|-----------|-----------|
| Low | ~$0.006 | ~$0.005 | ~$0.005 |
| Medium | ~$0.053 | ~$0.041 | ~$0.041 |
| High | ~$0.211 | ~$0.165 | ~$0.165 |

For series (n images), multiply by the number of images. Use `quality: "low"` for quick drafts and iterations before committing to `"high"` for the final version.
