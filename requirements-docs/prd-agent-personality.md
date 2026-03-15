# Agent Persona: Personality

In the frontend I want to create a modal dialog "AgentPersonaPersonality" as component.

It allows the user to edit/create the content of the file workspace/.agent/personality.json.

This file contains the following properties:

* "personaType": <name of the .zip in workspace/.agent-persona-repository --> see section "Persona Installation Process" in the document>
* Name (Min 3, max 35 characters)
* Description of the Avatar image
* "allowReviewNotificationsBetween": <text like "don't disturb me between 10pm and 8am">
* "communicationStyle": <text like "short and concise, keep to facts">
* "contactChannels": email (optional), teamsAccount (optional), telegramHandle (optional) with one of these being the prefered channel 
* "avoidAtAllCosts": <text like "never contact any of the suppliers directly">

The user can first describe how the avatar looks like and then he must press a button "Generate" which calls the OpenAI image edit API with a guidance image to produce a file workspace/.agent/avatar.png. The result is displayed in a fixed with 350px are side-by-side with the description. The user can change the description if he doesn't like the image and repeat this several times.

The modal dialog has a right aligned "Go!" action button which calls the API endpoint in the persona-manager to install the selected personaType

I also want to create a backend/src/persona-manager service which can install a persona and apply the settings/preferences made in the personality.json file.

## Avatar Image Creation

Use frontend/public/etienne-waving.png as the guidance image.

This is the API help - we must use the /v1/images/edits endpoint.

### OpenAI image editing API in TypeScript

**To generate images with a reference/guidance image, you must use the `images.edit()` method** — the `images.generate()` endpoint is text-only and does not accept image inputs. The edit endpoint (`POST /v1/images/edits`) paired with `gpt-image-1` (or the newer `gpt-image-1.5`) accepts up to 16 reference images, an optional alpha-channel mask, and a text prompt. Below is everything you need to wire this up correctly in TypeScript with the official `openai` npm package.

#### The only endpoint that accepts reference images

The OpenAI Images API has two main endpoints, and only one supports image input:

| Method | Endpoint | Accepts images? | Use case |
|--------|----------|-----------------|----------|
| `client.images.generate()` | `POST /v1/images/generations` | ❌ No | Text-to-image only |
| `client.images.edit()` | `POST /v1/images/edits` | ✅ Yes (1–16) | Editing, compositing, style transfer |

A common mistake is trying to pass a reference image to `images.generate()`. That endpoint has no `image` parameter at all. **You must use `images.edit()`** for any workflow involving a guidance or reference image. The models that support editing are **`gpt-image-1`**, **`gpt-image-1.5`**, `gpt-image-1-mini`, and the legacy `dall-e-2`. Notably, `dall-e-3` does *not* support the edits endpoint.

There is also an alternative path through the **Responses API** (`client.responses.create()` with `tools: [{ type: "image_generation" }]`), which allows passing images in a conversational context using models like `gpt-4.1` that delegate to GPT Image behind the scenes. This is better for multi-turn workflows but heavier to set up for a single edit.

#### Required and optional parameters

The `images.edit()` call accepts these parameters:

| Parameter | Required | Type | Notes |
|-----------|----------|------|-------|
| `image` | **Yes** | `Uploadable \| Uploadable[]` | One or more reference images (up to 16 for GPT Image models) |
| `prompt` | **Yes** | `string` | Up to **32,000 chars** for GPT Image; 1,000 for dall-e-2 |
| `model` | No | `string` | `"gpt-image-1"`, `"gpt-image-1.5"`, `"gpt-image-1-mini"`, or `"dall-e-2"` |
| `mask` | No | `Uploadable` | PNG with alpha channel; transparent regions mark where to edit |
| `size` | No | `string` | `"1024x1024"`, `"1536x1024"`, `"1024x1536"`, or `"auto"` |
| `quality` | No | `string` | `"low"`, `"medium"`, or `"high"` |
| `n` | No | `number` | Number of output images (1–10) |
| `input_fidelity` | No | `string` | `"low"` (default) or `"high"` — preserves more detail from inputs |
| `output_format` | No | `string` | `"png"` (default), `"jpeg"`, or `"webp"` |
| `background` | No | `string` | `"transparent"`, `"opaque"`, or `"auto"` |
| `output_compression` | No | `number` | 0–100 for JPEG/WebP |

Setting **`input_fidelity: "high"`** is particularly important when you want the output to closely preserve faces, logos, textures, or fine details from your reference image. The first image in the array receives the strongest fidelity treatment.

#### How to handle file uploads in the Node SDK

The SDK's `image` parameter accepts the `Uploadable` type, which resolves to several concrete options. Here are the four main patterns, from simplest to most flexible:

**Pattern 1 — `fs.createReadStream()` (simplest for local files):**
```typescript
import fs from "fs";
image: fs.createReadStream("reference.png")
```

**Pattern 2 — `toFile()` helper (recommended for Buffers, streams, or fetch responses):**
```typescript
import { toFile } from "openai";
image: await toFile(myBuffer, "image.png", { type: "image/png" })
```

