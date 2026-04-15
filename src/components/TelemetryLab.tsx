import { useState, useRef } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Activity, HeartPulse, Zap, Upload, Loader2, AlertTriangle, Save } from "lucide-react";
import { toast } from "sonner";
import { analyzeMedicalImage } from "../lib/gemini";
import ReactMarkdown from "react-markdown";

interface TelemetryLabProps {
  activeCaseId: string | null;
  onSaveToCase: (analysisText: string, source: string) => void;
}

export function TelemetryLab({ activeCaseId, onSaveToCase }: TelemetryLabProps) {
  const [activeTab, setActiveTab] = useState<"ecg" | "telemetry" | "pacemaker">("ecg");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

        const typeMap = {
          ecg: "12-Lead ECG",
          telemetry: "Continuous Telemetry / Holter",
          pacemaker: "Pacemaker / ICD Interrogation",
        };

        const result = await analyzeMedicalImage(fileData, typeMap[activeTab]);
        setAnalysisResult(result);
        toast.success(`${typeMap[activeTab]} analysis complete.`);
        setIsAnalyzing(false);
      };
      reader.readAsDataURL(file);
    } catch (error: any) {
      console.error(error);
      toast.error(error.message || "Failed to analyze data");
      setIsAnalyzing(false);
    }
  };

  const triggerFileInput = () => {
    fileInputRef.current?.click();
  };

  return (
    <div className="h-full flex flex-col">
      <div className="flex gap-2 mb-4 border-b border-[var(--color-border-glow)] pb-2">
        <Button 
          variant="ghost" 
          onClick={() => setActiveTab("ecg")}
          className={`font-mono text-xs uppercase tracking-wider ${activeTab === "ecg" ? "text-[var(--color-accent-teal)] bg-[var(--color-accent-teal)]/10" : "text-[var(--color-text-dim)]"}`}
        >
          <Activity className="w-4 h-4 mr-2" />
          12-Lead ECG
        </Button>
        <Button 
          variant="ghost" 
          onClick={() => setActiveTab("telemetry")}
          className={`font-mono text-xs uppercase tracking-wider ${activeTab === "telemetry" ? "text-[var(--color-accent-teal)] bg-[var(--color-accent-teal)]/10" : "text-[var(--color-text-dim)]"}`}
        >
          <HeartPulse className="w-4 h-4 mr-2" />
          Continuous Telemetry
        </Button>
        <Button 
          variant="ghost" 
          onClick={() => setActiveTab("pacemaker")}
          className={`font-mono text-xs uppercase tracking-wider ${activeTab === "pacemaker" ? "text-[var(--color-accent-teal)] bg-[var(--color-accent-teal)]/10" : "text-[var(--color-text-dim)]"}`}
        >
          <Zap className="w-4 h-4 mr-2" />
          Pacemaker / ICD
        </Button>
      </div>

      <ScrollArea className="flex-1 pr-4">
        <div className="space-y-4">
          <div className="mb-6">
            <h2 className="text-lg font-mono text-[var(--color-text-primary)] mb-2">
              {activeTab === "ecg" && "12-Lead Electrocardiogram Analysis"}
              {activeTab === "telemetry" && "Continuous Telemetry & Holter Monitoring"}
              {activeTab === "pacemaker" && "Cardiac Device Interrogation (Pacemaker/ICD)"}
            </h2>
            <p className="text-sm text-[var(--color-text-dim)]">
              {activeTab === "ecg" && "Upload and analyze standard 12-lead ECG waveforms for arrhythmias, ischemia, and conduction abnormalities."}
              {activeTab === "telemetry" && "Analyze continuous multi-lead telemetry data to identify transient arrhythmias and rhythm burdens."}
              {activeTab === "pacemaker" && "Interrogate implanted cardiac devices for battery status, lead integrity, pacing burden, and recorded events."}
            </p>
          </div>

          <Card className="bg-[var(--color-bg-deep)] border-[var(--color-border-glow)]">
            <CardContent className="pt-6">
              <input 
                type="file" 
                ref={fileInputRef} 
                className="hidden" 
                accept="image/*,application/pdf"
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
                  {isAnalyzing ? "Analyzing Data with Gemini..." : `Upload ${activeTab.toUpperCase()} Image/Data`}
                </div>
                <div className="text-xs text-[var(--color-text-dim)] mt-2">
                  Click to upload real ECG/Telemetry data for AI analysis
                </div>
              </div>

              {analysisResult && (
                <div className="mt-6 p-4 bg-[var(--color-bg-surface)] border border-[var(--color-border-glow)] rounded-lg relative group">
                  <div className="flex justify-between items-center mb-2">
                    <h3 className="text-sm font-mono text-[var(--color-accent-teal)] uppercase tracking-wider flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4" /> Analysis Results
                    </h3>
                    {activeCaseId && (
                      <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={() => {
                          const typeMap = {
                            ecg: "12-Lead ECG",
                            telemetry: "Continuous Telemetry / Holter",
                            pacemaker: "Pacemaker / ICD Interrogation",
                          };
                          onSaveToCase(analysisResult, typeMap[activeTab]);
                        }}
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
        </div>
      </ScrollArea>
    </div>
  );
}
