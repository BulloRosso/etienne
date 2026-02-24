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
  Divider,
  Collapse,
  Tooltip
} from '@mui/material';
import { Close, ExpandMore, ExpandLess } from '@mui/icons-material';
import { apiFetch } from '../services/api';
import BudgetSettings from './BudgetSettings';
import BackgroundInfo from './BackgroundInfo';

const getCurrencySymbol = (currency) => {
  const symbols = {
    'EUR': '\u20AC',
    'USD': '$',
    'GBP': '\u00A3',
    'JPY': '\u00A5'
  };
  return symbols[currency] || currency;
};

const formatTokenCount = (tokens) => {
  if (tokens >= 1_000_000) {
    const val = tokens / 1_000_000;
    return val % 1 === 0 ? `${val} Mio.` : `${val.toFixed(1)} Mio.`;
  }
  if (tokens >= 1_000) {
    const val = tokens / 1_000;
    return val % 1 === 0 ? `${val}K` : `${val.toFixed(1)}K`;
  }
  return tokens.toLocaleString();
};

/**
 * Stacked horizontal bar: blue = all projects, red/orange = current project
 * Both segments are measured against the same limit (denominator).
 */
function StackedBudgetBar({ globalCosts, projectCosts, limit, currency, isExceeded }) {
  const currencySymbol = getCurrencySymbol(currency);
  const globalPct = limit > 0 ? Math.min(100, (globalCosts / limit) * 100) : 0;
  const projectPct = limit > 0 ? Math.min(globalPct, (projectCosts / limit) * 100) : 0;
  const otherPct = globalPct - projectPct;

  return (
    <Paper sx={{ p: 2.5, mb: 3, borderRadius: 3 }} variant="outlined">
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5 }}>
        <Typography variant="body2" color="text.secondary">
          Global Token Budget
        </Typography>
        <Typography variant="body1" fontWeight="bold" color={isExceeded ? 'error.main' : 'text.primary'}>
          {globalCosts.toFixed(2)} {currencySymbol} / {limit.toFixed(2)} {currencySymbol}
        </Typography>
      </Box>

      {/* Stacked bar */}
      <Tooltip
        title={`Current project: ${projectCosts.toFixed(2)} ${currencySymbol} | Other projects: ${(globalCosts - projectCosts).toFixed(2)} ${currencySymbol}`}
        arrow
      >
        <Box sx={{
          width: '100%',
          height: 10,
          borderRadius: 5,
          bgcolor: 'action.hover',
          overflow: 'hidden',
          display: 'flex'
        }}>
          {/* Other projects segment (blue) — rendered first (left) */}
          {otherPct > 0 && (
            <Box sx={{
              width: `${otherPct}%`,
              height: '100%',
              bgcolor: '#1976d2',
              transition: 'width 0.3s ease'
            }} />
          )}
          {/* Current project segment (red/teal) — rendered second (right portion of filled area) */}
          {projectPct > 0 && (
            <Box sx={{
              width: `${projectPct}%`,
              height: '100%',
              bgcolor: isExceeded ? '#d32f2f' : '#e57373',
              transition: 'width 0.3s ease'
            }} />
          )}
        </Box>
      </Tooltip>

      {/* Legend */}
      <Box sx={{ display: 'flex', gap: 3, mt: 1.5 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: '#1976d2' }} />
          <Typography variant="caption" color="text.secondary">All projects</Typography>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: '#e57373' }} />
          <Typography variant="caption" color="text.secondary">Current project</Typography>
        </Box>
      </Box>
    </Paper>
  );
}

