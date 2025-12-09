import React, { useEffect, useRef, useState } from 'react';
import { Send, Loader2, Paperclip, Mic, Square } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { Card } from './ui/Card';
import { cn } from '../lib/utils';
import { api } from '../lib/api';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

interface ChatProps {
  messages: Message[];
  onSendMessage: (message: string, fileContent?: string) => void;
  isLoading: boolean;
}

const MessageBubble: React.FC<{ message: Message }> = ({ message }) => {
  const isUser = message.role === 'user';

  return (
    <div
      className={cn(
        'flex w-full mb-4 animate-slide-in',
        isUser ? 'justify-end' : 'justify-start'
      )}
    >
      <Card
        className={cn(
          'max-w-[85%] p-4 shadow-none',
          isUser
            ? 'bg-muted/80 text-foreground border-transparent'
            : 'bg-transparent text-foreground border-transparent'
        )}
      >
        {isUser ? (
          <p className="whitespace-pre-wrap m-0 text-sm leading-relaxed">
            {message.content}
          </p>
        ) : (
          <div className="markdown-content">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                h1: ({ node, ...props }) => (
                  <h1 className="text-xl font-bold mb-3 mt-4 first:mt-0 text-foreground" {...props} />
                ),
                h2: ({ node, ...props }) => (
                  <h2 className="text-lg font-bold mb-2 mt-3 first:mt-0 text-foreground" {...props} />
                ),
                h3: ({ node, ...props }) => (
                  <h3 className="text-base font-bold mb-2 mt-3 first:mt-0 text-foreground" {...props} />
                ),
                p: ({ node, ...props }) => (
                  <p className="mb-3 last:mb-0 text-sm leading-relaxed text-foreground" {...props} />
                ),
                strong: ({ node, ...props }) => (
                  <strong className="font-bold text-foreground" {...props} />
                ),
                em: ({ node, ...props }) => (
                  <em className="italic text-foreground" {...props} />
                ),
                ul: ({ node, ...props }) => (
                  <ul className="list-disc list-inside mb-3 space-y-1 text-foreground" {...props} />
                ),
                ol: ({ node, ...props }) => (
                  <ol className="list-decimal list-inside mb-3 space-y-1 text-foreground" {...props} />
                ),
                li: ({ node, ...props }) => (
                  <li className="text-sm leading-relaxed ml-2 text-foreground" {...props} />
                ),
                code: ({ node, inline, ...props }: any) =>
                  inline ? (
                    <code
                      className="bg-background/50 px-1.5 py-0.5 rounded text-xs font-mono border border-border"
                      {...props}
                    />
                  ) : (
                    <code
                      className="block bg-background/50 p-3 rounded-md text-xs font-mono overflow-x-auto border border-border my-2"
                      {...props}
                    />
                  ),
                pre: ({ node, ...props }) => (
                  <pre className="bg-background/50 p-3 rounded-md overflow-x-auto border border-border my-2" {...props} />
                ),
                blockquote: ({ node, ...props }) => (
                  <blockquote
                    className="border-l-4 border-primary pl-4 italic my-3 text-foreground/80"
                    {...props}
                  />
                ),
                a: ({ node, ...props }) => (
                  <a className="text-primary hover:underline" {...props} />
                ),
                hr: ({ node, ...props }) => (
                  <hr className="my-4 border-border" {...props} />
                ),
              }}
            >
              {message.content}
            </ReactMarkdown>
          </div>
        )}
      </Card>
    </div>
  );
};

const VoiceVisualizer = ({ isListening, volume }: { isListening: boolean; volume: number }) => {
  // Create 5 bars with different heights based on volume
  return (
    <div className="flex items-center justify-center gap-1 h-8">
      {[1, 2, 3, 4, 5].map((i) => {
        // Calculate dynamic height based on volume and index
        // Center bars (3) move most, outer bars (1, 5) move least
        const sensitivity = i === 3 ? 1.5 : i === 2 || i === 4 ? 1.2 : 0.8;
        const height = Math.max(4, Math.min(24, volume * 5 * sensitivity));
        
        return (
          <div
            key={i}
            className={cn(
              "w-1 bg-primary rounded-full transition-all duration-75",
              isListening ? "opacity-100" : "opacity-30"
            )}
            style={{ height: `${height}px` }}
          />
        );
      })}
    </div>
  );
};

