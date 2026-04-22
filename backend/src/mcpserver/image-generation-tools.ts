/**
 * Image Generation Tools — GPT Images 2.0 with Thinking Mode
 *
 * MCP tool group for generating and editing images using the OpenAI
 * Responses API with model gpt-image-2. Supports:
 *   - Text-to-image generation (single or series of up to 8)
 *   - Image editing with a guiding/source image
 *   - Thinking mode for knowledge-aware, consistent visual output
 *
 * Generated images are stored in <workspace>/<project>/out/generated-images/
 * Source/guiding images are expected in <workspace>/<project>/images/
 */

import { ToolService, McpTool, ProgressCallback } from './types';
import OpenAI from 'openai';
import * as fs from 'fs-extra';
import * as path from 'path';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Mainline reasoning model — routes to GPT Image internally via the image_generation tool */
const MODEL = 'gpt-5.4';

const WORKSPACE_DIR = process.env.WORKSPACE_ROOT
  || path.join(process.cwd(), '..', 'workspace');

const VALID_SIZES = ['1024x1024', '1536x1024', '1024x1536', '2048x2048', 'auto'] as const;
const VALID_QUALITIES = ['low', 'medium', 'high', 'auto'] as const;

const MIME_MAP: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let openaiClient: OpenAI | null = null;

function getOpenAIClient(): OpenAI {
  if (openaiClient) return openaiClient;

  const apiKey = process.env.IMAGE_GENERATION_API_KEY;
  if (!apiKey) {
    throw new Error(
      'IMAGE_GENERATION_API_KEY environment variable is not set. ' +
      'Please configure it in the backend .env file to use image generation.',
    );
  }

  openaiClient = new OpenAI({ apiKey });
  return openaiClient;
}

function resolveOutputDir(projectName: string): string {
  return path.join(WORKSPACE_DIR, projectName, 'out', 'generated-images');
}

function generateTimestampFilename(index: number): string {
  const now = new Date();
  const ts = now.toISOString()
    .replace(/[-:T]/g, '')
    .replace(/\.\d+Z$/, '');
  return `img_${ts}_${String(index + 1).padStart(3, '0')}.png`;
}

function getMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  return MIME_MAP[ext] || 'image/png';
}

// ---------------------------------------------------------------------------
// Tool definitions
// ---------------------------------------------------------------------------

