import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Paper,
  Button,
  IconButton,
  Divider,
  Tooltip,
  ToggleButton,
  ToggleButtonGroup
} from '@mui/material';
import { Close } from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import { apiFetch } from '../services/api';
import BudgetSettings from './BudgetSettings';
import BackgroundInfo from './BackgroundInfo';
import StackedAreaChart from './budget-charts/StackedAreaChart';
import TokenEconomyDonut from './budget-charts/TokenEconomyDonut';

// Token-type palette shared by the donut and the stacked area chart.
const CHART_COLORS = {
  input: '#7c9eff',
  output: '#f0b429',
  cacheRead: '#54d6b0',
  cacheWrite: '#b07cff',
};

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
  const { t } = useTranslation(["budgetOverview"]);
  const currencySymbol = getCurrencySymbol(currency);
  const globalPct = limit > 0 ? Math.min(100, (globalCosts / limit) * 100) : 0;
  const projectPct = limit > 0 ? Math.min(globalPct, (projectCosts / limit) * 100) : 0;
  const otherPct = globalPct - projectPct;

  return (
    <Paper sx={{ p: 2.5, mb: 3, borderRadius: 3 }} variant="outlined">
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5 }}>
        <Typography variant="body2" color="text.secondary">
          {t('budgetOverview:globalTokenBudget')}
        </Typography>
        <Typography variant="body1" fontWeight="bold" color={isExceeded ? 'error.main' : 'text.primary'}>
          {globalCosts.toFixed(2)} {currencySymbol} / {limit.toFixed(2)} {currencySymbol}
        </Typography>
      </Box>

      {/* Stacked bar */}
      <Tooltip
        title={t('budgetOverview:barTooltip', { projectCosts: projectCosts.toFixed(2), currencySymbol, otherCosts: (globalCosts - projectCosts).toFixed(2) })}
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
          <Typography variant="caption" color="text.secondary">{t('budgetOverview:legendAllProjects')}</Typography>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: '#e57373' }} />
          <Typography variant="caption" color="text.secondary">{t('budgetOverview:legendCurrentProject')}</Typography>
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
  totalCacheReadTokens = 0,
  totalCacheCreationTokens = 0,
  globalCosts,
  globalSessions,
  globalInputTokens,
  globalOutputTokens,
  globalCacheReadTokens = 0,
  globalCacheCreationTokens = 0,
  budgetSettings,
  onClose,
  onSettingsChange,
  refreshKey,
  showBackgroundInfo
}) {
  const { t } = useTranslation(["budgetOverview"]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [dailyCosts, setDailyCosts] = useState([]);
  const [days, setDays] = useState(30);
  const [topSessions, setTopSessions] = useState([]);

  const currencySymbol = getCurrencySymbol(currency);
  const totalSessions = numberOfSessions || 0;

  // Load daily cost time-series — refetch on project / range / refresh change
  useEffect(() => {
    if (!project) return;

    const fetchDaily = async () => {
      try {
        const response = await apiFetch(`/api/budget-monitoring/${project}/daily?days=${days}`);
        const data = await response.json();
        setDailyCosts(data.days || []);
      } catch (error) {
        console.error('Failed to fetch daily costs:', error);
      }
    };

    fetchDaily();
  }, [project, days, refreshKey]);

  // Load top sessions by cost — refetch on project / refresh change
  useEffect(() => {
    if (!project) return;

    const fetchTopSessions = async () => {
      try {
        const response = await apiFetch(`/api/budget-monitoring/${project}/top-sessions?limit=3`);
        const data = await response.json();
        setTopSessions(data.sessions || []);
      } catch (error) {
        console.error('Failed to fetch top sessions:', error);
      }
    };

    fetchTopSessions();
  }, [project, refreshKey]);

  const formatCurrency = (num) => num.toFixed(2);
  const formatCurrencyDetail = (num) => num.toFixed(4);

  const totalTokens = (totalInputTokens || 0) + (totalOutputTokens || 0);
  const globalTotalTokens = (globalInputTokens || 0) + (globalOutputTokens || 0);

  // Cache economics: a cache read costs ~10% of the input price, so every
  // cached input token saved 90% of its cost. Express savings as the fraction
  // of input-side tokens served from cache, weighted by that 90% discount.
  const cacheReadTokens = totalCacheReadTokens || 0;
  const cacheCreationTokens = totalCacheCreationTokens || 0;
  const cachedTokens = cacheReadTokens + cacheCreationTokens;
  const inputSideTokens = (totalInputTokens || 0) + cacheReadTokens;
  const cacheSavingsPct = inputSideTokens > 0
    ? Math.round((cacheReadTokens / inputSideTokens) * 90)
    : 0;

  // Cache-hit-rate: share of input-side tokens served from cache.
  const cacheHitRatePct = inputSideTokens > 0
    ? Math.round((cacheReadTokens / inputSideTokens) * 100)
    : 0;

  // Linear month-end forecast from the run-rate so far this month.
  const now = new Date();
  const dayOfMonth = now.getDate();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const monthlyForecast = dayOfMonth > 0
    ? (currentCosts / dayOfMonth) * daysInMonth
    : currentCosts;

  // Token-economy donut slices (cost share by token type).
  const donutSlices = [
    { label: t('budgetOverview:legendCacheRead'), value: cacheReadTokens, color: CHART_COLORS.cacheRead },
    { label: t('budgetOverview:columnInputTokens'), value: totalInputTokens || 0, color: CHART_COLORS.input },
    { label: t('budgetOverview:columnOutputTokens'), value: totalOutputTokens || 0, color: CHART_COLORS.output },
    { label: t('budgetOverview:columnCacheWrite'), value: cacheCreationTokens, color: CHART_COLORS.cacheWrite },
  ];

  // Stacked area chart bands (EUR/day by token type).
  const areaKeys = [
    { key: 'cacheReadCost', color: CHART_COLORS.cacheRead, label: t('budgetOverview:legendCacheRead') },
    { key: 'inputCost', color: CHART_COLORS.input, label: t('budgetOverview:legendInput') },
    { key: 'outputCost', color: CHART_COLORS.output, label: t('budgetOverview:legendOutput') },
    { key: 'cacheWriteCost', color: CHART_COLORS.cacheWrite, label: t('budgetOverview:legendCacheWrite') },
  ];

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
    <Box sx={{
      width: 1000,
      maxWidth: '100vw',
      p: 2,
      position: 'relative',
      minHeight: '100%',
      '&::after': {
        content: '""',
        position: 'absolute',
        left: '50%',
        bottom: 24,
        transform: 'translateX(-50%)',
        width: '100%',
        maxWidth: 154,
        height: '33.3%',
        backgroundImage: 'url(/budget.png)',
        backgroundSize: 'contain',
        backgroundRepeat: 'no-repeat',
        backgroundPosition: 'center bottom',
        opacity: 0.5,
        pointerEvents: 'none',
        zIndex: 0,
      }
    }}>
      <Box sx={{ position: 'relative', zIndex: 1 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h6">{t('budgetOverview:title')}</Typography>
        <IconButton onClick={onClose} size="small">
          <Close />
        </IconButton>
      </Box>

      <BackgroundInfo infoId="budget-control" showBackgroundInfo={showBackgroundInfo} />

      {/* Two-column body: left = KPIs + activity, right = charts.
          Collapses to a single column on narrow viewports. */}
      <Box sx={{ display: 'flex', gap: 3, flexDirection: { xs: 'column', md: 'row' }, alignItems: 'flex-start' }}>
      {/* Left column */}
      <Box sx={{ flex: 1, minWidth: 0, width: '100%' }}>

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
            {t('budgetOverview:tokensUsed')}
          </Typography>
        </Paper>

        {hasLimit ? (
          <Paper sx={tileSx}>
            <Typography variant="h5" fontWeight="bold" color="#2e7d32">
              {formatTokenCount(estimatedRemainingTokens)}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {t('budgetOverview:tokensRemaining')}
            </Typography>
          </Paper>
        ) : (
          <Paper sx={tileSx}>
            <Typography variant="h5" fontWeight="bold" color="#2e7d32">
              {currencySymbol}{formatCurrency(currentCosts)}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {t('budgetOverview:totalCosts')}
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
            {t('budgetOverview:sessionsCompleted')}
          </Typography>
        </Paper>

        <Paper sx={tileSx}>
          <Typography variant="h5" fontWeight="bold" color="#2e7d32">
            {currencySymbol}{formatCurrency(avgCostPerSession)}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {t('budgetOverview:avgCostPerSession')}
          </Typography>
        </Paper>
      </Box>

      {/* Cache economics row */}
      <Box sx={{ display: 'flex', gap: 2, mb: 3 }}>
        <Paper sx={tileSx}>
          <Typography variant="h5" fontWeight="bold" color="#1976d2">
            {formatTokenCount(cachedTokens)}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {t('budgetOverview:tokensCached')}
          </Typography>
        </Paper>

        <Paper sx={tileSx}>
          <Typography variant="h5" fontWeight="bold" color="#1976d2">
            {cacheSavingsPct}%
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {t('budgetOverview:cacheSavings')}
          </Typography>
        </Paper>
      </Box>

      {/* Cache-hit-rate + monthly forecast */}
      <Box sx={{ display: 'flex', gap: 2, mb: 3 }}>
        <Paper sx={tileSx}>
          <Typography variant="h5" fontWeight="bold" color="#54d6b0">
            {cacheHitRatePct}%
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {t('budgetOverview:cacheHitRate')}
          </Typography>
        </Paper>

        <Paper sx={tileSx}>
          <Typography variant="h5" fontWeight="bold" color="#f0b429">
            {currencySymbol}{formatCurrency(monthlyForecast)}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {t('budgetOverview:monthlyForecast')}
          </Typography>
        </Paper>
      </Box>

      </Box>{/* /Left column */}

      {/* Right column: charts */}
      <Box sx={{ flex: 1, minWidth: 0, width: '100%' }}>
        <Paper sx={{ p: 2.5, mb: 3, borderRadius: 3 }} variant="outlined">
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5 }}>
            <Typography variant="subtitle1" fontWeight="bold">
              {t('budgetOverview:chartCostByType')}
            </Typography>
            <ToggleButtonGroup
              size="small"
              exclusive
              value={days}
              onChange={(_e, v) => { if (v) setDays(v); }}
            >
              <ToggleButton value={7}>{t('budgetOverview:range7d')}</ToggleButton>
              <ToggleButton value={30}>{t('budgetOverview:range30d')}</ToggleButton>
              <ToggleButton value={90}>{t('budgetOverview:range90d')}</ToggleButton>
            </ToggleButtonGroup>
          </Box>
          <StackedAreaChart
            data={dailyCosts}
            keys={areaKeys}
            currencySymbol={currencySymbol}
            emptyLabel={t('budgetOverview:noCostData')}
          />
        </Paper>

        <Paper sx={{ p: 2.5, borderRadius: 3, mb: 3 }} variant="outlined">
          <Typography variant="subtitle1" fontWeight="bold" sx={{ mb: 1.5 }}>
            {t('budgetOverview:chartTokenEconomy')}
          </Typography>
          <TokenEconomyDonut slices={donutSlices} />
        </Paper>

        {/* Top sessions by cost, each with its priciest prompt */}
        {topSessions.length > 0 && (
          <Box>
            <Typography variant="subtitle1" fontWeight="bold" sx={{ mb: 1.5 }}>
              {t('budgetOverview:topSessionsTitle')}
            </Typography>
            {topSessions.map((s, idx) => (
              <Paper key={s.sessionId} variant="outlined" sx={{ p: 2, mb: 1.5, borderRadius: 3 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 1, mb: 0.5 }}>
                  <Typography variant="body2" fontWeight="bold" noWrap sx={{ minWidth: 0 }}>
                    {idx + 1}. {s.summary || s.sessionId}
                  </Typography>
                  <Typography variant="body2" fontWeight="bold" color="#f0b429" sx={{ flexShrink: 0 }}>
                    {currencySymbol}{formatCurrency(s.totalCosts)}
                  </Typography>
                </Box>
                {s.topPrompt && (
                  <>
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
                      {t('budgetOverview:topPromptLabel')}
                    </Typography>
                    <Typography
                      variant="body2"
                      sx={{
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden',
                      }}
                      title={s.topPrompt}
                    >
                      {s.topPrompt}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                      {currencySymbol}{formatCurrencyDetail(s.topPromptCosts)} · {formatTokenCount(s.topPromptTokens)} {t('budgetOverview:tokensUsed').toLowerCase()}
                    </Typography>
                  </>
                )}
              </Paper>
            ))}
          </Box>
        )}
      </Box>{/* /Right column */}

      </Box>{/* /Two-column body */}

      {/* Settings button */}
      <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 2 }}>
        <Button
          variant="outlined"
          onClick={() => setSettingsOpen(true)}
        >
          {t('budgetOverview:settingsButton')}
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
    </Box>
  );
}