export default function BudgetOverview({
  project,
  currentCosts,
  numberOfSessions,
  currency,
  totalInputTokens,
  totalOutputTokens,
  globalCosts,
  globalSessions,
  globalInputTokens,
  globalOutputTokens,
  budgetSettings,
  onClose,
  onSettingsChange,
  refreshKey,
  showBackgroundInfo
}) {
  const [recentCosts, setRecentCosts] = useState([]);
  const [totalSessions, setTotalSessions] = useState(numberOfSessions);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [activityOpen, setActivityOpen] = useState(false);

  const currencySymbol = getCurrencySymbol(currency);

  // Load recent costs - refresh when drawer opens or project changes
  useEffect(() => {
    if (!project) return;

    const fetchRecentCosts = async () => {
      try {
        const response = await apiFetch(`/api/budget-monitoring/${project}/all`);
        const data = await response.json();
        setRecentCosts(data.costs || []);
        setTotalSessions(data.numberOfSessions || 0);
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

  const formatCurrency = (num) => num.toFixed(2);
  const formatCurrencyDetail = (num) => num.toFixed(4);

  const totalTokens = (totalInputTokens || 0) + (totalOutputTokens || 0);
  const globalTotalTokens = (globalInputTokens || 0) + (globalOutputTokens || 0);
  const limit = budgetSettings?.limit || 0;
  const hasLimit = limit > 0;
  const isExceeded = hasLimit && (globalCosts || 0) >= limit;
  const avgCostPerSession = totalSessions > 0 ? currentCosts / totalSessions : 0;

  // Estimate remaining tokens based on global cost-per-token ratio
  const remainingBudget = hasLimit ? Math.max(0, limit - (globalCosts || 0)) : 0;
  const costPerToken = globalTotalTokens > 0 ? (globalCosts || 0) / globalTotalTokens : 0;
  const estimatedRemainingTokens = costPerToken > 0 ? Math.floor(remainingBudget / costPerToken) : 0;

  const tileSx = {
    flex: 1,
    p: 2,
    textAlign: 'center',
    borderRadius: 3,
    bgcolor: 'action.hover',
    boxShadow: 'none',
    minWidth: 0
  };

  return (
    <Box sx={{ width: 500, p: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h5">Budget Overview</Typography>
        <IconButton onClick={onClose} size="small">
          <Close />
        </IconButton>
      </Box>

      <BackgroundInfo infoId="budget-control" showBackgroundInfo={showBackgroundInfo} />

      {/* Stacked budget bar */}
      {hasLimit && (
        <StackedBudgetBar
          globalCosts={globalCosts || 0}
          projectCosts={currentCosts}
          limit={limit}
          currency={currency}
          isExceeded={isExceeded}
        />
      )}

      {/* Summary tiles – 2x2 grid */}
      <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
        <Paper sx={tileSx}>
          <Typography variant="h5" fontWeight="bold" color="#2e7d32">
            {formatTokenCount(totalTokens)}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Tokens used
          </Typography>
        </Paper>

        {hasLimit ? (
          <Paper sx={tileSx}>
            <Typography variant="h5" fontWeight="bold" color="#2e7d32">
              {formatTokenCount(estimatedRemainingTokens)}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Tokens remaining (est.)
            </Typography>
          </Paper>
        ) : (
          <Paper sx={tileSx}>
            <Typography variant="h5" fontWeight="bold" color="#2e7d32">
              {currencySymbol}{formatCurrency(currentCosts)}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Total costs
            </Typography>
          </Paper>
        )}
      </Box>

      <Box sx={{ display: 'flex', gap: 2, mb: 3 }}>
        <Paper sx={tileSx}>
          <Typography variant="h5" fontWeight="bold" color="#2e7d32">
            {totalSessions}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Sessions completed
          </Typography>
        </Paper>

        <Paper sx={tileSx}>
          <Typography variant="h5" fontWeight="bold" color="#2e7d32">
            {currencySymbol}{formatCurrency(avgCostPerSession)}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Avg. cost per session
          </Typography>
        </Paper>
      </Box>

      <Divider sx={{ mb: 2 }} />

      {/* Collapsible recent activity */}
      <Box
        onClick={() => setActivityOpen(!activityOpen)}
        sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', mb: 1 }}
      >
        <Typography variant="h6">
          Recent Activity
        </Typography>
        <IconButton size="small">
          {activityOpen ? <ExpandLess /> : <ExpandMore />}
        </IconButton>
      </Box>

      <Collapse in={activityOpen}>
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
                      {currencySymbol}{formatCurrencyDetail(cost.requestCosts)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Collapse>

      {/* Settings button */}
      <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 2 }}>
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