**Pattern 3 — Web `File` object (browser environments):**
```typescript
image: new File([blob], "image.png", { type: "image/png" })
```

**Pattern 4 — `fetch` Response (remote URLs):**
```typescript
image: await toFile(await fetch("https://example.com/photo.png"), "photo.png")
```

A critical gotcha: **you cannot pass a raw `Buffer` directly** to the `image` parameter. The SDK expects a file-like object with name and type metadata. Always wrap Buffers with `toFile()`. When using `toFile()`, always specify the MIME type in the options object (`{ type: "image/png" }`) to avoid content-type detection issues.

#### Format requirements and size limits

**For `gpt-image-1` / `gpt-image-1.5` / `gpt-image-1-mini`:**
- Accepts **PNG, JPEG, and WebP** input images
- Maximum **50 MB** per image file
- Up to **16 images** in a single request (passed as an array)
- The mask must be a **PNG with an alpha channel** — fully transparent pixels (alpha = 0) indicate areas to edit
- The mask is applied to the **first image** in the array
- The mask must have the **same dimensions** as the input image and be under **4 MB**

**For `dall-e-2` (legacy):**
- Only **square PNG** files accepted
- Maximum **4 MB**, single image only
- If no mask is provided, the image itself must contain transparency (used as an implicit mask)

GPT Image models always return **base64-encoded** image data (`b64_json`). URL-based responses are not supported for these models — only DALL·E 2/3 support temporary URLs.

#### Complete working TypeScript examples

##### Single reference image edit

```typescript
import fs from "fs";
import OpenAI from "openai";

const client = new OpenAI(); // uses OPENAI_API_KEY env var

async function editWithReference() {
  const result = await client.images.edit({
    model: "gpt-image-1",
    image: fs.createReadStream("photo.png"),
    prompt: "Transform the background into a dramatic sunset over the ocean",
    size: "1024x1024",
    quality: "high",
  });

  const base64 = result.data[0].b64_json!;
  fs.writeFileSync("output.png", Buffer.from(base64, "base64"));
  console.log("Saved output.png");
}

editWithReference();
```

##### Multiple reference images with toFile()

```typescript
import fs from "fs";
import OpenAI, { toFile } from "openai";

const client = new OpenAI();

async function compositeImages() {
  const referenceFiles = ["product-a.png", "product-b.png", "brand-logo.png"];

  const images = await Promise.all(
    referenceFiles.map((file) =>
      toFile(fs.createReadStream(file), null, { type: "image/png" })
    )
  );

  const result = await client.images.edit({
    model: "gpt-image-1",
    image: images,
    prompt:
      "Create a sleek product advertisement showing both products side by side with the brand logo in the top-right corner, on a clean white background",
    size: "1536x1024",
    quality: "high",
    input_fidelity: "high",
  });

  const base64 = result.data[0].b64_json!;
  fs.writeFileSync("composite.png", Buffer.from(base64, "base64"));
  console.log("Saved composite.png");
}

compositeImages();
```



##### Handling a Buffer from an HTTP upload (e.g., Express + Multer)

```typescript
import OpenAI, { toFile } from "openai";
import type { Request, Response } from "express";

const client = new OpenAI();

async function handleUpload(req: Request, res: Response) {
  const imageBuffer: Buffer = req.file!.buffer; // from multer memoryStorage

  const result = await client.images.edit({
    model: "gpt-image-1",
    image: await toFile(imageBuffer, "upload.png", { type: "image/png" }),
    prompt: req.body.prompt ?? "Make this image look like a watercolor painting",
    size: "1024x1024",
  });

  const base64 = result.data[0].b64_json!;
  res.json({ image: `data:image/png;base64,${base64}` });
}
```

#### Conclusion

The key architectural insight is that OpenAI splits image creation into two distinct endpoints: **generation (text-only) and editing (accepts images)**. Any workflow requiring a reference or guidance image routes through `client.images.edit()` using `gpt-image-1` or `gpt-image-1.5`. The `toFile()` helper is the most versatile approach for file uploads, handling Buffers, streams, and fetch responses uniformly. Set `input_fidelity: "high"` when preserving visual details from reference images matters, and remember that GPT Image models always return base64 data rather than URLs. For multi-turn conversational editing, the Responses API with `tools: [{ type: "image_generation" }]` offers a more flexible alternative, though `images.edit()` remains the more direct and lightweight choice for single-shot edits.

## Persona Manager in the Backend

All persona types a stored as .zip files in the workspace/.agent-persona-repository 

An example for a deflated persona is given in agent-personas/supplyagent

The main entry point is the API method install offered by the persona-manager. It expects two parameters:
* the content of the .agent/personality.json
* the name of the ZIP file to use from the agent-persona-repository

It then creates the workspace/.agent directory if it shouldn't exist, stores the .agent/personality.json as file and deflates the ZIP file into workspace/.agent

The persona-manager then creates a new project "onboarding" using the API endpoint from existing project service, load it in the UI as active project and then create the first message in the first session to start the onboarding steps as described in the persona ZIP.

The user then iterates through the onboarding process. If necessary create a onboarding-to-dos.md in the project directory, so the coding agent can handle the onboarding step by step.