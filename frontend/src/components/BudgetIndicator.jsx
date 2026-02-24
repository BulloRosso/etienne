import React, { useState, useEffect } from 'react';
import { IconButton, Drawer, Tooltip } from '@mui/material';
import {
  TbPercentage0,
  TbPercentage10,
  TbPercentage20,
  TbPercentage30,
  TbPercentage40,
  TbPercentage50,
  TbPercentage60,
  TbPercentage70,
  TbPercentage80,
  TbPercentage90,
  TbPercentage100
} from 'react-icons/tb';
import { apiFetch, authSSEUrl } from '../services/api';
import BudgetOverview from './BudgetOverview';

const getCurrencySymbol = (currency) => {
  const symbols = {
    'EUR': '\u20AC',
    'USD': '$',
    'GBP': '\u00A3',
    'JPY': '\u00A5'
  };
  return symbols[currency] || currency;
};

const percentageIcons = [
  TbPercentage0,
  TbPercentage10,
  TbPercentage20,
  TbPercentage30,
  TbPercentage40,
  TbPercentage50,
  TbPercentage60,
  TbPercentage70,
  TbPercentage80,
  TbPercentage90,
  TbPercentage100
];

export default function BudgetIndicator({ project, budgetSettings, onSettingsChange, showBackgroundInfo }) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [currentCosts, setCurrentCosts] = useState(0);
  const [numberOfSessions, setNumberOfSessions] = useState(0);
  const [currency, setCurrency] = useState('EUR');
  const [totalInputTokens, setTotalInputTokens] = useState(0);
  const [totalOutputTokens, setTotalOutputTokens] = useState(0);
  const [globalCosts, setGlobalCosts] = useState(0);
  const [globalSessions, setGlobalSessions] = useState(0);
  const [globalInputTokens, setGlobalInputTokens] = useState(0);
  const [globalOutputTokens, setGlobalOutputTokens] = useState(0);
  const [refreshKey, setRefreshKey] = useState(0);

  // Load initial costs (project + global)
  useEffect(() => {
    if (!project || !budgetSettings?.enabled) return;

    const fetchCosts = async () => {
      try {
        const [projectRes, globalRes] = await Promise.all([
          apiFetch(`/api/budget-monitoring/${project}/current`),
          apiFetch('/api/budget-monitoring/global/current')
        ]);
        const projectData = await projectRes.json();
        const globalData = await globalRes.json();

        setCurrentCosts(projectData.currentCosts || 0);
        setNumberOfSessions(projectData.numberOfSessions || 0);
        setCurrency(projectData.currency || 'EUR');
        setTotalInputTokens(projectData.totalInputTokens || 0);
        setTotalOutputTokens(projectData.totalOutputTokens || 0);

        setGlobalCosts(globalData.globalCosts || 0);
        setGlobalSessions(globalData.globalSessions || 0);
        setGlobalInputTokens(globalData.globalInputTokens || 0);
        setGlobalOutputTokens(globalData.globalOutputTokens || 0);
      } catch (error) {
        console.error('Failed to fetch costs:', error);
      }
    };

    fetchCosts();
  }, [project, budgetSettings?.enabled, refreshKey]);

  // Listen for budget updates via SSE
  useEffect(() => {
    if (!project || !budgetSettings?.enabled) return;

    const es = new EventSource(authSSEUrl(`/api/budget-monitoring/${project}/stream`));

    es.addEventListener('budget-update', (e) => {
      const data = JSON.parse(e.data);
      setCurrentCosts(data.currentCosts || 0);
      setNumberOfSessions(data.numberOfSessions || 0);
      setCurrency(data.currency || 'EUR');
      // Re-fetch global costs on any update
      apiFetch('/api/budget-monitoring/global/current')
        .then(res => res.json())
        .then(globalData => {
          setGlobalCosts(globalData.globalCosts || 0);
          setGlobalSessions(globalData.globalSessions || 0);
          setGlobalInputTokens(globalData.globalInputTokens || 0);
          setGlobalOutputTokens(globalData.globalOutputTokens || 0);
        })
        .catch(() => {});
    });

    es.onerror = () => {
      console.error('Budget monitoring SSE connection error');
    };

    return () => {
      es.close();
    };
  }, [project, budgetSettings?.enabled]);

  // Don't render if budget monitoring is not enabled
  if (!budgetSettings?.enabled) {
    return null;
  }

  // Calculate percentage based on GLOBAL costs against limit
  const percentage = budgetSettings.limit > 0
    ? Math.min(100, Math.floor((globalCosts / budgetSettings.limit) * 100))
    : 0;

  // Determine icon based on percentage (in 10% steps)
  const iconIndex = budgetSettings.limit > 0
    ? Math.min(10, Math.floor(percentage / 10))
    : 0;

  const PercentageIcon = percentageIcons[iconIndex];

  // Determine color (yellow if exceeded)
  const isExceeded = budgetSettings.limit > 0 && globalCosts >= budgetSettings.limit;
  const iconColor = isExceeded ? '#ffeb3b' : 'inherit';

  // Format tooltip text
  const currencySymbol = getCurrencySymbol(currency);
  const formattedCosts = globalCosts.toFixed(2);
  const tooltipText = `${formattedCosts}${currencySymbol} spent globally (${percentage}%)`;

  const handleDrawerOpen = () => {
    setDrawerOpen(true);
    setRefreshKey(prev => prev + 1);
  };

  const handleDrawerClose = () => {
    setDrawerOpen(false);
  };

  return (
    <>
      <Tooltip title={tooltipText} arrow>
        <IconButton
          color="inherit"
          onClick={handleDrawerOpen}
          sx={{ ml: 2 }}
        >
          <PercentageIcon style={{ fontSize: '24px', color: iconColor }} />
        </IconButton>
      </Tooltip>

      <Drawer
        anchor="left"
        open={drawerOpen}
        onClose={handleDrawerClose}
      >
        <BudgetOverview
          project={project}
          currentCosts={currentCosts}
          numberOfSessions={numberOfSessions}
          currency={currency}
          totalInputTokens={totalInputTokens}
          totalOutputTokens={totalOutputTokens}
          globalCosts={globalCosts}
          globalSessions={globalSessions}
          globalInputTokens={globalInputTokens}
          globalOutputTokens={globalOutputTokens}
          budgetSettings={budgetSettings}
          onClose={handleDrawerClose}
          onSettingsChange={(settings) => {
            onSettingsChange(settings);
            // If counters were reset, re-fetch everything
            if (settings._reset) {
              setRefreshKey(prev => prev + 1);
            }
          }}
          refreshKey={refreshKey}
          showBackgroundInfo={showBackgroundInfo}
        />
      </Drawer>
    </>
  );
}
