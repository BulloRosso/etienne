import React, { useState, useEffect } from 'react';
import {
  Box,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  IconButton,
  Typography,
  Chip,
  CircularProgress,
  Tooltip
} from '@mui/material';
import { Delete as DeleteIcon } from '@mui/icons-material';
import { IoDocumentOutline } from "react-icons/io5";
import { apiFetch } from '../services/api';

export default function VectorStoreItems({ project }) {
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedRow, setSelectedRow] = useState(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (project) {
      fetchDocuments();
    }
  }, [project]);

  const fetchDocuments = async () => {
    try {
      setLoading(true);
      const response = await apiFetch(`/api/knowledge-graph/${project}/documents`);
      if (response.ok) {
        const data = await response.json();
        setDocuments(data);
      } else {
        console.error('Failed to fetch documents:', await response.text());
      }
    } catch (error) {
      console.error('Error fetching documents:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleRowClick = (docId) => {
    setSelectedRow(selectedRow === docId ? null : docId);
  };

  const handleDelete = async (docId) => {
    if (!window.confirm('Are you sure you want to delete this document?')) {
      return;
    }

    try {
      setDeleting(true);
      const response = await apiFetch(`/api/knowledge-graph/${project}/documents/${docId}`, {
        method: 'DELETE'
      });

      if (response.ok) {
        // Remove from local state
        setDocuments(documents.filter(doc => doc.id !== docId));
        setSelectedRow(null);
      } else {
        console.error('Failed to delete document:', await response.text());
        alert('Failed to delete document');
      }
    } catch (error) {
      console.error('Error deleting document:', error);
      alert('Error deleting document');
    } finally {
      setDeleting(false);
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleString();
  };

  const truncateContent = (content, maxLength = 100) => {
    if (!content) return 'N/A';
    return content.length > maxLength ? content.substring(0, maxLength) + '...' : content;
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '200px' }}>
        <CircularProgress />
      </Box>
    );
  }

  if (documents.length === 0) {
    return (
      <Box sx={{ textAlign: 'center', py: 4 }}>
        <Typography variant="body1" color="text.secondary">
          No documents found in vector store
        </Typography>
      </Box>
    );
  }

  return (
    <TableContainer component={Paper} sx={{ maxHeight: 440 }}>
      <Table stickyHeader>
        <TableHead>
          <TableRow>
            <TableCell sx={{ fontWeight: 'bold' }}>DocID</TableCell>
            <TableCell sx={{ fontWeight: 'bold' }}>Content Preview</TableCell>
            <TableCell sx={{ fontWeight: 'bold' }}>Uploaded At</TableCell>
            <TableCell sx={{ fontWeight: 'bold' }}>Graph Layer</TableCell>
            <TableCell align="right" sx={{ fontWeight: 'bold', width: '80px' }}>Actions</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {documents.map((doc, index) => (
            <TableRow
              key={doc.id}
              onClick={() => handleRowClick(doc.id)}
              selected={selectedRow === doc.id}
              hover
              sx={{
                cursor: 'pointer',
                backgroundColor: index % 2 === 0 ? 'transparent' : 'rgba(0, 0, 0, 0.02)',
                '&:hover': {
                  backgroundColor: index % 2 === 0 ? 'rgba(0, 0, 0, 0.04)' : 'rgba(0, 0, 0, 0.06)',
                },
                '&.Mui-selected': {
                  backgroundColor: 'rgba(25, 118, 210, 0.08) !important',
                },
                '&.Mui-selected:hover': {
                  backgroundColor: 'rgba(25, 118, 210, 0.12) !important',
                }
              }}
            >
              <TableCell>
                <Tooltip title={doc.id} placement="top">
                  <Box sx={{ display: 'flex', alignItems: 'center' }}>
                    <IoDocumentOutline style={{ fontSize: '20px', color: '#666' }} />
                  </Box>
                </Tooltip>
              </TableCell>
              <TableCell>
                <Typography variant="body2">
                  {truncateContent(doc.content)}
                </Typography>
              </TableCell>
              <TableCell>
                <Typography variant="body2">
                  {formatDate(doc.metadata?.uploadedAt)}
                </Typography>
              </TableCell>
              <TableCell>
                {doc.metadata?.useGraphLayer !== undefined ? (
                  <Chip
                    label={doc.metadata.useGraphLayer ? 'Enabled' : 'Disabled'}
                    size="small"
                    color={doc.metadata.useGraphLayer ? 'success' : 'default'}
                  />
                ) : (
                  <Typography variant="body2" color="text.secondary">N/A</Typography>
                )}
              </TableCell>
              <TableCell align="right">
                {selectedRow === doc.id && (
                  <IconButton
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(doc.id);
                    }}
                    disabled={deleting}
                    size="small"
                    color="error"
                  >
                    <DeleteIcon />
                  </IconButton>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}
