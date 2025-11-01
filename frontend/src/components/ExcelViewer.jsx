import React, { useState, useEffect, useRef } from 'react';
import { Box, Typography, CircularProgress, Alert, Tabs, Tab } from '@mui/material';
import * as XLSX from 'xlsx';
import Table from '@wolf-table/table';
import '@wolf-table/table/dist/table.min.css';

// Add custom CSS to override wolf-table fonts
const customStyle = document.createElement('style');
customStyle.textContent = `
  .wolf-table,
  .wolf-table *,
  .wolf-table-cell,
  .wolf-table-cell-text {
    font-family: Roboto, sans-serif !important;
  }
`;
if (!document.getElementById('wolf-table-custom-font')) {
  customStyle.id = 'wolf-table-custom-font';
  document.head.appendChild(customStyle);
}

/**
 * ExcelViewer - Displays Excel files using SheetJS and wolf-table
 *
 * Supports: .xls, .xlsx
 * Features:
 * - Interactive spreadsheet grid with familiar Excel-like interface
 * - Multiple sheet support with tabs
 * - Read-only view (editing disabled)
 * - Scrollable, resizable, and selectable cells
 */
export default function ExcelViewer({ filename, projectName }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [metadata, setMetadata] = useState(null);
  const [workbook, setWorkbook] = useState(null);
  const [activeSheet, setActiveSheet] = useState(0);
  const [sheetDimensions, setSheetDimensions] = useState(null);
  const containerRef = useRef(null);
  const tableRef = useRef(null);

  // First effect: Load and parse the Excel file
  useEffect(() => {
    if (!filename || !projectName) return;

    const loadExcelFile = async () => {
      try {
        setLoading(true);
        setError(null);

        // Fetch the Excel file
        const response = await fetch(`/api/workspace/${projectName}/files/${filename}`);
        if (!response.ok) {
          throw new Error(`Failed to load Excel file: ${response.statusText}`);
        }

        const arrayBuffer = await response.arrayBuffer();

        // Parse the Excel file using SheetJS
        const wb = XLSX.read(arrayBuffer, {
          type: 'array',
          cellStyles: true,
          cellNF: true,
          cellDates: true
        });

        // Extract metadata
        const sheetNames = wb.SheetNames;
        const sheetCount = sheetNames.length;

        setMetadata({
          sheetCount,
          sheetNames,
          fileSize: formatFileSize(arrayBuffer.byteLength)
        });

        setWorkbook(wb);
        setLoading(false);
      } catch (err) {
        console.error('Error loading Excel file:', err);
        setError(err.message);
        setLoading(false);
      }
    };

    loadExcelFile();
  }, [filename, projectName]);

  // Second effect: Initialize wolf-table when sheet changes
  useEffect(() => {
    if (!workbook || !containerRef.current) return;

    try {
      // Clean up existing table instance
      if (tableRef.current) {
        tableRef.current = null;
      }

      // Clear container
      containerRef.current.innerHTML = '';

      const sheetName = workbook.SheetNames[activeSheet];
      const sheet = workbook.Sheets[sheetName];

      if (!sheet || !sheet['!ref']) {
        console.warn(`Sheet "${sheetName}" has no range (!ref)`);
        setSheetDimensions(null);
        return;
      }

      // Calculate sheet dimensions
      const range = XLSX.utils.decode_range(sheet['!ref']);
      const rows = range.e.r + 1;
      const cols = range.e.c + 1;
      setSheetDimensions({ rows, cols });

      // Convert sheet to wolf-table format
      const tableData = convertSheetToWolfTable(sheet);

      console.log(`Rendering sheet "${sheetName}" with ${tableData.cells.length} cells`);

      // Get container dimensions
      const width = containerRef.current.offsetWidth;
      const height = containerRef.current.offsetHeight;

      console.log(`Creating table with dimensions: ${width}x${height}`);

      // Create wolf-table instance
      const table = Table.create(
        containerRef.current,
        () => width,
        () => height,
        {
          scrollable: true,
          resizable: true,
          selectable: true,
          editable: false, // Read-only
          copyable: true,
        }
      );

      // Load data into table
      table.data(tableData).render();

      tableRef.current = table;
    } catch (err) {
      console.error('Error initializing wolf-table:', err);
      console.error('Full stack:', err.stack);
      setError(err.message + ' (Check console for details)');
    }

    // Cleanup on unmount
    return () => {
      if (tableRef.current) {
        tableRef.current = null;
      }
    };
  }, [workbook, activeSheet]);

  /**
   * Convert SheetJS sheet to wolf-table format
   * wolf-table expects: { styles: [...], cells: [[row, col, value], ...] }
   */
  const convertSheetToWolfTable = (sheet) => {
    const range = XLSX.utils.decode_range(sheet['!ref']);
    const cells = [];
    const styles = [];
    const styleMap = new Map(); // Map to reuse styles

    console.log(`Processing range: ${sheet['!ref']}, Rows: ${range.e.r + 1}, Cols: ${range.e.c + 1}`);

    // Process cells
    for (let R = range.s.r; R <= range.e.r; ++R) {
      for (let C = range.s.c; C <= range.e.c; ++C) {
        const cellRef = XLSX.utils.encode_cell({ r: R, c: C });
        const cell = sheet[cellRef];

        if (!cell) {
          // Skip empty cells
          continue;
        }

        // Get cell value
        const value = cell.w || String(cell.v || '');

        // Handle cell styling
        let styleIndex = undefined;
        if (cell.s) {
          const styleKey = JSON.stringify(cell.s);

          if (styleMap.has(styleKey)) {
            styleIndex = styleMap.get(styleKey);
          } else {
            const style = {};

            // Font
            if (cell.s.font) {
              if (cell.s.font.bold) style.bold = true;
              if (cell.s.font.italic) style.italic = true;
              if (cell.s.font.underline) style.underline = true;
              if (cell.s.font.strike) style.strikethrough = true;
              if (cell.s.font.sz) style.fontSize = cell.s.font.sz;
              if (cell.s.font.color && cell.s.font.color.rgb) {
                style.color = '#' + cell.s.font.color.rgb;
              }
            }

            // Alignment
            if (cell.s.alignment) {
              if (cell.s.alignment.horizontal) {
                style.align = cell.s.alignment.horizontal;
              }
            }

            if (Object.keys(style).length > 0) {
              styleIndex = styles.length;
              styles.push(style);
              styleMap.set(styleKey, styleIndex);
            }
          }
        }

        // Add cell to array
        if (styleIndex !== undefined) {
          cells.push([R, C, { value, style: styleIndex }]);
        } else {
          cells.push([R, C, value]);
        }
      }
    }

    console.log(`Converted ${cells.length} cells with ${styles.length} unique styles`);

    return { styles, cells };
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
        <Alert severity="error">
          <Typography variant="h6" gutterBottom>Error Loading Excel File</Typography>
          <Typography>{error}</Typography>
        </Alert>
      </Box>
    );
  }

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Metadata Header */}
      {metadata && (
        <Box sx={{ p: 2, backgroundColor: '#f5f5f5', borderBottom: '1px solid #ddd' }}>
          <Typography variant="body2" sx={{ fontWeight: 'bold', mb: 0.5 }}>
            {filename}
          </Typography>
          <Typography variant="caption" sx={{ color: '#666' }}>
            {metadata.sheetCount} sheet{metadata.sheetCount !== 1 ? 's' : ''}
            {' • '}
            {metadata.fileSize}
            {sheetDimensions && (
              <>
                {' • '}
                {sheetDimensions.rows} row{sheetDimensions.rows !== 1 ? 's' : ''} × {sheetDimensions.cols} column{sheetDimensions.cols !== 1 ? 's' : ''}
              </>
            )}
          </Typography>
        </Box>
      )}

      {/* Sheet Tabs */}
      {metadata && metadata.sheetCount > 1 && (
        <Box sx={{ borderBottom: 1, borderColor: 'divider', backgroundColor: '#fff' }}>
          <Tabs
            value={activeSheet}
            onChange={(e, newValue) => setActiveSheet(newValue)}
            variant="scrollable"
            scrollButtons="auto"
          >
            {metadata.sheetNames.map((name, idx) => (
              <Tab key={idx} label={name} />
            ))}
          </Tabs>
        </Box>
      )}

      {/* Table Container */}
      <Box
        ref={containerRef}
        sx={{
          flex: 1,
          overflow: 'hidden',
          position: 'relative',
          backgroundColor: '#fff',
          fontFamily: 'Roboto, sans-serif',
          '& *': {
            fontFamily: 'Roboto, sans-serif !important',
          },
        }}
      />
    </Box>
  );
}