const tools: McpTool[] = [
  {
    name: 'generate_image',
    description:
      'Generate one or more images from a text prompt using GPT Images 2.0 with thinking mode. ' +
      'The thinking mode enables the model to structure visual tasks, incorporate web knowledge ' +
      '(up to December 2025), and produce consistent image series. ' +
      'Especially effective for infographics, educational materials, and explanatory visuals. ' +
      'For series (n > 1), the model creates up to 8 images with consistent characters, ' +
      'objects, and visual style in a single pass. ' +
      'Generated images are saved to <project>/out/generated-images/.',
    inputSchema: {
      type: 'object',
      properties: {
        project_name: {
          type: 'string',
          description: 'The project directory name in the workspace.',
        },
        prompt: {
          type: 'string',
          description:
            'Text prompt describing the image(s) to generate. Be specific about style, ' +
            'content, colors, composition, and mood. For series, describe the overall theme ' +
            'and what should remain consistent across images.',
        },
        size: {
          type: 'string',
          enum: ['1024x1024', '1536x1024', '1024x1536', '2048x2048', 'auto'],
          description:
            'Image dimensions. Common aspect ratios: 1:1 = 1024x1024, ' +
            '3:2 landscape = 1536x1024, 2:3 portrait = 1024x1536, ' +
            '2K square = 2048x2048. Default: auto (model decides).',
        },
        quality: {
          type: 'string',
          enum: ['low', 'medium', 'high', 'auto'],
          description:
            'Rendering quality. "low" for fast drafts, "medium" for balanced, ' +
            '"high" for final assets. Default: high.',
        },
        n: {
          type: 'integer',
          minimum: 1,
          maximum: 8,
          description:
            'Number of images to generate (1-8). For n > 1 the thinking mode ' +
            'creates a consistent series with shared characters and visual style. ' +
            'Default: 1.',
        },
      },
      required: ['project_name', 'prompt'],
    },
  },
  {
    name: 'edit_image',
    description:
      'Edit or modify an existing image using a text prompt and GPT Images 2.0. ' +
      'Provide a source/guiding image from the project and describe the desired changes. ' +
      'The model can alter style, add/remove elements, change colors, transform the scene, ' +
      'or use the source image as a reference for generating a new image. ' +
      'Source images are expected in <project>/images/. ' +
      'Results are saved to <project>/out/generated-images/.',
    inputSchema: {
      type: 'object',
      properties: {
        project_name: {
          type: 'string',
          description: 'The project directory name in the workspace.',
        },
        prompt: {
          type: 'string',
          description:
            'Edit instruction describing what to change. Be precise about what to ' +
            'modify and what to preserve from the source image.',
        },
        source_image: {
          type: 'string',
          description:
            'Path to the source/guiding image, relative to the project directory. ' +
            'Typically in the "images/" folder (e.g. "images/photo.png"). ' +
            'Supported formats: PNG, JPEG, WebP, GIF.',
        },
        size: {
          type: 'string',
          enum: ['1024x1024', '1536x1024', '1024x1536', '2048x2048', 'auto'],
          description: 'Output image dimensions. Default: auto.',
        },
        quality: {
          type: 'string',
          enum: ['low', 'medium', 'high', 'auto'],
          description: 'Rendering quality. Default: high.',
        },
      },
      required: ['project_name', 'prompt', 'source_image'],
    },
  },
];

// ---------------------------------------------------------------------------
// Tool execution
// ---------------------------------------------------------------------------

async function generateImage(
  args: {
    project_name: string;
    prompt: string;
    size?: string;
    quality?: string;
    n?: number;
  },
  onProgress?: ProgressCallback,
): Promise<any> {
  const { project_name, prompt, size = 'auto', quality = 'high', n = 1 } = args;

  if (!project_name) throw new Error('project_name is required');
  if (!prompt) throw new Error('prompt is required');

  const client = getOpenAIClient();
  const outputDir = resolveOutputDir(project_name);
  await fs.ensureDir(outputDir);

  // For series, instruct the model to create multiple consistent images
  let finalPrompt = prompt;
  if (n > 1) {
    finalPrompt =
      `Create a series of exactly ${n} images. ` +
      `Ensure consistent characters, objects, and visual style across all images. ` +
      `Maintain visual continuity and coherent design throughout the series.\n\n${prompt}`;
  }

  if (onProgress) {
    await onProgress(0, n, `Generating ${n === 1 ? 'image' : `series of ${n} images`}...`);
  }

  const toolConfig: any = { type: 'image_generation' };
  if (quality !== 'auto') toolConfig.quality = quality;
  if (size !== 'auto') toolConfig.size = size;

  const response = await (client as any).responses.create({
    model: MODEL,
    input: finalPrompt,
    tools: [toolConfig],
  });

  // Extract generated images from response
  const imageOutputs = response.output.filter(
    (output: any) => output.type === 'image_generation_call',
  );

  if (imageOutputs.length === 0) {
    throw new Error('No images were generated. The model may have declined the request.');
  }

  const savedFiles: Array<{ path: string; size_bytes: number }> = [];

  for (let i = 0; i < imageOutputs.length; i++) {
    const imageBase64 = imageOutputs[i].result;
    const filename = generateTimestampFilename(i);
    const filePath = path.join(outputDir, filename);
    const buffer = Buffer.from(imageBase64, 'base64');

    await fs.writeFile(filePath, buffer);
    savedFiles.push({
      path: path.relative(path.join(WORKSPACE_DIR, project_name), filePath),
      size_bytes: buffer.length,
    });

    if (onProgress) {
      await onProgress(i + 1, imageOutputs.length, `Saved ${filename}`);
    }
  }

  // Capture revised prompt if available
  const revisedPrompt = imageOutputs[0]?.revised_prompt || null;

  return {
    success: true,
    images_generated: savedFiles.length,
    images_requested: n,
    files: savedFiles,
    output_dir: `out/generated-images`,
    revised_prompt: revisedPrompt,
  };
}