export const Chat: React.FC<ChatProps> = ({ messages, onSendMessage, isLoading }) => {
  const [input, setInput] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [interimTranscript, setInterimTranscript] = useState('');
  const [recordingStatus, setRecordingStatus] = useState('Initializing...');
  const [audioVolume, setAudioVolume] = useState(0);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<any>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const shouldRecordRef = useRef(false);

  // Initialize audio analysis
  const startAudioAnalysis = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      
      const audioContext = audioContextRef.current;
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      analyserRef.current = analyser;
      
      const source = audioContext.createMediaStreamSource(stream);
      source.connect(analyser);
      sourceRef.current = source;
      
      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      
      const updateVolume = () => {
        if (!shouldRecordRef.current) return;
        
        analyser.getByteFrequencyData(dataArray);
        
        // Calculate average volume
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i];
        }
        const average = sum / dataArray.length;
        setAudioVolume(average);
        
        animationFrameRef.current = requestAnimationFrame(updateVolume);
      };
      
      updateVolume();
    } catch (error) {
      console.error('Error accessing microphone for visualizer:', error);
    }
  };

  const stopAudioAnalysis = () => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }
    if (sourceRef.current) {
      sourceRef.current.disconnect();
    }
    // Don't close AudioContext as we might reuse it
    setAudioVolume(0);
  };

  // Initialize speech recognition
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRecognition) {
        const recognition = new SpeechRecognition();
        recognition.continuous = false; // Use manual restart for better reliability
        recognition.interimResults = true;
        recognition.lang = 'en-US';

        recognition.onstart = () => {
          setRecordingStatus('Listening...');
          startAudioAnalysis();
        };

        recognition.onresult = (event: any) => {
          let interim = '';
          let final = '';
          for (let i = event.resultIndex; i < event.results.length; i++) {
            const transcript = event.results[i][0].transcript;
            if (event.results[i].isFinal) {
              final += transcript + ' ';
            } else {
              interim += transcript;
            }
          }
          
          if (final) {
            setInput((prev) => prev + final);
          }
          setInterimTranscript(interim);
        };

        recognition.onerror = (event: any) => {
          console.error('Speech recognition error:', event.error);
          if (event.error === 'not-allowed') {
            alert('Microphone access denied. Please allow microphone permissions in your browser settings.');
            shouldRecordRef.current = false;
            setIsRecording(false);
            stopAudioAnalysis();
          } else if (event.error === 'no-speech') {
             // Ignore no-speech error
          } else {
             setRecordingStatus(`Error: ${event.error}`);
          }
        };

        recognition.onend = () => {
          if (shouldRecordRef.current) {
            // Restart immediately
            try {
              recognition.start();
            } catch (e) {
              // If immediate restart fails, try with small delay
              setTimeout(() => {
                if (shouldRecordRef.current) {
                   try { recognition.start(); } catch(e) {}
                }
              }, 100);
            }
          } else {
            setIsRecording(false);
            setInterimTranscript('');
            setRecordingStatus('');
            stopAudioAnalysis();
          }
        };

        recognitionRef.current = recognition;
      }
    }
    
    return () => {
      stopAudioAnalysis();
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
  }, []); // Run only once on mount

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim() && !isLoading) {
      // If file is selected, upload it first and get extracted text
      let fileContent: string | undefined = undefined;
      
      if (selectedFile) {
        try {
          // Show uploading message
          const uploadingMsg = `📄 Uploading and processing ${selectedFile.name}...`;
          setInput(uploadingMsg);
          
          // Upload file and get extracted text
          fileContent = await api.uploadFile(selectedFile);
          
          // Update message with actual content
          const preview = fileContent ?  fileContent.substring(0, 1000) : '';
          setInput(`File: ${selectedFile.name}\n\nAnalyze this evidence:\n\n${preview}${fileContent && fileContent.length > 1000 ? '...' : ''}`);
        } catch (error) {
          console.error('File upload failed:', error);
          alert('Failed to process file. Please try again.');
          setSelectedFile(null);
          return;
        }
      }
      
      onSendMessage(input, fileContent);
      setInput('');
      setSelectedFile(null);
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      
      // Set a placeholder message
      if (file.type === 'application/pdf' || file.name.endsWith('.pdf')) {
        setInput(`I've uploaded a PDF file "${file.name}". Please analyze its contents for the investigation.`);
      } else if (file.name.endsWith('.docx') || file.name.endsWith('.doc')) {
        setInput(`I've uploaded a Word document "${file.name}". Please analyze its contents for the investigation.`);
      } else if (file.type.startsWith('text/') || file.name.endsWith('.txt')) {
        setInput(`I've uploaded a text file "${file.name}". Please analyze its contents for the investigation.`);
      } else if (file.type.startsWith('image/')) {
        setInput(`I've uploaded an image "${file.name}". This appears to be evidence related to the investigation.`);
      } else {
        setInput(`I've uploaded a document "${file.name}". Please analyze this evidence.`);
      }
    }
  };

  const toggleRecording = async () => {
    if (!recognitionRef.current) {
      alert('Speech recognition is not supported in your browser. Please use Chrome or Edge.');
      return;
    }

    if (isRecording) {
      shouldRecordRef.current = false;
      recognitionRef.current.stop();
      setIsRecording(false);
      setInterimTranscript('');
      stopAudioAnalysis();
    } else {
      try {
        shouldRecordRef.current = true;
        await recognitionRef.current.start();
        setIsRecording(true);
        setRecordingStatus('Initializing...');
      } catch (error) {
        console.error('Failed to start recording:', error);
        shouldRecordRef.current = false;
        alert('Failed to start recording. Please check your microphone permissions.');
      }
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto px-4 py-6">
        {messages.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center text-muted-foreground max-w-md">
              <h3 className="text-3xl font-semibold mb-2 text-foreground">
                Crime Investigation GPT
              </h3>
              <p className="text-sm">How can I help you with your investigation today?</p>
            </div>
          </div>
        ) : (
          <div className="max-w-4xl mx-auto">
            {messages.map((message, index) => (
              <MessageBubble key={index} message={message} />
            ))}
            {isLoading && (
              <div className="flex justify-start mb-4">
                <Card className="bg-muted/50 p-4 border-transparent">
                  <div className="flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span className="text-sm text-muted-foreground">Analyzing...</span>
                  </div>
                </Card>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Input Area - ChatGPT Style */}
      <div className="border-t border-border bg-background">
        <div className="max-w-3xl mx-auto px-4 py-4">
          {/* File upload indicator */}
          {selectedFile && (
            <div className="mb-2 p-2 bg-muted/50 rounded-lg flex items-center justify-between animate-slide-in">
              <div className="flex items-center gap-2 text-sm">
                <Paperclip className="w-4 h-4" />
                <span>{selectedFile.name}</span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSelectedFile(null)}
                className="h-6 w-6 p-0"
              >
                ×
              </Button>
            </div>
          )}
          
          <form onSubmit={handleSubmit}>
            <div className="relative flex items-center bg-muted/50 rounded-2xl border border-input hover:border-ring focus-within:border-ring focus-within:shadow-lg transition-all">
              
              {/* Recording Overlay */}
              {isRecording && (
                <div className="absolute inset-0 bg-background/95 backdrop-blur-sm z-10 flex items-center justify-between px-4 rounded-2xl border border-primary/20 animate-fade-in">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <VoiceVisualizer isListening={isRecording} volume={audioVolume} />
                    <div className="flex flex-col overflow-hidden">
                      <span className="text-xs font-medium text-primary animate-pulse">{recordingStatus}</span>
                      <span className="text-sm text-muted-foreground truncate">
                        {interimTranscript || "Speak now..."}
                      </span>
                    </div>
                  </div>
                  <Button 
                    type="button"
                    variant="ghost" 
                    size="icon" 
                    className="h-8 w-8 shrink-0 text-destructive hover:bg-destructive/10 hover:text-destructive"
                    onClick={toggleRecording}
                  >
                    <Square className="w-4 h-4 fill-current" />
                  </Button>
                </div>
              )}

              {/* File upload button */}
              <input
                ref={fileInputRef}
                type="file"
                onChange={handleFileSelect}
                className="hidden"
                accept=".txt,.pdf,.doc,.docx,.jpg,.png"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => fileInputRef.current?.click()}
                className="ml-2 h-8 w-8 shrink-0 hover:bg-transparent"
                disabled={isLoading}
              >
                <Paperclip className="w-4 h-4" />
              </Button>

              {/* Text input */}
              <Input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Message Crime Investigation GPT..."
                disabled={isLoading}
                className="flex-1 border-0 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0 px-2 py-3 text-sm"
              />

              {/* Voice recording button */}
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={toggleRecording}
                className={cn(
                  "h-8 w-8 shrink-0 hover:bg-transparent",
                  isRecording && "text-destructive"
                )}
                disabled={isLoading}
              >
                <Mic className="w-4 h-4" />
              </Button>

              {/* Send button */}
              <Button 
                type="submit" 
                disabled={isLoading || !input.trim()} 
                size="icon"
                className="mr-2 h-8 w-8 shrink-0 rounded-lg bg-primary hover:bg-primary/90 disabled:bg-muted disabled:text-muted-foreground"
              >
                {isLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
              </Button>
            </div>
          </form>
          <p className="text-xs text-muted-foreground text-center mt-2">
            Crime Investigation GPT can make mistakes. Consider verifying important information.
          </p>
        </div>
      </div>
    </div>
  );
};
