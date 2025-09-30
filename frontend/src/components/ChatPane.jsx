import React, { useRef, useEffect } from 'react';
import { Box } from '@mui/material';
import ChatMessage from './ChatMessage';
import ChatInput from './ChatInput';
import TypingIndicator from './TypingIndicator';

export default function ChatPane({ messages, onSendMessage, streaming }) {
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, streaming]);

  // Check if we should show typing indicator (streaming but no assistant response yet, or assistant response is empty)
  const showTypingIndicator = streaming && (
    messages.length === 0 ||
    messages[messages.length - 1].role !== 'assistant' ||
    !messages[messages.length - 1].text
  );

  return (
    <Box sx={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      backgroundColor: '#fffef5'
    }}>
      <Box sx={{
        flex: 1,
        overflowY: 'auto',
        py: 2
      }}>
        {messages.map((msg, idx) => (
          <ChatMessage
            key={idx}
            role={msg.role}
            text={msg.text}
            timestamp={msg.timestamp}
            usage={msg.usage}
          />
        ))}
        {showTypingIndicator && <TypingIndicator />}
        <div ref={messagesEndRef} />
      </Box>

      <Box sx={{ p: 0, pb: 0 }}>
        <ChatInput onSend={onSendMessage} disabled={streaming} />
      </Box>
    </Box>
  );
}
