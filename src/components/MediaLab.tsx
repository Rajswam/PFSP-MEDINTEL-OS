import { useState, useRef } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, Image as ImageIcon, Video, Music, Play, Upload, Activity, Save } from "lucide-react";
import { generateImage, generateVideo, generateMusic, analyzeMedicalImage } from "../lib/gemini";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";

interface MediaLabProps {
  activeCaseId: string | null;
  onSaveToCase: (analysisText: string, source: string) => void;
}

export function MediaLab({ activeCaseId, onSaveToCase }: MediaLabProps) {
  const [prompt, setPrompt] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [resultType, setResultType] = useState<"image" | "video" | "music" | null>(null);

  // Analysis State
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleGenerateImage = async () => {
    if (!prompt.trim()) return;
    setIsGenerating(true);
    setResultUrl(null);
    try {
      const url = await generateImage(prompt);
      setResultUrl(url);
      setResultType("image");
      toast.success("Image generated");
    } catch (error: any) {
      toast.error(error.message || "Failed to generate image");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleGenerateVideo = async () => {
    if (!prompt.trim()) return;
    setIsGenerating(true);
    setResultUrl(null);
    try {
      await generateVideo(prompt);
      // We won't get a URL immediately due to polling limits in this demo, but we handle the error
    } catch (error: any) {
      toast.error(error.message || "Failed to generate video");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleGenerateMusic = async () => {
    if (!prompt.trim()) return;
    setIsGenerating(true);
    setResultUrl(null);
    try {
      const url = await generateMusic(prompt);
      setResultUrl(url);
      setResultType("music");
      toast.success("Music generated");
    } catch (error: any) {
      toast.error(error.message || "Failed to generate music");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsAnalyzing(true);
    setAnalysisResult(null);
    
    try {
      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64String = (reader.result as string).split(",")[1];
        const fileData = {
          data: base64String,
          mimeType: file.type,
        };

        const result = await analyzeMedicalImage(fileData, "General Medical Media (X-Ray, MRI, CT, Ultrasound, etc.)");
        setAnalysisResult(result);
        toast.success("Media analysis complete.");
        setIsAnalyzing(false);
      };
      reader.readAsDataURL(file);
    } catch (error: any) {
      console.error(error);
      toast.error(error.message || "Failed to analyze media");
      setIsAnalyzing(false);
    }
  };

  const triggerFileInput = () => {
    fileInputRef.current?.click();
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="mb-6">
        <h1 className="font-mono text-xl mb-1 text-[var(--color-text-primary)]">Media Synthesis & Analysis Lab</h1>
        <p className="text-[var(--color-text-dim)] text-xs uppercase">Imagen 3 // Veo 3 // Lyria // Gemini Pro Vision</p>
      </div>

      <Tabs defaultValue="analysis" className="w-full">
        <TabsList className="grid w-full grid-cols-2 bg-[var(--color-bg-deep)] border border-[var(--color-border-glow)] mb-6">
          <TabsTrigger value="analysis" className="font-mono text-xs uppercase data-[state=active]:bg-[var(--color-accent-teal)]/20 data-[state=active]:text-[var(--color-accent-teal)]">
            Media Analysis
          </TabsTrigger>
          <TabsTrigger value="synthesis" className="font-mono text-xs uppercase data-[state=active]:bg-[var(--color-accent-teal)]/20 data-[state=active]:text-[var(--color-accent-teal)]">
            Media Synthesis
          </TabsTrigger>
        </TabsList>

        <TabsContent value="analysis" className="space-y-6">
          <Card className="bg-[var(--color-bg-surface)] border-[var(--color-border-glow)] shadow-[0_10px_30px_rgba(0,0,0,0.5)]">
            <CardHeader className="border-b border-[var(--color-border-glow)] pb-4">
              <CardTitle className="text-lg flex items-center gap-2 font-mono text-[var(--color-text-primary)]">
                <Activity className="w-5 h-5 text-[var(--color-accent-teal)]" />
                Medical Media Analysis
              </CardTitle>
              <CardDescription className="text-[var(--color-text-dim)]">
                Upload X-Rays, MRIs, CT scans, or Ultrasounds for AI-driven clinical analysis.
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-6">
              <input 
                type="file" 
                ref={fileInputRef} 
                className="hidden" 
                accept="image/*,video/*,application/pdf"
                onChange={handleFileUpload}
              />
              <div 
                className="border-2 border-dashed border-[var(--color-border-glow)] rounded-lg p-8 text-center hover:bg-[var(--color-bg-surface)] transition-colors cursor-pointer mb-4"
                onClick={triggerFileInput}
              >
                {isAnalyzing ? (
                  <Loader2 className="w-8 h-8 mx-auto text-[var(--color-accent-teal)] animate-spin mb-4" />
                ) : (
                  <Upload className="w-8 h-8 mx-auto text-[var(--color-text-dim)] mb-4" />
                )}
                <div className="font-mono text-sm text-[var(--color-text-primary)]">
                  {isAnalyzing ? "Analyzing Media with Gemini..." : "Upload Medical Image"}
                </div>
                <div className="text-xs text-[var(--color-text-dim)] mt-2">
                  Click to upload real medical imaging data for AI analysis
                </div>
              </div>

              {analysisResult && (
                <div className="mt-6 p-4 bg-[var(--color-bg-deep)] border border-[var(--color-border-glow)] rounded-lg relative group">
                  <div className="flex justify-between items-center mb-2">
                    <h3 className="text-sm font-mono text-[var(--color-accent-teal)] uppercase tracking-wider flex items-center gap-2">
                      <Activity className="w-4 h-4" /> Analysis Results
                    </h3>
                    {activeCaseId && (
                      <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={() => onSaveToCase(analysisResult, "Medical Media")}
                        className="text-[10px] font-mono h-7 border-[var(--color-accent-teal)]/50 text-[var(--color-accent-teal)] hover:bg-[var(--color-accent-teal)]/10"
                      >
                        <Save className="w-3 h-3 mr-1" /> Save to Case
                      </Button>
                    )}
                  </div>
                  <div className="text-xs text-[var(--color-text-primary)] font-mono whitespace-pre-wrap prose prose-sm prose-invert max-w-none">
                    <ReactMarkdown>{analysisResult}</ReactMarkdown>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="synthesis" className="space-y-6">
          <Card className="bg-[var(--color-bg-surface)] border-[var(--color-border-glow)] shadow-[0_10px_30px_rgba(0,0,0,0.5)]">
            <CardHeader className="border-b border-[var(--color-border-glow)] pb-4">
              <CardTitle className="text-lg flex items-center gap-2 font-mono text-[var(--color-text-primary)]">
                <ImageIcon className="w-5 h-5 text-[var(--color-accent-teal)]" />
                Synthesis Parameters
              </CardTitle>
              <CardDescription className="text-[var(--color-text-dim)]">
                Enter a prompt to generate high-quality media assets.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6 pt-6">
              <div className="space-y-2">
                <Label className="text-[10px] text-[var(--color-text-dim)] uppercase">Synthesis Prompt</Label>
                <Input 
                  placeholder="Describe the media you want to generate..." 
                  value={prompt}
                  onChange={e => setPrompt(e.target.value)}
                  className="font-mono bg-[var(--color-bg-deep)] border-[var(--color-border-glow)] text-[var(--color-text-primary)] focus-visible:ring-[var(--color-accent-glow)]"
                />
              </div>

              <div className="flex gap-4">
                <Button 
                  onClick={handleGenerateImage} 
                  disabled={isGenerating || !prompt.trim()}
                  className="flex-1 bg-[var(--color-bg-deep)] border border-[var(--color-border-glow)] hover:bg-[var(--color-accent-teal)]/20 text-[var(--color-text-primary)] gap-2"
                >
                  {isGenerating && resultType === 'image' ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImageIcon className="w-4 h-4" />}
                  Generate Image
                </Button>
                <Button 
                  onClick={handleGenerateVideo} 
                  disabled={isGenerating || !prompt.trim()}
                  className="flex-1 bg-[var(--color-bg-deep)] border border-[var(--color-border-glow)] hover:bg-[var(--color-accent-teal)]/20 text-[var(--color-text-primary)] gap-2"
                >
                  {isGenerating && resultType === 'video' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Video className="w-4 h-4" />}
                  Generate Video
                </Button>
                <Button 
                  onClick={handleGenerateMusic} 
                  disabled={isGenerating || !prompt.trim()}
                  className="flex-1 bg-[var(--color-bg-deep)] border border-[var(--color-border-glow)] hover:bg-[var(--color-accent-teal)]/20 text-[var(--color-text-primary)] gap-2"
                >
                  {isGenerating && resultType === 'music' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Music className="w-4 h-4" />}
                  Generate Music
                </Button>
              </div>
            </CardContent>
          </Card>

          {resultUrl && (
            <Card className="bg-[var(--color-bg-surface)] border-[var(--color-border-glow)] shadow-[0_10px_30px_rgba(0,0,0,0.5)] overflow-hidden">
              <CardHeader className="border-b border-[var(--color-border-glow)] pb-4 bg-[var(--color-bg-deep)]">
                <CardTitle className="text-sm font-mono text-[var(--color-accent-teal)] uppercase tracking-widest">
                  Synthesis Output // {resultType}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0 flex justify-center items-center min-h-[300px] bg-black/50">
                {resultType === "image" && (
                  <img src={resultUrl} alt="Generated" className="max-w-full max-h-[600px] object-contain" />
                )}
                {resultType === "music" && (
                  <div className="p-12 flex flex-col items-center gap-6 w-full">
                    <Music className="w-16 h-16 text-[var(--color-accent-teal)] animate-pulse" />
                    <audio controls src={resultUrl} className="w-full max-w-md" autoPlay />
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
