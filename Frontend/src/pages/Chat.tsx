import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Send, Users, ChevronLeft, Menu } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { cn } from "@/lib/utils";
import { io, Socket } from "socket.io-client";
import { api } from "@/lib/api";
import { toast } from "sonner";

interface Message {
  id: number;
  userId: number | null;
  userName: string;
  message: string;
  timestamp: string | Date;
  type: 'user' | 'admin' | 'system';
}

interface OnlineUser {
  username: string;
  role: string;
}

const MESSAGES_LIMIT = 40;

const Chat = () => {
  const { user } = useAuth();
  const [newMessage, setNewMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [onlineUsers, setOnlineUsers] = useState<OnlineUser[]>([]);
  const [showSidebar, setShowSidebar] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMoreMessages, setHasMoreMessages] = useState(true);
  const [oldestMessageId, setOldestMessageId] = useState<number | null>(null);
  const [shouldAutoScroll, setShouldAutoScroll] = useState(true);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const socketRef = useRef<Socket | null>(null);
  const prevMessagesLengthRef = useRef(0);
  const timeoutIdsRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  // Initialize Socket.IO connection and fetch messages
  useEffect(() => {
    if (!user) return;
    let active = true;

    const initializeChat = async () => {
      try {
        // Fetch initial messages from API
        const response = await api.get<{ success: boolean; messages: Message[]; count: number }>(`/chat/messages?limit=${MESSAGES_LIMIT}`);
        
        if (response?.success && response.messages) {
          setMessages(response.messages);
          
          // Check if there are more messages
          if (response.messages.length < MESSAGES_LIMIT) {
            setHasMoreMessages(false);
          }
          
          // Set the oldest message ID for pagination
          if (response.messages.length > 0) {
            setOldestMessageId(response.messages[0].id);
          }
        }
      } catch (error) {
        console.error('Error fetching messages:', error);
      } finally {
        setIsLoading(false);
      }

      if (!active) return;
      // Initialize Socket.IO connection
      // Remove /api from the URL for Socket.IO connection
      const API_URL = import.meta.env.VITE_API_URL;
      if (!API_URL) {
        console.error('VITE_API_URL environment variable is not set');
        setIsLoading(false);
        return;
      }
      
      // Properly parse the URL to get the base URL without /api
      let BACKEND_URL: string;
      try {
        const url = new URL(API_URL);
        // Remove /api from the pathname
        url.pathname = url.pathname.replace(/\/api\/?$/, '');
        BACKEND_URL = url.origin + url.pathname;
      } catch (error) {
        console.error('Invalid API URL:', API_URL);
        setIsLoading(false);
        return;
      }
      
      console.log('Connecting to Socket.IO server:', BACKEND_URL);
      
      const socket = io(BACKEND_URL, {
        auth: callback => callback({ token: localStorage.getItem('hockey_pool_token') }),
        transports: ['websocket', 'polling']
      });

      socketRef.current = socket;

      // Connection event handlers
      socket.on('connect', () => {
        console.log('Connected to chat server');
        setIsConnected(true);
        setConnectionError(null);
      });

      socket.on('disconnect', () => {
        console.log('Disconnected from chat server');
        setIsConnected(false);
        setConnectionError('Chat disconnected. Your draft is saved below.');
      });

      socket.on('connect_error', (error) => {
        console.error('Connection error:', error);
        setIsConnected(false);
        setConnectionError(error.message || 'Failed to connect to chat server');
        toast.error('Chat connection failed. Please check your connection and try again.');
      });

      socket.on('chat:error', ({ message }: { message: string }) => toast.error(message));

      // Listen for new messages
      socket.on('chat:message', (message: Message) => {
        setMessages((prev) => [...prev, message]);
        timeoutIdsRef.current.push(setTimeout(scrollToBottom, 100));
      });

      // Listen for online users updates
      socket.on('users:online', (users: OnlineUser[]) => {
        setOnlineUsers(users);
      });

      // Listen for message deletions (admin feature)
      socket.on('chat:messageDeleted', ({ messageId }: { messageId: number }) => {
        setMessages((prev) => prev.filter((msg) => msg.id !== messageId));
      });
    };

    initializeChat();

    // Cleanup on unmount
    return () => {
      active = false;
      timeoutIdsRef.current.forEach(id => clearTimeout(id));
      timeoutIdsRef.current = [];
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
    };
  }, [user]);

  // Auto-scroll to bottom only for new messages (not when loading past messages)
  useEffect(() => {
    // Only auto-scroll if messages were added at the end (new messages)
    if (shouldAutoScroll && messages.length > prevMessagesLengthRef.current) {
    scrollToBottom();
    }
    prevMessagesLengthRef.current = messages.length;
  }, [messages, shouldAutoScroll]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const reconnect = async () => {
    try {
      await api.refreshToken();
      socketRef.current?.connect();
      setConnectionError(null);
    } catch {
      setConnectionError('Your session could not be renewed. Sign in again.');
    }
  };

  const handleSendMessage = () => {
    if (!newMessage.trim() || !socketRef.current || !isConnected || sending) return;
    const draft = newMessage;
    setSending(true);
    socketRef.current.timeout(10000).emit('chat:message', { message: draft.trim() },
      (error: Error | null, result?: { success: boolean; message?: string }) => {
        setSending(false);
        if (error || !result?.success) {
          toast.error(error ? 'Delivery was not confirmed. Check chat before retrying; your draft is saved.' : result?.message || 'Message was not sent. Your draft is saved.');
          return;
        }
        setNewMessage(current => current === draft ? '' : current);
      });
  };

  const loadMoreMessages = async () => {
    if (!oldestMessageId || isLoadingMore || !hasMoreMessages) return;
    
    setIsLoadingMore(true);
    setShouldAutoScroll(false); // Disable auto-scroll while loading past messages
    
    try {
      const response = await api.get<{ success: boolean; messages: Message[] }>(`/chat/messages?limit=${MESSAGES_LIMIT}&before=${oldestMessageId}`);
      
      if (response?.success && response.messages) {
        if (response.messages.length === 0) {
          setHasMoreMessages(false);
        } else {
          // Prepend older messages to the beginning
          setMessages((prev) => [...response.messages, ...prev]);
          
          // Update oldest message ID
          setOldestMessageId(response.messages[0].id);
          
          // Check if we got fewer messages than requested
          if (response.messages.length < MESSAGES_LIMIT) {
            setHasMoreMessages(false);
          }
          
          // Keep scroll at the top to read newly loaded messages
          timeoutIdsRef.current.push(setTimeout(() => {
            const container = messagesContainerRef.current;
            if (container) {
              container.scrollTop = 0;
            }
            setShouldAutoScroll(true); // Re-enable auto-scroll after positioning
          }, 50));
        }
      }
    } catch (error) {
      console.error('Error loading more messages:', error);
      setShouldAutoScroll(true); // Re-enable auto-scroll on error
    } finally {
      setIsLoadingMore(false);
    }
  };

  const formatTimestamp = (timestamp: string | Date) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffInMinutes = Math.floor((now.getTime() - date.getTime()) / (1000 * 60));
    
    if (diffInMinutes < 1) return 'Just now';
    if (diffInMinutes < 60) return `${diffInMinutes} minute${diffInMinutes > 1 ? 's' : ''} ago`;
    
    const diffInHours = Math.floor(diffInMinutes / 60);
    if (diffInHours < 24) return `${diffInHours} hour${diffInHours > 1 ? 's' : ''} ago`;
    
    const diffInDays = Math.floor(diffInHours / 24);
    if (diffInDays < 7) return `${diffInDays} day${diffInDays > 1 ? 's' : ''} ago`;
    
    return date.toLocaleDateString();
  };

  const isOwnMessage = (messageUserId: number | null) => {
    return user && messageUserId === user.id;
  };

  if (isLoading) {
    return (
      <div className="flex h-[calc(100vh-3.5rem)] md:h-screen items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading chat...</p>
        </div>
      </div>
    );
  }

  const getUserBadge = (type: string) => {
    switch (type) {
      case 'admin':
        return <Badge className="gradient-championship text-xs">Admin</Badge>;
      case 'system':
        return <Badge variant="outline" className="text-accent border-accent text-xs">System</Badge>;
      default:
        return null;
    }
  };

  const getAvatarColor = (userName: string) => {
    const colors = [
      'from-blue-500 to-cyan-500',
      'from-green-500 to-emerald-500',
      'from-purple-500 to-pink-500',
      'from-orange-500 to-red-500',
      'from-yellow-500 to-orange-500',
      'from-indigo-500 to-purple-500',
    ];
    const index = userName.charCodeAt(0) % colors.length;
    return colors[index];
  };

  return (
    <div className="flex h-[calc(100vh-3.5rem)] md:h-screen overflow-hidden bg-background relative">
      {/* Overlay for mobile sidebar */}
      {showSidebar && (
        <div 
          className="md:hidden absolute inset-0 bg-black/50 z-30"
          onClick={() => setShowSidebar(false)}
        />
      )}
      
      {/* Left Sidebar - Online Users */}
      <div 
        className={cn(
          "border-r bg-card flex flex-col transition-all duration-300 ease-in-out",
          "md:w-64 md:relative",
          "absolute left-0 top-0 h-full w-64 z-40",
          showSidebar ? "translate-x-0" : "-translate-x-full md:translate-x-0"
        )}
      >
        <div className="flex-shrink-0 px-4 py-4 border-b">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Users className="h-5 w-5" />
            <h2 className="font-semibold text-sm">Online</h2>
            <span className="ml-auto text-xs bg-muted px-2 py-0.5 rounded-full">
              ({onlineUsers.length})
            </span>
            {isConnected && (
              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
            )}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-3 space-y-1">
          {onlineUsers.length === 0 ? (
            <div className="text-center text-sm text-muted-foreground py-8">
              No users online
            </div>
          ) : (
            onlineUsers.map((onlineUser, index) => (
              <div 
                key={`${onlineUser.username}-${index}`}
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-muted/60 transition-colors cursor-pointer group"
            >
              <div className="relative flex-shrink-0">
                  <div className={`w-10 h-10 rounded-full bg-gradient-to-br ${getAvatarColor(onlineUser.username)} flex items-center justify-center text-white text-sm font-semibold shadow-md`}>
                    {onlineUser.username.charAt(0).toUpperCase()}
                </div>
                <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 rounded-full border-2 border-background"></div>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                    <span className="font-medium text-sm truncate">{onlineUser.username}</span>
                    {(onlineUser.role === 'admin' || onlineUser.role === 'superadmin') && (
                      <Badge className="gradient-championship text-[10px] h-4 px-1.5">Admin</Badge>
                    )}
                </div>
                <span className="text-xs text-muted-foreground">Online</span>
              </div>
            </div>
            ))
          )}
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col min-w-0 relative">
        {/* Chat Header */}
        <div className="flex-shrink-0 border-b bg-card/50 backdrop-blur-sm px-4 md:px-6 py-4">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden"
              onClick={() => setShowSidebar(!showSidebar)}
            >
              {showSidebar ? <ChevronLeft className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </Button>
            <div className="flex-1">
              <h1 className="text-lg md:text-xl font-bold gradient-hockey bg-clip-text text-transparent">
                Pool Chat
              </h1>
              <p className="text-[11px] md:text-xs text-muted-foreground mt-0.5">
                {isConnected ? (
                  <>
                    <span className="inline-block w-1.5 h-1.5 bg-green-500 rounded-full mr-1.5 animate-pulse"></span>
                    Connected
                  </>
                ) : connectionError ? (
                  <>
                    <span className="inline-block w-1.5 h-1.5 bg-red-500 rounded-full mr-1.5"></span>
                    Connection failed
                  </>
                ) : (
                  <>
                    <span className="inline-block w-1.5 h-1.5 bg-yellow-500 rounded-full mr-1.5"></span>
                    Connecting...
                  </>
                )}
              </p>
            </div>
          </div>
        </div>

        {connectionError && <div role="alert" className="px-4 py-2 text-sm">
          {connectionError} <Button variant="outline" size="sm" onClick={reconnect}>Reconnect</Button>
        </div>}
        {/* Messages Area - Scrollable */}
        <div 
          ref={messagesContainerRef}
          className="flex-1 overflow-y-auto bg-muted/10 scroll-smooth"
        >
          <div className="max-w-5xl mx-auto px-3 md:px-6 py-4">
            {/* Load More Messages Button */}
            {hasMoreMessages && messages.length > 0 && (
              <div className="flex justify-center mb-4">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={loadMoreMessages}
                  disabled={isLoadingMore}
                  className="text-xs shadow-sm"
                >
                  {isLoadingMore ? (
                    <>
                      <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-primary mr-2"></div>
                      Loading...
                    </>
                  ) : (
                    'Load Past Messages'
                  )}
                </Button>
              </div>
            )}

            {/* Messages */}
            <div className="space-y-4">
              {messages.map((msg) => {
                const isOwn = isOwnMessage(msg.userId);
                const isSystemMessage = msg.type === 'system';

                // System messages - centered
                if (isSystemMessage) {
                  return (
                    <div key={msg.id} className="flex justify-center my-4">
                      <div className="bg-muted/60 px-4 py-2 rounded-full max-w-md">
                        <div className="flex items-center justify-center gap-2">
                          {getUserBadge(msg.type)}
                          <p className="text-xs text-muted-foreground text-center">
                            {msg.message}
                          </p>
                        </div>
                        <p className="text-[10px] text-muted-foreground text-center mt-1">
                          {formatTimestamp(msg.timestamp)}
                        </p>
                      </div>
                    </div>
                  );
                }

                // Own messages - right aligned
                if (isOwn) {
                  return (
                    <div key={msg.id} className="flex justify-end">
                      <div className="flex items-end gap-2 max-w-[85%] md:max-w-[70%]">
                        <div className="flex flex-col items-end flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-xs text-muted-foreground">
                              {formatTimestamp(msg.timestamp)}
                            </span>
                            <span className="font-semibold text-sm">You</span>
                          </div>
                          <div className="bg-primary text-primary-foreground px-4 py-2.5 rounded-2xl rounded-br-sm shadow-md">
                            <p className="text-sm leading-relaxed break-words">
                              {msg.message}
                            </p>
                          </div>
                        </div>
                        <div className={`w-8 h-8 rounded-full bg-gradient-to-br ${getAvatarColor(msg.userName)} flex items-center justify-center text-white text-xs font-semibold flex-shrink-0 shadow-md`}>
                          {msg.userName.charAt(0).toUpperCase()}
                        </div>
                      </div>
                    </div>
                  );
                }

                // Other users' messages - left aligned
                return (
                  <div key={msg.id} className="flex justify-start">
                    <div className="flex items-end gap-2 max-w-[85%] md:max-w-[70%]">
                      <div className={`w-8 h-8 rounded-full bg-gradient-to-br ${getAvatarColor(msg.userName)} flex items-center justify-center text-white text-xs font-semibold flex-shrink-0 shadow-md`}>
                        {msg.userName.charAt(0).toUpperCase()}
                      </div>
                      <div className="flex flex-col items-start flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-semibold text-sm">{msg.userName}</span>
                          {getUserBadge(msg.type)}
                          <span className="text-xs text-muted-foreground">
                            {formatTimestamp(msg.timestamp)}
                          </span>
                        </div>
                        <div className="bg-muted px-4 py-2.5 rounded-2xl rounded-bl-sm shadow-sm">
                          <p className="text-sm leading-relaxed break-words">
                            {msg.message}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div ref={messagesEndRef} />
          </div>
        </div>

        {/* Message Input - Fixed at bottom */}
        <div className="flex-shrink-0 border-t bg-card/50 backdrop-blur-sm px-3 md:px-6 py-3 md:py-4">
          <div className="max-w-5xl mx-auto">
            <div className="flex gap-2 md:gap-3 items-end">
              <div className="flex-1">
                <Input
                  placeholder={isConnected ? "Type your message..." : "Draft a message while disconnected..."}
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && !e.shiftKey && handleSendMessage()}
                  aria-label="Chat message"
                  maxLength={500}
                  className="h-10 md:h-11 bg-background border-2 focus:border-primary transition-colors resize-none"
                />
              </div>
              <Button 
                onClick={handleSendMessage}
                disabled={!newMessage.trim() || !isConnected || sending}
                aria-label={sending ? "Sending message" : "Send message"}
                className="gradient-hockey h-10 w-10 md:h-11 md:w-11 shadow-lg hover:shadow-xl transition-shadow flex-shrink-0"
                size="icon"
              >
                <Send className="h-4 w-4 md:h-5 md:w-5" />
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Chat;