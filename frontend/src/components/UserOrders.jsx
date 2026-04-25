import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Box,
  Paper,
  Typography,
  IconButton,
  Menu,
  MenuItem,
  Avatar,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Skeleton,
  Tooltip
} from '@mui/material';
import { MoreVert, CheckCircle, Cancel } from '@mui/icons-material';
import { TbSearch, TbCalendarTime, TbEye, TbProgressBolt } from 'react-icons/tb';
import { PiPackageThin } from 'react-icons/pi';
import { useThemeMode } from '../contexts/ThemeContext.jsx';
import { useProject } from '../contexts/ProjectContext.jsx';
import { apiFetch } from '../services/api';
import { useTranslation } from 'react-i18next';

function timeAgo(dateString) {
  const now = new Date();
  const then = new Date(dateString);
  const seconds = Math.floor((now - then) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

const TYPE_ICONS = {
  'Research': TbSearch,
  'Scheduled Activity': TbCalendarTime,
  'Monitoring': TbEye,
};


function PlaceholderCard({ themeMode }) {
  return (
    <Paper
      elevation={0}
      sx={{
        width: '100%',
        minWidth: 0,
        p: 1.5,
        display: 'flex',
        alignItems: 'flex-start',
        gap: 1.5,
        border: '1px dashed',
        borderColor: themeMode === 'dark' ? '#555' : '#ccc',
        backgroundColor: themeMode === 'dark' ? '#333' : '#fafafa',
        opacity: 0.6,
      }}
    >
      <Skeleton variant="circular" width={36} height={36} />
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Skeleton variant="text" width="70%" height={20} />
        <Skeleton variant="text" width="50%" height={20} />
        <Skeleton variant="text" width="90%" height={16} sx={{ mt: 0.5 }} />
        <Skeleton variant="text" width="80%" height={16} />
        <Skeleton variant="text" width="60%" height={16} />
      </Box>
    </Paper>
  );
}

function OrderCard({ order, themeMode, onCancel, onRemove, onInputRequired, onNavigate }) {
  const { t } = useTranslation();
  const [anchorEl, setAnchorEl] = useState(null);
  const Icon = TYPE_ICONS[order.type] || TbSearch;
  const isCanceled = order.status.startsWith('canceled-');
  const isFinished = order.status.startsWith('complete-') || isCanceled;

  return (
    <Paper
      elevation={isFinished ? 0 : 1}
      sx={{
        width: '100%',
        minWidth: 0,
        p: 1.5,
        display: 'flex',
        flexDirection: 'column',
        gap: 0.75,
        opacity: isFinished ? 0.55 : 1,
        backgroundColor: themeMode === 'dark'
          ? (isFinished ? '#303030' : '#383838')
          : (isFinished ? '#f5f5f5' : '#fff'),
        border: order.status === 'requires-human-input'
          ? '1px solid #f57c00'
          : !isFinished
            ? `1px solid ${themeMode === 'dark' ? '#fff' : '#1976d2'}`
            : '1px solid',
        borderColor: order.status === 'requires-human-input'
          ? '#f57c00'
          : !isFinished
            ? (themeMode === 'dark' ? '#fff' : '#1976d2')
            : themeMode === 'dark' ? '#444' : '#e0e0e0',
        borderRadius: '8px',
      }}
    >
      {/* Row 1: icon + title + menu */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Avatar sx={{ bgcolor: isFinished ? '#999' : '#666', width: 28, height: 28 }}>
          <Icon size={14} color="#fff" />
        </Avatar>
        <Typography
          variant="body2"
          onClick={!isFinished ? () => onNavigate(order) : undefined}
          sx={{
            flex: 1,
            fontWeight: 'bold',
            minWidth: 0,
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
            lineHeight: 1.3,
            ...(!isFinished && {
              color: themeMode === 'dark' ? '#5b9bd5' : '#1976d2',
              cursor: 'pointer',
              '&:hover': { textDecoration: 'underline' },
            }),
          }}
        >
          {order.title}
        </Typography>
        <IconButton
          size="small"
          sx={{ flexShrink: 0 }}
          onClick={(e) => setAnchorEl(e.currentTarget)}
        >
          <MoreVert fontSize="small" />
        </IconButton>
        <Menu
          anchorEl={anchorEl}
          open={Boolean(anchorEl)}
          onClose={() => setAnchorEl(null)}
        >
          {!isFinished && (
            <MenuItem onClick={() => { setAnchorEl(null); onCancel(order); }}>
              {t('userOrders.cancel', 'Cancel')}
            </MenuItem>
          )}
          {isFinished && (
            <MenuItem onClick={() => { setAnchorEl(null); onNavigate(order); }}>
              {t('userOrders.gotoChat', 'Goto chat')}
            </MenuItem>
          )}
          <MenuItem onClick={() => { setAnchorEl(null); onRemove(order); }}>
            {t('userOrders.remove', 'Remove')}
          </MenuItem>
        </Menu>
      </Box>

      {/* Row 2: description with icon indent (28px icon + 8px gap) */}
      <Box sx={{ pl: '36px' }}>
        <Typography
          variant="caption"
          sx={{
            color: 'text.secondary',
            display: '-webkit-box',
            WebkitLineClamp: 8,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
            lineHeight: 1.4,
          }}
        >
          {order.description}
        </Typography>
        {order.status === 'requires-human-input' && (
          <Button
            size="small"
            variant="outlined"
            color="warning"
            sx={{ mt: 0.25, fontSize: '0.65rem', py: 0, textTransform: 'none' }}
            onClick={() => onInputRequired(order)}
          >
            {t('userOrders.inputRequired', 'Your input is required')}
          </Button>
        )}
      </Box>

      {/* Row 3: status icon + relative timestamp (pushed to bottom) */}
      <Box sx={{ flex: 1 }} />
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Tooltip title={order.status} arrow placement="top">
          <Box sx={{ width: 28, display: 'flex', justifyContent: 'center', flexShrink: 0 }}>
            {isFinished ? (
              isCanceled
                ? <Cancel sx={{ fontSize: 18, color: '#b71c1c' }} />
                : <CheckCircle sx={{ fontSize: 18, color: '#4caf50' }} />
            ) : (
              <TbProgressBolt size={18} color="#1976d2" />
            )}
          </Box>
        </Tooltip>
        <Typography
          variant="caption"
          sx={{ flex: 1, textAlign: 'right', color: 'text.secondary', fontSize: '0.7rem' }}
        >
          {timeAgo(order.lastActivity)}
        </Typography>
      </Box>
    </Paper>
  );
}

export default function UserOrders({ minimal = false }) {
  const { t } = useTranslation();
  const { mode: themeMode } = useThemeMode();
  const { setProject } = useProject();
  const [orders, setOrders] = useState([]);
  const [historyOrders, setHistoryOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [cancelDialog, setCancelDialog] = useState(null);
  const [cancelReason, setCancelReason] = useState('');
  const intervalRef = useRef(null);

  const fetchOrders = useCallback(async () => {
    try {
      const [activeRes, historyRes] = await Promise.all([
        apiFetch('/api/user-orders/active'),
        apiFetch('/api/user-orders/history'),
      ]);
      if (activeRes.ok) {
        const data = await activeRes.json();
        setOrders(data.orders || []);
      }
      if (historyRes.ok) {
        const data = await historyRes.json();
        setHistoryOrders((data.orders || []).slice(0, 3));
      }
    } catch (error) {
      console.error('Failed to fetch user orders:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchOrders();
    intervalRef.current = setInterval(fetchOrders, 15000);

    const handleOrdersChanged = () => fetchOrders();
    window.addEventListener('userOrdersChanged', handleOrdersChanged);

    return () => {
      clearInterval(intervalRef.current);
      window.removeEventListener('userOrdersChanged', handleOrdersChanged);
    };
  }, [fetchOrders]);

  // Combine active orders + last 3 finished into one list
  const allOrders = [...orders, ...historyOrders];

  const handleCancel = (order) => {
    setCancelDialog(order);
    setCancelReason('');
  };

  const handleConfirmCancel = async () => {
    if (!cancelDialog || !cancelReason.trim()) return;
    try {
      await apiFetch(`/api/user-orders/${cancelDialog.orderId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'canceled-by-user',
          statusMessage: cancelReason.trim(),
        }),
      });
      setCancelDialog(null);
      fetchOrders();
    } catch (error) {
      console.error('Failed to cancel order:', error);
    }
  };

  const handleRemove = async (order) => {
    try {
      await apiFetch(`/api/user-orders/${order.orderId}`, { method: 'DELETE' });
      fetchOrders();
    } catch (error) {
      console.error('Failed to remove order:', error);
    }
  };

  const handleInputRequired = (order) => {
    if (order.projectName) {
      setProject(order.projectName);
      // Dispatch event to load the specific session
      window.dispatchEvent(
        new CustomEvent('loadSession', {
          detail: { sessionId: order.sessionId, projectName: order.projectName },
        }),
      );
    }
  };

  const showPlaceholders = allOrders.length === 0;

  // In minimalistic mode, hide entirely when there are no orders
  if (minimal && showPlaceholders) return null;

  return (
    <Box sx={{ width: '100%', px: 2, py: 1.5 }}>
      <Box sx={{ display: 'flex', justifyContent: 'center', mb: 1 }}>
        <PiPackageThin size={90} color="#ccc" />
      </Box>
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
        }}
      >
        {showPlaceholders
          ? Array.from({ length: 3 }).map((_, i) => (
              <PlaceholderCard key={i} themeMode={themeMode} />
            ))
          : allOrders.map((order) => (
              <OrderCard
                key={order.orderId}
                order={order}
                themeMode={themeMode}
                onCancel={handleCancel}
                onRemove={handleRemove}
                onInputRequired={handleInputRequired}
                onNavigate={handleInputRequired}
              />
            ))}
      </Box>

      <Typography
        variant="body2"
        sx={{
          mt: '24px',
          color: 'grey.500',
          textAlign: 'center'
        }}
      >
        {t('userOrders.recentOrders')}
      </Typography>

      {/* Cancel dialog */}
      <Dialog
        open={Boolean(cancelDialog)}
        onClose={() => setCancelDialog(null)}
        maxWidth="sm"
        fullWidth
        PaperProps={{ sx: { borderTop: '4px solid #f57c00' } }}
      >
        <DialogTitle>
          {t('userOrders.cancelTitle', 'Cancel Order')}
        </DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ mb: 2 }}>
            {cancelDialog?.title}
          </Typography>
          <TextField
            autoFocus
            fullWidth
            multiline
            rows={3}
            label={t('userOrders.cancelReason', 'Reason for cancellation')}
            value={cancelReason}
            onChange={(e) => setCancelReason(e.target.value)}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCancelDialog(null)}>
            {t('userOrders.cancelDialogClose', 'Close')}
          </Button>
          <Button
            variant="contained"
            color="warning"
            disabled={!cancelReason.trim()}
            onClick={handleConfirmCancel}
          >
            {t('userOrders.cancelDialogConfirm', 'Cancel Order')}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
