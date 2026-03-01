import React, { useState, useEffect } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Box, Typography, Button, IconButton,
  CircularProgress, List, ListItem, ListItemText,
  Checkbox, Divider
} from '@mui/material';
import { Close } from '@mui/icons-material';
import { GiTwoCoins } from 'react-icons/gi';
import { useTranslation } from 'react-i18next';
import { apiAxios } from '../services/api';

export default function DonClippoModal({ open, onClose, projectName, sessionId }) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState(null);
  const [error, setError] = useState(null);
  const [applying, setApplying] = useState(false);
  const [selectedServers, setSelectedServers] = useState([]);
  const [selectedSkills, setSelectedSkills] = useState([]);

  useEffect(() => {
    if (open) {
      setSuggestions(null);
      setError(null);
      setApplying(false);
      setSelectedServers([]);
      setSelectedSkills([]);
      fetchSuggestions();
    }
  }, [open]);

  const fetchSuggestions = async () => {
    setLoading(true);
    try {
      const response = await apiAxios.post('/api/auto-configuration/suggest', {
        projectName,
        sessionId: sessionId || 'default',
      });
      const data = response.data;
      setSuggestions(data);
      // Pre-select all suggestions
      setSelectedServers(data.suggestedServers?.map(s => s.name) || []);
      setSelectedSkills(data.suggestedSkills || []);
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Failed to get suggestions');
    } finally {
      setLoading(false);
    }
  };

  const toggleServer = (name) => {
    setSelectedServers(prev =>
      prev.includes(name) ? prev.filter(n => n !== name) : [...prev, name]
    );
  };

  const toggleSkill = (skillName) => {
    setSelectedSkills(prev => {
      const exists = prev.some(s => s.name === skillName);
      if (exists) {
        return prev.filter(s => s.name !== skillName);
      } else {
        const original = suggestions.suggestedSkills.find(s => s.name === skillName);
        return [...prev, original];
      }
    });
  };

  const handleApply = async () => {
    setApplying(true);
    try {
      await apiAxios.post('/api/auto-configuration/apply', {
        projectName,
        serverNames: selectedServers,
        skillNames: selectedSkills.map(s => ({ name: s.name, source: s.source })),
      });
      onClose();
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Failed to apply configuration');
    } finally {
      setApplying(false);
    }
  };

  const hasSuggestions = suggestions &&
    (suggestions.suggestedServers?.length > 0 || suggestions.suggestedSkills?.length > 0);

  const hasSelections = selectedServers.length > 0 || selectedSkills.length > 0;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        {t('donClippo.title')}
        <IconButton onClick={onClose} size="small">
          <Close />
        </IconButton>
      </DialogTitle>
      <DialogContent dividers>
        <Box sx={{ display: 'flex', gap: 3, minHeight: 300 }}>
          {/* Left side: Don Clippo image */}
          <Box sx={{ flexShrink: 0, width: 200, display: 'flex', alignItems: 'flex-start' }}>
            <img
              src="/don-clippo.png"
              alt="Don Clippo"
              style={{ width: '100%', borderRadius: 8 }}
            />
          </Box>

          {/* Right side: loading, error, or results */}
          <Box sx={{ flex: 1 }}>
            {loading ? (
              <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', py: 4 }}>
                <CircularProgress size={48} />
                <Typography sx={{ mt: 3, fontStyle: 'italic', color: 'text.secondary', textAlign: 'center' }}>
                  {t('donClippo.waitingMessage')}
                </Typography>
              </Box>
            ) : error ? (
              <Typography color="error" sx={{ py: 2 }}>
                {t('donClippo.error', { message: error })}
              </Typography>
            ) : suggestions ? (
              <>
                {suggestions.reasoning && (
                  <Typography variant="body2" sx={{ mb: 2, fontStyle: 'italic', color: 'text.secondary' }}>
                    "{suggestions.reasoning}"
                  </Typography>
                )}

                {hasSuggestions ? (
                  <>
                    {suggestions.suggestedServers?.length > 0 && (
                      <>
                        <Typography variant="subtitle2" sx={{ mt: 1, fontWeight: 'bold' }}>
                          {t('donClippo.suggestedServers')}
                        </Typography>
                        <List dense>
                          {suggestions.suggestedServers.map(server => (
                            <ListItem key={server.name} sx={{ px: 0, alignItems: 'flex-start' }}>
                              <Checkbox
                                checked={selectedServers.includes(server.name)}
                                onChange={() => toggleServer(server.name)}
                                size="small"
                              />
                              <ListItemText
                                primary={server.name}
                                secondary={server.reason || server.description}
                                primaryTypographyProps={{ variant: 'subtitle2', fontFamily: 'monospace' }}
                                secondaryTypographyProps={{ sx: { fontSize: '0.75rem' } }}
                              />
                            </ListItem>
                          ))}
                        </List>
                      </>
                    )}

                    {suggestions.suggestedServers?.length > 0 && suggestions.suggestedSkills?.length > 0 && (
                      <Divider sx={{ my: 1 }} />
                    )}

                    {suggestions.suggestedSkills?.length > 0 && (
                      <>
                        <Typography variant="subtitle2" sx={{ mt: 1, fontWeight: 'bold' }}>
                          {t('donClippo.suggestedSkills')}
                        </Typography>
                        <List dense>
                          {suggestions.suggestedSkills.map(skill => (
                            <ListItem key={skill.name} sx={{ px: 0, alignItems: 'flex-start' }}>
                              <Checkbox
                                checked={selectedSkills.some(s => s.name === skill.name)}
                                onChange={() => toggleSkill(skill.name)}
                                size="small"
                              />
                              <ListItemText
                                primary={skill.name}
                                secondary={skill.reason || skill.description}
                                primaryTypographyProps={{ variant: 'subtitle2', fontFamily: 'monospace' }}
                                secondaryTypographyProps={{ sx: { fontSize: '0.75rem' } }}
                              />
                            </ListItem>
                          ))}
                        </List>
                      </>
                    )}
                  </>
                ) : (
                  <Typography variant="body2" sx={{ py: 2, fontStyle: 'italic', color: 'text.secondary' }}>
                    {t('donClippo.noSuggestions')}
                  </Typography>
                )}
              </>
            ) : null}
          </Box>
        </Box>
      </DialogContent>
      <DialogActions sx={{ p: 2, gap: 1 }}>
        {hasSuggestions && (
          <Button
            variant="contained"
            onClick={handleApply}
            disabled={applying || !hasSelections}
            color="primary"
            startIcon={<GiTwoCoins />}
          >
            {applying ? t('donClippo.applying') : t('donClippo.accept')}
          </Button>
        )}
        <Button onClick={onClose} variant="outlined">
          {t('common.close')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
