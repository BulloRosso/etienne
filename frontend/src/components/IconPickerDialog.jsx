import React, { useMemo, useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Grid,
  Paper,
  Button,
  Typography,
  InputAdornment,
} from '@mui/material';
import { Search as SearchIcon } from '@mui/icons-material';
import { allReactIcons, reactIconNames, POPULAR_ICONS } from '../utils/iconRegistry';

export default function IconPickerDialog({ open, currentIcon, title, onSelect, onClose }) {
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    if (!search) return POPULAR_ICONS;
    const q = search.toLowerCase();
    return reactIconNames.filter((name) => name.toLowerCase().includes(q)).slice(0, 30);
  }, [search]);

  const handleClose = () => {
    setSearch('');
    onClose();
  };

  const handlePick = (name) => {
    setSearch('');
    onSelect(name);
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle>{title || 'Select icon'}</DialogTitle>
      <DialogContent>
        <TextField
          placeholder="Search icons..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          fullWidth
          size="small"
          autoFocus
          sx={{ mb: 2, mt: 1 }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon sx={{ fontSize: 18 }} />
              </InputAdornment>
            ),
          }}
        />
        <Grid container spacing={1}>
          {filtered.map((name) => {
            const IconComp = allReactIcons[name];
            if (!IconComp) return null;
            const selected = currentIcon === name;
            return (
              <Grid item key={name}>
                <Paper
                  variant={selected ? 'elevation' : 'outlined'}
                  elevation={selected ? 3 : 0}
                  sx={{
                    width: 48,
                    height: 48,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    backgroundColor: selected ? 'primary.light' : 'transparent',
                    '&:hover': { backgroundColor: 'action.hover' },
                  }}
                  onClick={() => handlePick(name)}
                >
                  <IconComp size={24} />
                </Paper>
              </Grid>
            );
          })}
        </Grid>
        {filtered.length === 0 && (
          <Typography color="text.secondary" align="center" sx={{ py: 2 }}>
            No icons found
          </Typography>
        )}
      </DialogContent>
      <DialogActions>
        {currentIcon && (
          <Button onClick={() => handlePick('')} color="error">
            Clear icon
          </Button>
        )}
        <Button onClick={handleClose}>Cancel</Button>
      </DialogActions>
    </Dialog>
  );
}
