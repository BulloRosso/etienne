import React from 'react';
import { List, ListItem, ListItemText, Box, Typography } from '@mui/material';
import { CiFileOn } from 'react-icons/ci';
import { BsRobot } from 'react-icons/bs';
import LiveHTMLPreview from './LiveHTMLPreview';
import JSONViewer from './JSONViewer';
import BackgroundInfo from './BackgroundInfo';

export default function FilesPanel({ files, projectName, showBackgroundInfo }) {
  const isHtmlFile = (filename) => {
    return filename && (filename.endsWith('.html') || filename.endsWith('.htm'));
  };

  const isJsonFile = (filename) => {
    return filename && filename.endsWith('.json');
  };

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Box sx={{ p: 2, pb: 0 }}>
        <BackgroundInfo infoId="live-changes" showBackgroundInfo={showBackgroundInfo} />
      </Box>
      {files.length === 0 ? (
        <Box
          sx={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#ccc',
            fontSize: '36px',
            textAlign: 'center',
            gap: 2
          }}
        >
          <BsRobot size={72} color="#ccc" />
          <Box>
            <Typography sx={{ fontSize: '36px', color: '#ccc', lineHeight: 1.2 }}>
              Use Case
            </Typography>
            <Typography sx={{ fontSize: '36px', color: '#ccc', fontWeight: 'bold', lineHeight: 1.2 }}>
              Virtual Collaborator/Expert
            </Typography>
          </Box>
        </Box>
      ) : (
        <List dense sx={{ flex: 1, overflow: 'auto' }}>
          {files.map(f => (
          <ListItem key={f.path} alignItems="flex-start" sx={{ display: 'block' }}>
            {isHtmlFile(f.path) ? (
              <Box sx={{ width: '100%', mb: 2 }}>
                <Typography variant="subtitle2" sx={{ mb: 1, display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <CiFileOn />
                  {f.path}
                </Typography>
                <Box
                  sx={{
                    width: '100%',
                    height: '800px',
                    resize: 'vertical',
                    overflow: 'auto',
                    border: '1px solid',
                    borderColor: 'divider',
                  }}
                >
                  <LiveHTMLPreview filename={f.path} projectName={projectName} />
                </Box>
              </Box>
            ) : isJsonFile(f.path) ? (
              <Box sx={{ width: '100%', mb: 2 }}>
                <Typography variant="subtitle2" sx={{ mb: 1, display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <CiFileOn />
                  {f.path}
                </Typography>
                <Box
                  sx={{
                    width: '100%',
                    height: '800px',
                    resize: 'vertical',
                    overflow: 'auto',
                    border: '1px solid',
                    borderColor: 'divider',
                  }}
                >
                  <JSONViewer filename={f.path} projectName={projectName} />
                </Box>
              </Box>
            ) : (
              <ListItemText
                primary={
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <CiFileOn />
                    {f.path}
                  </Box>
                }
                secondary={
                  <pre style={{ whiteSpace: 'pre-wrap', margin: 0, fontSize: '12px' }}>{f.content}</pre>
                }
              />
            )}
          </ListItem>
        ))}
        </List>
      )}
    </Box>
  );
}
