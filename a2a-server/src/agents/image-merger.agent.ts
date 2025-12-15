/**
 * Image Merger Agent
 *
 * Receives 2 JPG images and creates a new image with:
 * - First image at its original height on the left
 * - Second image scaled to match the first image's height, appended on the right
 */

import sharp from 'sharp';
import { v4 as uuidv4 } from 'uuid';
import {
  AgentCard,
  Task,
  Message,
  Part,
  FilePart,
} from '../types.js';

const BASE_URL = process.env.BASE_URL || 'http://localhost:5600';

export const imageMergerAgentCard: AgentCard = {
  name: 'Image Merger Agent',
  description: 'Receives 2 JPG images and creates another JPG image which combines them horizontally. The first image is kept at its original height, and the second image is scaled to match the height of the first image and appended on the right side.',
  url: `${BASE_URL}/agents/image-merger`,
  version: '1.0.0',
  capabilities: {
    streaming: false,
    pushNotifications: false,
    stateTransitionHistory: false,
  },
  skills: [
    {
      id: 'merge-images',
      name: 'Merge Images',
      description: 'Merges two JPG images horizontally. The first image maintains its original dimensions, the second is scaled to match the first image\'s height and placed on the right.',
      inputModes: ['file'],
      outputModes: ['file'],
    },
  ],
  defaultInputModes: ['file'],
  defaultOutputModes: ['file'],
};

export async function processImageMerger(parts: Part[]): Promise<Task> {
  const taskId = uuidv4();

  // Extract file parts
  const fileParts = parts.filter((p): p is FilePart => p.kind === 'file');

  if (fileParts.length < 2) {
    return createErrorTask(taskId, `Image Merger requires exactly 2 images. Received ${fileParts.length} file(s).`);
  }

  try {
    // Get the first two images
    const image1Data = fileParts[0].file.bytes;
    const image2Data = fileParts[1].file.bytes;

    if (!image1Data || !image2Data) {
      return createErrorTask(taskId, 'Both images must be provided as base64-encoded bytes.');
    }

    // Decode base64 to buffers
    const buffer1 = Buffer.from(image1Data, 'base64');
    const buffer2 = Buffer.from(image2Data, 'base64');

    // Get metadata of first image to determine target height
    const image1Metadata = await sharp(buffer1).metadata();
    const targetHeight = image1Metadata.height || 600;

    // Process first image (keep original)
    const processedImage1 = await sharp(buffer1)
      .jpeg()
      .toBuffer();

    // Get actual dimensions of first processed image
    const img1Info = await sharp(processedImage1).metadata();
    const image1Width = img1Info.width || 800;
    const image1Height = img1Info.height || 600;

    // Process second image - scale to match first image's height
    const processedImage2 = await sharp(buffer2)
      .resize({ height: image1Height })
      .jpeg()
      .toBuffer();

    // Get dimensions of scaled second image
    const img2Info = await sharp(processedImage2).metadata();
    const image2Width = img2Info.width || 800;

    // Calculate total width for merged image
    const totalWidth = image1Width + image2Width;

    // Create merged image by compositing
    const mergedImage = await sharp({
      create: {
        width: totalWidth,
        height: image1Height,
        channels: 3,
        background: { r: 255, g: 255, b: 255 }
      }
    })
      .composite([
        { input: processedImage1, left: 0, top: 0 },
        { input: processedImage2, left: image1Width, top: 0 }
      ])
      .jpeg({ quality: 90 })
      .toBuffer();

    // Convert merged image to base64
    const mergedBase64 = mergedImage.toString('base64');

    // Create successful task response
    const task: Task = {
      kind: 'task',
      id: taskId,
      status: {
        state: 'completed',
        timestamp: new Date().toISOString(),
        message: {
          messageId: uuidv4(),
          role: 'agent',
          kind: 'message',
          parts: [
            {
              kind: 'text',
              text: `Successfully merged 2 images. Output dimensions: ${totalWidth}x${image1Height}px`
            }
          ],
        },
      },
      artifacts: [
        {
          artifactId: uuidv4(),
          name: 'merged-image.jpg',
          parts: [
            {
              kind: 'file',
              file: {
                bytes: mergedBase64,
                name: 'merged-image.jpg',
                mimeType: 'image/jpeg',
              },
            },
          ],
        },
      ],
    };

    return task;
  } catch (error) {
    console.error('Image merge error:', error);
    return createErrorTask(
      taskId,
      `Failed to merge images: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

function createErrorTask(taskId: string, errorMessage: string): Task {
  return {
    kind: 'task',
    id: taskId,
    status: {
      state: 'failed',
      timestamp: new Date().toISOString(),
      message: {
        messageId: uuidv4(),
        role: 'agent',
        kind: 'message',
        parts: [{ kind: 'text', text: errorMessage }],
      },
    },
  };
}
