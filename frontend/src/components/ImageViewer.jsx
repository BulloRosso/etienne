import React, { useState, useEffect } from 'react';
import { Box, Typography, Paper, CircularProgress } from '@mui/material';
import { useThemeMode } from '../contexts/ThemeContext.jsx';
import { apiFetch } from '../services/api';

/**
 * ImageViewer - Displays images with metadata extracted from file headers
 *
 * Supports: .jpg, .jpeg, .png, .gif
 * Extracts and displays:
 * - Image dimensions (width x height)
 * - File format
 * - Color depth/bit depth
 * - Additional format-specific metadata
 */
export default function ImageViewer({ filename, projectName }) {
  const { mode: themeMode } = useThemeMode();
  const [imageUrl, setImageUrl] = useState(null);
  const [metadata, setMetadata] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!filename || !projectName) return;

    const loadImage = async () => {
      try {
        setLoading(true);
        setError(null);

        // Fetch the image file
        const response = await apiFetch(`/api/workspace/${projectName}/files/${filename}`);
        if (!response.ok) {
          throw new Error(`Failed to load image: ${response.statusText}`);
        }

        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        setImageUrl(url);

        // Extract metadata from the blob
        const meta = await extractImageMetadata(blob, filename);
        setMetadata(meta);

        setLoading(false);
      } catch (err) {
        console.error('Error loading image:', err);
        setError(err.message);
        setLoading(false);
      }
    };

    loadImage();

    // Cleanup object URL on unmount
    return () => {
      if (imageUrl) {
        URL.revokeObjectURL(imageUrl);
      }
    };
  }, [filename, projectName]);

  /**
   * Extract metadata from image file headers
   */
  const extractImageMetadata = async (blob, filename) => {
    return new Promise((resolve) => {
      const reader = new FileReader();

      reader.onload = (e) => {
        const arrayBuffer = e.target.result;
        const bytes = new Uint8Array(arrayBuffer);

        // Create an Image element to get dimensions
        const img = new Image();
        const url = URL.createObjectURL(blob);

        img.onload = () => {
          const meta = {
            width: img.width,
            height: img.height,
            fileSize: formatFileSize(blob.size),
            format: getImageFormat(filename, bytes),
          };

          // Extract format-specific metadata
          if (filename.toLowerCase().endsWith('.png')) {
            Object.assign(meta, extractPngMetadata(bytes));
          } else if (filename.toLowerCase().match(/\.(jpg|jpeg)$/)) {
            Object.assign(meta, extractJpegMetadata(bytes));
          } else if (filename.toLowerCase().endsWith('.gif')) {
            Object.assign(meta, extractGifMetadata(bytes));
          }

          URL.revokeObjectURL(url);
          resolve(meta);
        };

        img.onerror = () => {
          URL.revokeObjectURL(url);
          resolve({
            fileSize: formatFileSize(blob.size),
            format: getImageFormat(filename, bytes),
            error: 'Could not load image dimensions'
          });
        };

        img.src = url;
      };

      reader.readAsArrayBuffer(blob);
    });
  };

  /**
   * Determine image format from filename and magic bytes
   */
  const getImageFormat = (filename, bytes) => {
    const ext = filename.split('.').pop().toLowerCase();

    // Verify with magic bytes
    if (bytes[0] === 0xFF && bytes[1] === 0xD8 && bytes[2] === 0xFF) {
      return 'JPEG';
    } else if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47) {
      return 'PNG';
    } else if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) {
      return 'GIF';
    }

    return ext.toUpperCase();
  };

  /**
   * Extract PNG-specific metadata from header
   */
  const extractPngMetadata = (bytes) => {
    const meta = {};

    try {
      // PNG signature is 8 bytes, then comes IHDR chunk
      // IHDR is at byte 12-29
      if (bytes.length > 29) {
        // Color type at byte 25
        const colorType = bytes[25];
        const bitDepth = bytes[24];

        const colorTypes = {
          0: 'Grayscale',
          2: 'RGB',
          3: 'Indexed',
          4: 'Grayscale + Alpha',
          6: 'RGBA'
        };

        meta.colorType = colorTypes[colorType] || `Unknown (${colorType})`;
        meta.bitDepth = `${bitDepth}-bit`;

        // Compression method at byte 26
        meta.compression = bytes[26] === 0 ? 'Deflate' : 'Unknown';
      }
    } catch (err) {
      console.error('Error extracting PNG metadata:', err);
    }

    return meta;
  };

  /**
   * Extract JPEG-specific metadata from header
   */
  const extractJpegMetadata = (bytes) => {
    const meta = {};

    try {
      // JPEG uses markers starting with 0xFF
      // Look for SOF (Start of Frame) markers to get more info
      let i = 2; // Skip initial 0xFFD8

      while (i < bytes.length - 10) {
        if (bytes[i] === 0xFF) {
          const marker = bytes[i + 1];

          // SOF markers (Start of Frame) - various JPEG types
          if ((marker >= 0xC0 && marker <= 0xC3) ||
              (marker >= 0xC5 && marker <= 0xC7) ||
              (marker >= 0xC9 && marker <= 0xCB) ||
              (marker >= 0xCD && marker <= 0xCF)) {

            const precision = bytes[i + 4];
            const components = bytes[i + 9];

            meta.bitDepth = `${precision}-bit`;

            if (components === 1) {
              meta.colorType = 'Grayscale';
            } else if (components === 3) {
              meta.colorType = 'YCbCr (RGB)';
            } else if (components === 4) {
              meta.colorType = 'CMYK';
            } else {
              meta.colorType = `${components} components`;
            }

            break;
          }

          // Skip to next marker
          const segmentLength = (bytes[i + 2] << 8) | bytes[i + 3];
          i += segmentLength + 2;
        } else {
          i++;
        }
      }
    } catch (err) {
      console.error('Error extracting JPEG metadata:', err);
    }

    return meta;
  };

  /**
   * Extract GIF-specific metadata from header
   */
  const extractGifMetadata = (bytes) => {
    const meta = {};

    try {
      // GIF header: "GIF87a" or "GIF89a" (6 bytes)
      const version = String.fromCharCode(...bytes.slice(0, 6));
      meta.version = version;

      // Logical screen descriptor starts at byte 6
      if (bytes.length > 10) {
        // Global color table flag is bit 7 of byte 10
        const packed = bytes[10];
        const hasGlobalColorTable = (packed & 0x80) !== 0;
        const colorResolution = ((packed & 0x70) >> 4) + 1;
        const bitsPerPixel = (packed & 0x07) + 1;

        meta.colorType = hasGlobalColorTable ? 'Indexed (Global Color Table)' : 'Indexed';
        meta.bitDepth = `${bitsPerPixel}-bit`;
        meta.colorResolution = `${colorResolution}-bit`;
      }
    } catch (err) {
      console.error('Error extracting GIF metadata:', err);
    }

    return meta;
  };

  /**
   * Format file size to human-readable format
   */
  const formatFileSize = (bytes) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', p: 4 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Box sx={{ p: 4 }}>
        <Typography color="error">Error: {error}</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ height: '100%', overflow: 'auto', p: 3, display: 'flex', flexDirection: 'column', gap: 3 }}>
      {/* Image Display */}
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
        <img
          src={imageUrl}
          alt={filename}
          style={{
            maxWidth: '100%',
            height: 'auto',
            display: 'block'
          }}
        />
      </Box>

      {/* Metadata Display */}
      {metadata && (
        <Paper elevation={2} sx={{ p: 2, backgroundColor: themeMode === 'dark' ? '#383838' : '#f5f5f5' }}>
          <Typography variant="h6" gutterBottom sx={{ fontSize: '1rem', fontWeight: 'bold' }}>
            Image Information
          </Typography>

          <Box sx={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 1, fontSize: '0.875rem' }}>
            <Typography sx={{ fontWeight: 'bold', color: themeMode === 'dark' ? '#aaa' : '#666' }}>Format:</Typography>
            <Typography>{metadata.format}</Typography>

            {metadata.width && metadata.height && (
              <>
                <Typography sx={{ fontWeight: 'bold', color: themeMode === 'dark' ? '#aaa' : '#666' }}>Dimensions:</Typography>
                <Typography>{metadata.width} × {metadata.height} pixels</Typography>
              </>
            )}

            <Typography sx={{ fontWeight: 'bold', color: themeMode === 'dark' ? '#aaa' : '#666' }}>File Size:</Typography>
            <Typography>{metadata.fileSize}</Typography>

            {metadata.bitDepth && (
              <>
                <Typography sx={{ fontWeight: 'bold', color: themeMode === 'dark' ? '#aaa' : '#666' }}>Bit Depth:</Typography>
                <Typography>{metadata.bitDepth}</Typography>
              </>
            )}

            {metadata.colorType && (
              <>
                <Typography sx={{ fontWeight: 'bold', color: themeMode === 'dark' ? '#aaa' : '#666' }}>Color Type:</Typography>
                <Typography>{metadata.colorType}</Typography>
              </>
            )}

            {metadata.compression && (
              <>
                <Typography sx={{ fontWeight: 'bold', color: themeMode === 'dark' ? '#aaa' : '#666' }}>Compression:</Typography>
                <Typography>{metadata.compression}</Typography>
              </>
            )}

            {metadata.version && (
              <>
                <Typography sx={{ fontWeight: 'bold', color: themeMode === 'dark' ? '#aaa' : '#666' }}>Version:</Typography>
                <Typography>{metadata.version}</Typography>
              </>
            )}

            {metadata.colorResolution && (
              <>
                <Typography sx={{ fontWeight: 'bold', color: themeMode === 'dark' ? '#aaa' : '#666' }}>Color Resolution:</Typography>
                <Typography>{metadata.colorResolution}</Typography>
              </>
            )}
          </Box>

          <Typography variant="caption" sx={{ display: 'block', mt: 2, color: themeMode === 'dark' ? '#999' : '#888', fontSize: '0.75rem' }}>
            Filename: {filename}
          </Typography>
        </Paper>
      )}
    </Box>
  );
}
