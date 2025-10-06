import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Paper,
  Button,
  IconButton,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Divider
} from '@mui/material';
import { Close } from '@mui/icons-material';
import BudgetSettings from './BudgetSettings';

const getCurrencySymbol = (currency) => {
  const symbols = {
    'EUR': '€',
    'USD': '$',
    'GBP': '£',
    'JPY': '¥'
  };
  return symbols[currency] || currency;
};

export default function BudgetOverview({
  project,
  currentCosts,
  numberOfRequests,
  currency,
  budgetSettings,
  onClose,
  onSettingsChange,
  refreshKey
}) {
  const [recentCosts, setRecentCosts] = useState([]);
  const [totalRequests, setTotalRequests] = useState(numberOfRequests);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const currencySymbol = getCurrencySymbol(currency);

  // Load recent costs - refresh when drawer opens or project changes
  useEffect(() => {
    if (!project) return;

    const fetchRecentCosts = async () => {
      try {
        console.log(`Fetching costs for project: ${project}`);
        const response = await fetch(`/api/budget-monitoring/${project}/all`);
        const data = await response.json();
        console.log('Received costs data:', data);
        // Set the costs (already limited to 10 by backend)
        setRecentCosts(data.costs || []);
        // Set the total request count from API
        setTotalRequests(data.numberOfRequests || 0);
      } catch (error) {
        console.error('Failed to fetch recent costs:', error);
      }
    };

    fetchRecentCosts();
  }, [project, refreshKey]);

  const formatDate = (timestamp) => {
    const date = new Date(timestamp);
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const formatNumber = (num) => {
    return num.toFixed(4);
  };

  return (
    <Box sx={{ width: 500, p: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h5">Budget Overview</Typography>
        <IconButton onClick={onClose} size="small">
          <Close />
        </IconButton>
      </Box>

      {/* Summary boxes */}
      <Box sx={{ display: 'flex', gap: 2, mb: 3 }}>
        <Paper sx={{ flex: 1, p: 2, textAlign: 'center' }}>
          <Typography variant="caption" color="text.secondary">
            Current Costs
          </Typography>
          <Typography variant="h6">
            {currencySymbol}{formatNumber(currentCosts)}
          </Typography>
        </Paper>

        {budgetSettings?.limit > 0 && (
          <Paper sx={{ flex: 1, p: 2, textAlign: 'center' }}>
            <Typography variant="caption" color="text.secondary">
              Limit
            </Typography>
            <Typography variant="h6">
              {currencySymbol}{formatNumber(budgetSettings.limit)}
            </Typography>
          </Paper>
        )}

        <Paper sx={{ flex: 1, p: 2, textAlign: 'center' }}>
          <Typography variant="caption" color="text.secondary">
            Requests
          </Typography>
          <Typography variant="h6">
            {totalRequests}
          </Typography>
        </Paper>
      </Box>

      <Divider sx={{ mb: 2 }} />

      {/* Recent costs table */}
      <Typography variant="h6" sx={{ mb: 2 }}>
        Recent Activity
      </Typography>

      {recentCosts.length === 0 ? (
        <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 4 }}>
          No cost data available yet
        </Typography>
      ) : (
        <TableContainer component={Paper} sx={{ maxHeight: 400, mb: 3 }}>
          <Table size="small" stickyHeader>
            <TableHead>
              <TableRow>
                <TableCell>Date</TableCell>
                <TableCell align="right">Input Tokens</TableCell>
                <TableCell align="right">Output Tokens</TableCell>
                <TableCell align="right">Cost</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {recentCosts.map((cost, index) => (
                <TableRow key={index} hover>
                  <TableCell>{formatDate(cost.timestamp)}</TableCell>
                  <TableCell align="right">{cost.inputTokens.toLocaleString()}</TableCell>
                  <TableCell align="right">{cost.outputTokens.toLocaleString()}</TableCell>
                  <TableCell align="right">
                    {currencySymbol}{formatNumber(cost.requestCosts)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {/* Settings button */}
      <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
        <Button
          variant="outlined"
          onClick={() => setSettingsOpen(true)}
        >
          Budget Settings
        </Button>
      </Box>

      {/* Settings modal */}
      <BudgetSettings
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        project={project}
        budgetSettings={budgetSettings}
        currency={currency}
        onSettingsChange={onSettingsChange}
      />
    </Box>
  );
}
