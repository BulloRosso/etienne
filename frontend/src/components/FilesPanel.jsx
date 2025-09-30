import React from 'react';
import { List, ListItem, ListItemText } from '@mui/material';

export default function FilesPanel({ files }) {
  return (
    <List dense sx={{ height: '100%', overflow: 'auto' }}>
      {files.map(f => (
        <ListItem key={f.path} alignItems="flex-start" sx={{ display: 'block' }}>
          <ListItemText
            primary={f.path}
            secondary={
              <pre style={{ whiteSpace: 'pre-wrap', margin: 0, fontSize: '12px' }}>{f.content}</pre>
            }
          />
        </ListItem>
      ))}
    </List>
  );
}
