import { useState, useRef } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, Mic, Volume2, Upload, FileAudio, Square, Play, Activity } from "lucide-react";
import { generateSpeech, transcribeAudio } from "../lib/gemini";
import { toast } from "sonner";
import { LiveConversation } from "./LiveConversation";

export function VoiceComm() {
  const [text, setText] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);

  const [isTranscribing, setIsTranscribing] = useState(false);
  const [transcription, setTranscription] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  const handleGenerateSpeech = async () => {
    if (!text.trim()) return;
    setIsGenerating(true);
    setAudioUrl(null);
    try {
      const url = await generateSpeech(text);
      setAudioUrl(url);
      toast.success("Speech generated");
    } catch (error: any) {
      toast.error(error.message || "Failed to generate speech");
    } finally {
      setIsGenerating(false);
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        await processAudioBlob(audioBlob);
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
      setTranscription(null);
    } catch (error) {
      console.error("Error accessing microphone:", error);
      toast.error("Could not access microphone. Please check permissions.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const processAudioBlob = async (blob: Blob) => {
    setIsTranscribing(true);
    try {
      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64String = (reader.result as string).split(",")[1];
        const fileData = {
          data: base64String,
          mimeType: blob.type || 'audio/webm',
        };

        const result = await transcribeAudio(fileData);
        setTranscription(result);
        toast.success("Audio transcribed successfully.");
        setIsTranscribing(false);
      };
      reader.readAsDataURL(blob);
    } catch (error: any) {
      console.error(error);
      toast.error(error.message || "Failed to transcribe audio");
      setIsTranscribing(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="mb-6">
        <h1 className="font-mono text-xl mb-1 text-[var(--color-text-primary)]">Voice Communications</h1>
        <p className="text-[var(--color-text-dim)] text-xs uppercase">Gemini TTS Engine // Audio Synthesis // Transcription // Live API</p>
      </div>

      <Tabs defaultValue="live" className="w-full">
        <TabsList className="grid w-full grid-cols-3 bg-[var(--color-bg-deep)] border border-[var(--color-border-glow)] mb-6">
          <TabsTrigger value="live" className="font-mono text-xs uppercase data-[state=active]:bg-[var(--color-accent-teal)]/20 data-[state=active]:text-[var(--color-accent-teal)]">
            Live Conversation
          </TabsTrigger>
          <TabsTrigger value="tts" className="font-mono text-xs uppercase data-[state=active]:bg-[var(--color-accent-teal)]/20 data-[state=active]:text-[var(--color-accent-teal)]">
            Text-to-Speech
          </TabsTrigger>
          <TabsTrigger value="transcribe" className="font-mono text-xs uppercase data-[state=active]:bg-[var(--color-accent-teal)]/20 data-[state=active]:text-[var(--color-accent-teal)]">
            Transcription
          </TabsTrigger>
        </TabsList>

        <TabsContent value="live" className="space-y-6">
          <LiveConversation />
        </TabsContent>

        <TabsContent value="tts" className="space-y-6">
          <Card className="bg-[var(--color-bg-surface)] border-[var(--color-border-glow)] shadow-[0_10px_30px_rgba(0,0,0,0.5)]">
            <CardHeader className="border-b border-[var(--color-border-glow)] pb-4">
              <CardTitle className="text-lg flex items-center gap-2 font-mono text-[var(--color-text-primary)]">
                <Volume2 className="w-5 h-5 text-[var(--color-accent-teal)]" />
                Text-to-Speech Input
              </CardTitle>
              <CardDescription className="text-[var(--color-text-dim)]">
                Enter text to be synthesized into natural-sounding speech.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6 pt-6">
              <div className="space-y-2">
                <Label className="text-[10px] text-[var(--color-text-dim)] uppercase">Message Content</Label>
                <Textarea 
                  placeholder="Enter the message you want the system to speak..." 
                  value={text}
                  onChange={e => setText(e.target.value)}
                  className="min-h-[150px] font-mono bg-[var(--color-bg-deep)] border-[var(--color-border-glow)] text-[var(--color-text-primary)] focus-visible:ring-[var(--color-accent-glow)]"
                />
              </div>

              <Button 
                onClick={handleGenerateSpeech} 
                disabled={isGenerating || !text.trim()}
                className="w-full bg-[var(--color-accent-teal)] hover:bg-[var(--color-accent-teal)]/80 text-[var(--color-bg-deep)] gap-2 font-bold tracking-wide"
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    SYNTHESIZING AUDIO...
                  </>
                ) : (
                  <>
                    <Volume2 className="w-4 h-4" />
                    GENERATE SPEECH
                  </>
                )}
              </Button>
            </CardContent>
          </Card>

          {audioUrl && (
            <Card className="bg-[var(--color-bg-surface)] border-[var(--color-border-glow)] shadow-[0_10px_30px_rgba(0,0,0,0.5)] overflow-hidden">
              <CardContent className="p-6 flex flex-col items-center gap-4">
                <div className="flex items-center gap-3 text-[var(--color-accent-teal)] font-mono text-sm uppercase tracking-widest">
                  <span className="relative flex h-3 w-3">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[var(--color-accent-teal)] opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-3 w-3 bg-[var(--color-accent-teal)]"></span>
                  </span>
                  Audio Stream Ready
                </div>
                <audio controls src={audioUrl} className="w-full max-w-md" autoPlay />
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="transcribe" className="space-y-6">
          <Card className="bg-[var(--color-bg-surface)] border-[var(--color-border-glow)] shadow-[0_10px_30px_rgba(0,0,0,0.5)]">
            <CardHeader className="border-b border-[var(--color-border-glow)] pb-4">
              <CardTitle className="text-lg flex items-center gap-2 font-mono text-[var(--color-text-primary)]">
                <Mic className="w-5 h-5 text-[var(--color-accent-teal)]" />
                Audio Transcription
              </CardTitle>
              <CardDescription className="text-[var(--color-text-dim)]">
                Record audio using your microphone to transcribe it into text using Gemini.
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-6">
              <div className="flex flex-col items-center justify-center space-y-6 py-8">
                <div className="relative">
                  {isRecording && (
                    <div className="absolute -inset-4 bg-[var(--color-danger)]/20 rounded-full animate-pulse"></div>
                  )}
                  <Button
                    size="lg"
                    className={`w-24 h-24 rounded-full relative z-10 ${
                      isRecording 
                        ? "bg-[var(--color-danger)] hover:bg-[var(--color-danger)]/80 text-white" 
                        : "bg-[var(--color-accent-teal)] hover:bg-[var(--color-accent-teal)]/80 text-[var(--color-bg-deep)]"
                    }`}
                    onClick={isRecording ? stopRecording : startRecording}
                    disabled={isTranscribing}
                  >
                    {isRecording ? (
                      <Square className="w-10 h-10 fill-current" />
                    ) : (
                      <Mic className="w-10 h-10" />
                    )}
                  </Button>
                </div>
                
                <div className="text-center">
                  <h3 className="font-mono text-lg text-[var(--color-text-primary)]">
                    {isRecording ? "Recording..." : "Tap to Record"}
                  </h3>
                  <p className="text-sm text-[var(--color-text-dim)] mt-1">
                    {isRecording ? "Tap the square to stop and transcribe" : "Speak clearly into your microphone"}
                  </p>
                </div>

                {isTranscribing && (
                  <div className="flex items-center gap-2 text-[var(--color-accent-teal)] font-mono text-sm">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Transcribing audio...
                  </div>
                )}
              </div>

              {transcription && (
                <div className="mt-6 p-4 bg-[var(--color-bg-deep)] border border-[var(--color-border-glow)] rounded-lg relative group">
                  <div className="flex justify-between items-center mb-2">
                    <h3 className="text-sm font-mono text-[var(--color-accent-teal)] uppercase tracking-wider flex items-center gap-2">
                      <FileAudio className="w-4 h-4" /> Transcription Result
                    </h3>
                  </div>
                  <div className="text-sm text-[var(--color-text-primary)] font-mono whitespace-pre-wrap">
                    {transcription}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
