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
import BudgetOverview from './BudgetOverview';

const getCurrencySymbol = (currency) => {
  const symbols = {
    'EUR': '€',
    'USD': '$',
    'GBP': '£',
    'JPY': '¥'
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

export default function BudgetIndicator({ project, budgetSettings, onSettingsChange }) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [currentCosts, setCurrentCosts] = useState(0);
  const [numberOfRequests, setNumberOfRequests] = useState(0);
  const [currency, setCurrency] = useState('EUR');
  const [refreshKey, setRefreshKey] = useState(0);

  // Load initial costs
  useEffect(() => {
    if (!project || !budgetSettings?.enabled) return;

    const fetchCurrentCosts = async () => {
      try {
        const response = await fetch(`/api/budget-monitoring/${project}/current`);
        const data = await response.json();
        setCurrentCosts(data.currentCosts || 0);
        setNumberOfRequests(data.numberOfRequests || 0);
        setCurrency(data.currency || 'EUR');
      } catch (error) {
        console.error('Failed to fetch current costs:', error);
      }
    };

    fetchCurrentCosts();
  }, [project, budgetSettings?.enabled]);

  // Listen for budget updates via SSE
  useEffect(() => {
    if (!project || !budgetSettings?.enabled) return;

    const es = new EventSource(`/api/budget-monitoring/${project}/stream`);

    es.addEventListener('budget-update', (e) => {
      const data = JSON.parse(e.data);
      setCurrentCosts(data.currentCosts || 0);
      setNumberOfRequests(data.numberOfRequests || 0);
      setCurrency(data.currency || 'EUR');
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

  // Calculate percentage and determine icon
  const percentage = budgetSettings.limit > 0
    ? Math.min(100, Math.floor((currentCosts / budgetSettings.limit) * 100))
    : 0;

  // Determine icon based on percentage (in 10% steps)
  const iconIndex = budgetSettings.limit > 0
    ? Math.min(10, Math.floor(percentage / 10))
    : 0;

  const PercentageIcon = percentageIcons[iconIndex];

  // Determine color (yellow if exceeded)
  const isExceeded = budgetSettings.limit > 0 && currentCosts >= budgetSettings.limit;
  const iconColor = isExceeded ? '#ffeb3b' : 'inherit';

  // Format tooltip text
  const currencySymbol = getCurrencySymbol(currency);
  const formattedCosts = currentCosts.toFixed(4);
  const tooltipText = `${formattedCosts}${currencySymbol} spent (${percentage}%)`;

  const handleDrawerOpen = () => {
    setDrawerOpen(true);
    setRefreshKey(prev => prev + 1); // Trigger refresh in BudgetOverview
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
          numberOfRequests={numberOfRequests}
          currency={currency}
          budgetSettings={budgetSettings}
          onClose={handleDrawerClose}
          onSettingsChange={onSettingsChange}
          refreshKey={refreshKey}
        />
      </Drawer>
    </>
  );
}
