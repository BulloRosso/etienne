import React, { useState, useEffect, useRef } from 'react';
import {
  Dialog, DialogTitle, DialogContent, IconButton,
  Box, CircularProgress, Typography, ToggleButton, ToggleButtonGroup,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import { useTranslation } from 'react-i18next';
import { apiFetch } from '../services/api';

const THUMBNAIL_SIZES = {
  small: 80,
  medium: 140,
  large: 220,
};

export default function ImageGalleryModal({ open, onClose, onInsert, projectName, directoryPath }) {
  const { t } = useTranslation();
  const [images, setImages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [previewSize, setPreviewSize] = useState('medium');
  const [thumbnailUrls, setThumbnailUrls] = useState({});
  const blobUrlsRef = useRef([]);

  const thumbHeight = THUMBNAIL_SIZES[previewSize];

  // Fetch image list when modal opens
  useEffect(() => {
    if (!open) return;

    setLoading(true);
    const url = directoryPath
      ? `/api/workspace/${encodeURIComponent(projectName)}/list-images/${directoryPath}`
      : `/api/workspace/${encodeURIComponent(projectName)}/list-images`;
    apiFetch(url)
      .then(res => res.json())
      .then(data => {
        setImages(data.images || []);
        setLoading(false);
      })
      .catch(() => {
        setImages([]);
        setLoading(false);
      });
  }, [open, projectName, directoryPath]);

  // Load thumbnail blob URLs
  useEffect(() => {
    if (!open || images.length === 0) return;

    const loadThumbnails = async () => {
      const urls = {};
      for (const img of images) {
        try {
          const response = await apiFetch(
            `/api/workspace/${encodeURIComponent(projectName)}/files/${img.path}`
          );
          if (response.ok) {
            const blob = await response.blob();
            const url = URL.createObjectURL(blob);
            urls[img.path] = url;
            blobUrlsRef.current.push(url);
          }
        } catch {
          // Skip failed thumbnails
        }
      }
      setThumbnailUrls(urls);
    };

    loadThumbnails();
  }, [open, images, projectName]);

  // Cleanup blob URLs on close
  useEffect(() => {
    if (!open) {
      blobUrlsRef.current.forEach(url => URL.revokeObjectURL(url));
      blobUrlsRef.current = [];
      setThumbnailUrls({});
      setImages([]);
    }
  }, [open]);

  const handleImageClick = (imagePath) => {
    onInsert(imagePath);
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        {t('markdownViewer.imageGallery.title')}
        <IconButton onClick={onClose} size="small">
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      <DialogContent>
        {/* Preview size selector */}
        <Box sx={{ mb: 2, display: 'flex', justifyContent: 'center' }}>
          <ToggleButtonGroup
            value={previewSize}
            exclusive
            onChange={(e, val) => { if (val) setPreviewSize(val); }}
            size="small"
          >
            <ToggleButton value="small">{t('markdownViewer.imageGallery.sizeSmall')}</ToggleButton>
            <ToggleButton value="medium">{t('markdownViewer.imageGallery.sizeMedium')}</ToggleButton>
            <ToggleButton value="large">{t('markdownViewer.imageGallery.sizeLarge')}</ToggleButton>
          </ToggleButtonGroup>
        </Box>

        {loading ? (
          <Box display="flex" justifyContent="center" alignItems="center" minHeight={200}>
            <CircularProgress />
          </Box>
        ) : images.length === 0 ? (
          <Box display="flex" justifyContent="center" alignItems="center" minHeight={200}>
            <Typography color="text.secondary">
              {t('markdownViewer.imageGallery.noImages')}
            </Typography>
          </Box>
        ) : (
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: 2,
            }}
          >
            {images.map((img) => (
              <Box
                key={img.path}
                onClick={() => handleImageClick(img.path)}
                sx={{
                  cursor: 'pointer',
                  border: '2px solid transparent',
                  borderRadius: 1,
                  overflow: 'hidden',
                  transition: 'border-color 0.2s',
                  '&:hover': {
                    borderColor: 'primary.main',
                  },
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                }}
              >
                <Box
                  sx={{
                    width: '100%',
                    height: thumbHeight,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    bgcolor: 'grey.100',
                    transition: 'height 0.2s',
                  }}
                >
                  {thumbnailUrls[img.path] ? (
                    <Box
                      component="img"
                      src={thumbnailUrls[img.path]}
                      alt={img.name}
                      sx={{
                        maxWidth: '100%',
                        maxHeight: '100%',
                        objectFit: 'cover',
                        width: '100%',
                        height: '100%',
                      }}
                    />
                  ) : (
                    <CircularProgress size={24} />
                  )}
                </Box>
                <Typography
                  variant="caption"
                  sx={{
                    px: 0.5,
                    py: 0.5,
                    textAlign: 'center',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    width: '100%',
                  }}
                >
                  {img.name}
                </Typography>
              </Box>
            ))}
          </Box>
        )}
      </DialogContent>
    </Dialog>
  );
}
