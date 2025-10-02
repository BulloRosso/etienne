import React, { useRef, useEffect } from 'react';
import { Box } from '@mui/material';
import ChatMessage from './ChatMessage';
import ChatInput from './ChatInput';
import TypingIndicator from './TypingIndicator';
import { StructuredMessage } from './StructuredMessage';

export default function ChatPane({ messages, structuredMessages = [], onSendMessage, streaming }) {
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, structuredMessages, streaming]);

  const handlePermissionResponse = async (permissionId, approved) => {
    // This would need to be implemented in the backend
    // For now, just log it
    console.log('Permission response:', permissionId, approved);
  };

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
        {messages.map((msg, idx) => {
          const isLastMessage = idx === messages.length - 1;
          const isAssistant = msg.role === 'assistant';

          return (
            <React.Fragment key={idx}>
              {/* Show tool calls before the last assistant message */}
              {isLastMessage && isAssistant && structuredMessages.length > 0 && (
                <>
                  {structuredMessages.map((structMsg) => (
                    <StructuredMessage
                      key={structMsg.id}
                      message={structMsg}
                      onPermissionResponse={handlePermissionResponse}
                    />
                  ))}
                </>
              )}

              <ChatMessage
                role={msg.role}
                text={msg.text}
                timestamp={msg.timestamp}
                usage={msg.usage}
              />
            </React.Fragment>
          );
        })}

        {/* If no messages yet, or last message is not assistant, show structured messages at the end */}
        {(messages.length === 0 || messages[messages.length - 1]?.role !== 'assistant') &&
          structuredMessages.length > 0 && (
          <>
            {structuredMessages.map((msg) => (
              <StructuredMessage
                key={msg.id}
                message={msg}
                onPermissionResponse={handlePermissionResponse}
              />
            ))}
          </>
        )}

        {showTypingIndicator && <TypingIndicator />}
        <div ref={messagesEndRef} />
      </Box>

      <Box sx={{ p: 0, pb: 0 }}>
        <ChatInput onSend={onSendMessage} disabled={streaming} />
      </Box>
    </Box>
  );
}
