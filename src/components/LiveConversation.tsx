import { useState, useRef, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, Mic, Square, Activity } from "lucide-react";
import { Modality, LiveServerMessage } from "@google/genai";
import { toast } from "sonner";
import { getAIClient } from "../lib/gemini";

export function LiveConversation() {
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [transcript, setTranscript] = useState<{role: string, text: string}[]>([]);
  
  const audioContextRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const sessionRef = useRef<any>(null);
  const nextPlayTimeRef = useRef<number>(0);

  const connectLiveAPI = async () => {
    setIsConnecting(true);
    try {
      const ai = getAIClient();
      
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      
      const sessionPromise = ai.live.connect({
        model: "gemini-3.1-flash-live-preview",
        callbacks: {
          onopen: async () => {
            setIsConnected(true);
            setIsConnecting(false);
            toast.success("Connected to Live API");
            
            // Setup microphone
            try {
              const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
              streamRef.current = stream;
              const source = audioContextRef.current!.createMediaStreamSource(stream);
              const processor = audioContextRef.current!.createScriptProcessor(4096, 1, 1);
              processorRef.current = processor;

              processor.onaudioprocess = (e) => {
                const inputData = e.inputBuffer.getChannelData(0);
                const pcm16 = new Int16Array(inputData.length);
                for (let i = 0; i < inputData.length; i++) {
                  pcm16[i] = Math.max(-1, Math.min(1, inputData[i])) * 0x7FFF;
                }
                const buffer = new ArrayBuffer(pcm16.length * 2);
                const view = new DataView(buffer);
                for (let i = 0; i < pcm16.length; i++) {
                  view.setInt16(i * 2, pcm16[i], true);
                }
                let binary = '';
                const bytes = new Uint8Array(buffer);
                for (let i = 0; i < bytes.byteLength; i++) {
                  binary += String.fromCharCode(bytes[i]);
                }
                const base64Data = btoa(binary);
                
                sessionPromise.then((session) => {
                  session.sendRealtimeInput({
                    audio: { data: base64Data, mimeType: 'audio/pcm;rate=16000' }
                  });
                });
              };
              
              source.connect(processor);
              processor.connect(audioContextRef.current!.destination);
            } catch (err) {
              console.error("Mic error:", err);
              toast.error("Could not access microphone");
              disconnectLiveAPI();
            }
          },
          onmessage: async (message: LiveServerMessage) => {
            // Handle audio output
            const base64Audio = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
            if (base64Audio && audioContextRef.current) {
              const binary = atob(base64Audio);
              const bytes = new Uint8Array(binary.length);
              for (let i = 0; i < binary.length; i++) {
                bytes[i] = binary.charCodeAt(i);
              }
              const pcm16 = new Int16Array(bytes.buffer);
              const float32 = new Float32Array(pcm16.length);
              for (let i = 0; i < pcm16.length; i++) {
                float32[i] = pcm16[i] / 0x7FFF;
              }
              
              const audioBuffer = audioContextRef.current.createBuffer(1, float32.length, 24000);
              audioBuffer.getChannelData(0).set(float32);
              
              const source = audioContextRef.current.createBufferSource();
              source.buffer = audioBuffer;
              source.connect(audioContextRef.current.destination);
              
              const currentTime = audioContextRef.current.currentTime;
              if (nextPlayTimeRef.current < currentTime) {
                nextPlayTimeRef.current = currentTime;
              }
              source.start(nextPlayTimeRef.current);
              nextPlayTimeRef.current += audioBuffer.duration;
            }
            
            // Handle interruption
            if (message.serverContent?.interrupted) {
              nextPlayTimeRef.current = 0; // Reset playback queue
            }
          },
          onclose: () => {
            setIsConnected(false);
            setIsConnecting(false);
          },
          onerror: (error) => {
            console.error("Live API Error:", error);
            toast.error("Live API connection error");
            disconnectLiveAPI();
          }
        },
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: "Zephyr" } },
          },
          systemInstruction: "You are the PFSP-MEDINTEL Voice Assistant. Provide concise, helpful medical insights.",
        },
      });
      
      sessionRef.current = await sessionPromise;
      
    } catch (error: any) {
      console.error(error);
      toast.error(error.message || "Failed to connect to Live API");
      setIsConnecting(false);
    }
  };

  const disconnectLiveAPI = () => {
    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    if (sessionRef.current) {
      // The SDK doesn't expose a direct close method on the session object in all versions,
      // but we can try to close the underlying connection or just let it drop.
      try {
        // Attempt to close if method exists
        if (typeof sessionRef.current.close === 'function') {
          sessionRef.current.close();
        }
      } catch (e) {}
      sessionRef.current = null;
    }
    setIsConnected(false);
    setIsConnecting(false);
  };

  useEffect(() => {
    return () => {
      disconnectLiveAPI();
    };
  }, []);

  return (
    <Card className="bg-[var(--color-bg-surface)] border-[var(--color-border-glow)] shadow-[0_10px_30px_rgba(0,0,0,0.5)]">
      <CardHeader className="border-b border-[var(--color-border-glow)] pb-4">
        <CardTitle className="text-lg flex items-center gap-2 font-mono text-[var(--color-text-primary)]">
          <Activity className="w-5 h-5 text-[var(--color-accent-teal)]" />
          Live Voice Conversation
        </CardTitle>
        <CardDescription className="text-[var(--color-text-dim)]">
          Have a real-time, low-latency voice conversation with the Gemini Live API.
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-6">
        <div className="flex flex-col items-center justify-center space-y-8 py-8">
          <div className="relative">
            {isConnected && (
              <div className="absolute -inset-6 bg-[var(--color-accent-teal)]/20 rounded-full animate-pulse"></div>
            )}
            <Button
              size="lg"
              className={`w-32 h-32 rounded-full relative z-10 transition-all duration-300 ${
                isConnected 
                  ? "bg-[var(--color-danger)] hover:bg-[var(--color-danger)]/80 text-white shadow-[0_0_30px_rgba(239,68,68,0.5)]" 
                  : "bg-[var(--color-accent-teal)] hover:bg-[var(--color-accent-teal)]/80 text-[var(--color-bg-deep)] shadow-[0_0_30px_rgba(45,212,191,0.3)]"
              }`}
              onClick={isConnected ? disconnectLiveAPI : connectLiveAPI}
              disabled={isConnecting}
            >
              {isConnecting ? (
                <Loader2 className="w-12 h-12 animate-spin" />
              ) : isConnected ? (
                <Square className="w-12 h-12 fill-current" />
              ) : (
                <Mic className="w-12 h-12" />
              )}
            </Button>
          </div>
          
          <div className="text-center">
            <h3 className="font-mono text-xl text-[var(--color-text-primary)]">
              {isConnecting ? "Connecting..." : isConnected ? "Live Session Active" : "Tap to Connect"}
            </h3>
            <p className="text-sm text-[var(--color-text-dim)] mt-2 max-w-md mx-auto">
              {isConnected 
                ? "Speak naturally. The AI will listen and respond in real-time. Tap the square to end the session." 
                : "Establish a WebSocket connection to the Gemini Live API for a seamless voice conversation."}
            </p>
          </div>

          {isConnected && (
            <div className="flex items-center gap-3 text-[var(--color-accent-teal)] font-mono text-sm uppercase tracking-widest bg-[var(--color-accent-teal)]/10 px-4 py-2 rounded-full border border-[var(--color-accent-teal)]/30">
              <span className="relative flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[var(--color-accent-teal)] opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-[var(--color-accent-teal)]"></span>
              </span>
              Streaming Audio
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