async function editImage(
  args: {
    project_name: string;
    prompt: string;
    source_image: string;
    size?: string;
    quality?: string;
  },
  onProgress?: ProgressCallback,
): Promise<any> {
  const { project_name, prompt, source_image, size = 'auto', quality = 'high' } = args;

  if (!project_name) throw new Error('project_name is required');
  if (!prompt) throw new Error('prompt is required');
  if (!source_image) throw new Error('source_image is required');

  const client = getOpenAIClient();
  const outputDir = resolveOutputDir(project_name);
  await fs.ensureDir(outputDir);

  // Resolve and validate source image path
  const sourcePath = path.join(WORKSPACE_DIR, project_name, source_image);
  const sourceExists = await fs.pathExists(sourcePath);
  if (!sourceExists) {
    throw new Error(
      `Source image not found: ${source_image} ` +
      `(resolved to ${sourcePath}). ` +
      `Place guiding images in the project's "images/" folder.`,
    );
  }

  if (onProgress) {
    await onProgress(0, 2, 'Reading source image...');
  }

  // Read source image and encode as base64 data URI
  const sourceBuffer = await fs.readFile(sourcePath);
  const mimeType = getMimeType(sourcePath);
  const base64data = sourceBuffer.toString('base64');

  if (onProgress) {
    await onProgress(1, 3, 'Generating edited image...');
  }

  const toolConfig: any = { type: 'image_generation' };
  if (quality !== 'auto') toolConfig.quality = quality;
  if (size !== 'auto') toolConfig.size = size;

  const response = await (client as any).responses.create({
    model: MODEL,
    input: [
      {
        role: 'user',
        content: [
          { type: 'input_text', text: prompt },
          {
            type: 'input_image',
            image_url: `data:${mimeType};base64,${base64data}`,
          },
        ],
      },
    ],
    tools: [toolConfig],
  });

  // Extract generated images from response
  const imageOutputs = response.output.filter(
    (output: any) => output.type === 'image_generation_call',
  );

  if (imageOutputs.length === 0) {
    throw new Error('No edited image was generated. The model may have declined the request.');
  }

  const savedFiles: Array<{ path: string; size_bytes: number }> = [];

  for (let i = 0; i < imageOutputs.length; i++) {
    const imageBase64 = imageOutputs[i].result;
    const filename = generateTimestampFilename(i);
    const filePath = path.join(outputDir, filename);
    const buffer = Buffer.from(imageBase64, 'base64');

    await fs.writeFile(filePath, buffer);
    savedFiles.push({
      path: path.relative(path.join(WORKSPACE_DIR, project_name), filePath),
      size_bytes: buffer.length,
    });
  }

  if (onProgress) {
    await onProgress(3, 3, 'Edit complete');
  }

  const revisedPrompt = imageOutputs[0]?.revised_prompt || null;

  return {
    success: true,
    images_generated: savedFiles.length,
    files: savedFiles,
    source_image,
    output_dir: `out/generated-images`,
    revised_prompt: revisedPrompt,
  };
}

// ---------------------------------------------------------------------------
// MCP tool service factory
// ---------------------------------------------------------------------------

export function createImageGenerationToolsService(): ToolService {
  async function execute(
    toolName: string,
    args: any,
    _elicit?: any,
    onProgress?: ProgressCallback,
  ): Promise<any> {
    switch (toolName) {
      case 'generate_image':
        return generateImage(args, onProgress);
      case 'edit_image':
        return editImage(args, onProgress);
      default:
        throw new Error(`Unknown tool: ${toolName}`);
    }
  }

  return { tools, execute };
}
