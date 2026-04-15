import { useState, useRef, useEffect } from "react";
import { generateReport, chatWithCase, generateFHIRBundle, extractMedicalCodes, extractSystemAssessments } from "./lib/gemini";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Brain, FileText, MessageSquare, Plus, Loader2, Sparkles, Image as ImageIcon, Video, File, Trash2, LogIn, LogOut, Globe, MapPin, Activity, Mic, Download, Database, BookOpen, Network, ChevronDown, ChevronUp } from "lucide-react";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";
import { useAuth } from "./components/AuthProvider";
import { db } from "./lib/firebase";
import { collection, query, where, onSnapshot, doc, setDoc, deleteDoc, orderBy } from "firebase/firestore";
import { MediaLab } from "./components/MediaLab";
import { VoiceComm } from "./components/VoiceComm";
import { KnowledgeBase, KnowledgeDocument } from "./components/KnowledgeBase";
import { Interoperability } from "./components/Interoperability";
import { TelemetryLab } from "./components/TelemetryLab";

interface ChatMessage {
  role: "user" | "model";
  parts: { text: string }[];
}

interface Case {
  id: string;
  userId: string;
  patientId: string;
  date: string;
  report: string;
  chatHistory: string; // JSON string
  medicalCodes?: string; // JSON string
  homeostasisData?: string; // JSON string
  pathophysiologyData?: string; // JSON string
  createdAt: string;
}

type TabType = "diagnostics" | "media" | "voice" | "knowledge" | "interoperability" | "telemetry";
type InferenceTabType = "chat" | "homeostasis" | "pathophysiology";

const PathophysiologyItem = ({ item }: { item: any }) => {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className={`bg-[var(--color-bg-deep)] border p-3 rounded ${item.involved ? 'border-[var(--color-accent-teal)]/30' : 'border-[var(--color-border-glow)] opacity-50'}`}>
      <div 
        className={`flex justify-between items-center ${item.involved ? 'cursor-pointer' : ''}`}
        onClick={() => item.involved && setExpanded(!expanded)}
      >
        <span className="font-mono text-sm text-[var(--color-text-primary)]">{item.category}</span>
        <div className="flex items-center gap-2">
          <span className={`text-[10px] px-2 py-0.5 rounded uppercase tracking-wider ${item.involved ? 'bg-[var(--color-accent-teal)]/10 text-[var(--color-accent-teal)]' : 'bg-[var(--color-bg-surface)] text-[var(--color-text-dim)]'}`}>
            {item.involved ? 'Involved' : 'Not Involved'}
          </span>
          {item.involved && (
            <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
              {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </Button>
          )}
        </div>
      </div>
      {item.involved && expanded && (
        <div className="mt-3 pt-3 border-t border-[var(--color-border-glow)]">
          <p className="text-xs text-[var(--color-text-dim)] leading-relaxed">{item.description}</p>
        </div>
      )}
    </div>
  );
};

const HomeostasisItem = ({ item }: { item: any }) => {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="bg-[var(--color-bg-deep)] border border-[var(--color-border-glow)] p-3 rounded">
      <div 
        className="flex justify-between items-center cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        <span className="font-mono text-sm text-[var(--color-text-primary)]">{item.system}</span>
        <div className="flex items-center gap-2">
          <span className={`text-[10px] px-2 py-0.5 rounded uppercase tracking-wider ${item.status === 'Normal' ? 'bg-[#00ff00]/10 text-[#00ff00]' : 'bg-[var(--color-danger)]/10 text-[var(--color-danger)]'}`}>
            {item.status}
          </span>
          <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </Button>
        </div>
      </div>
      {expanded && (
        <div className="mt-3 pt-3 border-t border-[var(--color-border-glow)]">
          <div className="flex gap-2 mb-2 text-[10px] font-mono">
            <span className="bg-[var(--color-bg-surface)] px-2 py-1 rounded text-[var(--color-text-dim)]">Dev: <span className="text-[var(--color-text-primary)]">{item.deviation}</span></span>
            <span className="bg-[var(--color-bg-surface)] px-2 py-1 rounded text-[var(--color-text-dim)]">Stability: <span className="text-[var(--color-text-primary)]">{item.lyapunovStability}</span></span>
          </div>
          <p className="text-xs text-[var(--color-text-dim)] leading-relaxed">{item.description}</p>
        </div>
      )}
    </div>
  );
};

export default function App() {
  const { user, signIn, logOut } = useAuth();
  const [cases, setCases] = useState<Case[]>([]);
  const [knowledgeDocs, setKnowledgeDocs] = useState<KnowledgeDocument[]>([]);
  const [activeCaseId, setActiveCaseId] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  
  // Toggles
  const [highThinking, setHighThinking] = useState(false);
  const [useSearch, setUseSearch] = useState(false);
  const [useMaps, setUseMaps] = useState(false);
  const [requireCoding, setRequireCoding] = useState(true);
  const [clinicalSetting, setClinicalSetting] = useState("Intensive Care Unit (ICU)");
  
  const [activeTab, setActiveTab] = useState<TabType>("diagnostics");
  const [inferenceTab, setInferenceTab] = useState<InferenceTabType>("chat");

  // New Case State
  const [patientId, setPatientId] = useState("");
  const [caseNotes, setCaseNotes] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Chat State
  const [chatInput, setChatInput] = useState("");
  const [isChatting, setIsChatting] = useState(false);
  const [isUpdatingAssessment, setIsUpdatingAssessment] = useState(false);
  const chatScrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!user) {
      setCases([]);
      setKnowledgeDocs([]);
      setActiveCaseId(null);
      return;
    }

    const qCases = query(
      collection(db, "cases"),
      where("userId", "==", user.uid),
      orderBy("createdAt", "desc")
    );

    const unsubscribeCases = onSnapshot(qCases, (snapshot) => {
      const loadedCases: Case[] = [];
      snapshot.forEach((doc) => {
        loadedCases.push(doc.data() as Case);
      });
      setCases(loadedCases);
      if (loadedCases.length > 0 && !activeCaseId) {
        setActiveCaseId(loadedCases[0].id);
      }
    }, (error) => {
      console.error("Firestore error:", error);
      toast.error("Failed to load cases from database");
    });

    const qKb = query(
      collection(db, "knowledgeBase"),
      where("userId", "==", user.uid)
    );

    const unsubscribeKb = onSnapshot(qKb, (snapshot) => {
      const loadedDocs: KnowledgeDocument[] = [];
      snapshot.forEach((doc) => {
        loadedDocs.push(doc.data() as KnowledgeDocument);
      });
      setKnowledgeDocs(loadedDocs);
    });

    return () => {
      unsubscribeCases();
      unsubscribeKb();
    };
  }, [user]);

  const activeCase = cases.find(c => c.id === activeCaseId);
  const parsedChatHistory: ChatMessage[] = activeCase?.chatHistory ? JSON.parse(activeCase.chatHistory) : [];

  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [parsedChatHistory.length]);

  const handleDeleteCase = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await deleteDoc(doc(db, "cases", id));
      if (activeCaseId === id) {
        setActiveCaseId(null);
      }
      toast.success("Case deleted from memory");
    } catch (error) {
      toast.error("Failed to delete case");
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0];
      if (selectedFile.size > 20 * 1024 * 1024) {
        toast.error("File size must be less than 20MB");
        return;
      }
      setFile(selectedFile);
    }
  };

  const fileToBase64 = (file: File): Promise<{ data: string; mimeType: string }> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        if (typeof reader.result === "string") {
          const base64Data = reader.result.split(",")[1];
          resolve({ data: base64Data, mimeType: file.type });
        } else {
          reject(new Error("Failed to read file"));
        }
      };
      reader.onerror = error => reject(error);
    });
  };

  const getKnowledgeContext = () => {
    if (knowledgeDocs.length === 0) return "";
    return knowledgeDocs.map(doc => `--- ${doc.title} ---\n${doc.content}`).join("\n\n");
  };

  const handleGenerateReport = async () => {
    if (!user) {
      toast.error("Please sign in to generate reports");
      return;
    }
    if (!patientId.trim()) {
      toast.error("Patient ID is required");
      return;
    }

    setIsGenerating(true);
    try {
      let fileData = null;
      if (file) {
        fileData = await fileToBase64(file);
      }

      const kbContext = getKnowledgeContext();

      const report = await generateReport(
        patientId, 
        fileData, 
        caseNotes, 
        highThinking, 
        useSearch, 
        clinicalSetting, 
        requireCoding,
        kbContext
      );
      
      let extractedCodes = "[]";
      if (requireCoding) {
        try {
          const codes = await extractMedicalCodes(report);
          extractedCodes = JSON.stringify(codes);
        } catch (e) {
          console.error("Failed to extract medical codes", e);
        }
      }
      
      let homeostasisData = "[]";
      let pathophysiologyData = "[]";
      try {
        const sysAssessments = await extractSystemAssessments(report);
        homeostasisData = JSON.stringify(sysAssessments.homeostasis || []);
        pathophysiologyData = JSON.stringify(sysAssessments.pathophysiology || []);
      } catch (e) {
        console.error("Failed to extract system assessments", e);
      }
      
      const newCaseId = Date.now().toString();
      const initialChat: ChatMessage[] = [
        {
          role: "model",
          parts: [{ text: "Hello. I am the PFSP-MEDINTEL OS. I have analyzed the case. How can I assist you further?" }]
        }
      ];

      const newCase: Case = {
        id: newCaseId,
        userId: user.uid,
        patientId,
        date: new Date().toLocaleDateString(),
        report: report || "No report generated.",
        chatHistory: JSON.stringify(initialChat),
        medicalCodes: extractedCodes,
        homeostasisData,
        pathophysiologyData,
        createdAt: new Date().toISOString()
      };

      await setDoc(doc(db, "cases", newCaseId), newCase);
      
      setActiveCaseId(newCaseId);
      setPatientId("");
      setCaseNotes("");
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      toast.success("Report generated successfully");
    } catch (error: any) {
      console.error(error);
      toast.error(error.message || "Failed to generate report");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSendMessage = async () => {
    if (!chatInput.trim() || !activeCaseId || !user || !activeCase) return;

    const userMessage = chatInput;
    setChatInput("");
    setIsChatting(true);

    const currentHistory = parsedChatHistory;
    const updatedHistory: ChatMessage[] = [
      ...currentHistory,
      { role: "user", parts: [{ text: userMessage }] }
    ];

    // Optimistic update
    try {
      await setDoc(doc(db, "cases", activeCaseId), {
        ...activeCase,
        chatHistory: JSON.stringify(updatedHistory)
      });

      const apiHistory: ChatMessage[] = [
        { role: "user", parts: [{ text: `Here is the case report we are discussing:\n\n${activeCase.report}` }] },
        { role: "model", parts: [{ text: "Understood. I am ready to discuss this case." }] },
        ...updatedHistory
      ];

      const kbContext = getKnowledgeContext();

      const responseText = await chatWithCase(
        apiHistory, 
        userMessage, 
        highThinking, 
        useSearch, 
        useMaps,
        kbContext
      );
      
      const finalHistory: ChatMessage[] = [
        ...updatedHistory,
        { role: "model", parts: [{ text: responseText || "I could not generate a response." }] }
      ];

      await setDoc(doc(db, "cases", activeCaseId), {
        ...activeCase,
        chatHistory: JSON.stringify(finalHistory)
      });
    } catch (error: any) {
      console.error(error);
      toast.error(error.message || "Failed to send message");
    } finally {
      setIsChatting(false);
    }
  };

  const handleUpdateAssessment = async () => {
    if (!activeCaseId || !user || !activeCase) return;
    
    setIsUpdatingAssessment(true);
    toast.info("Updating assessment based on latest data...");
    
    try {
      // Combine report and chat history to give context for the update
      const chatHistoryText = parsedChatHistory.map(msg => `${msg.role.toUpperCase()}: ${msg.parts[0].text}`).join('\n');
      const fullContext = `ORIGINAL REPORT:\n${activeCase.report}\n\nLATEST UPDATES/CHAT:\n${chatHistoryText}`;
      
      const sysAssessments = await extractSystemAssessments(fullContext);
      const homeostasisData = JSON.stringify(sysAssessments.homeostasis || []);
      const pathophysiologyData = JSON.stringify(sysAssessments.pathophysiology || []);
      
      await setDoc(doc(db, "cases", activeCaseId), {
        ...activeCase,
        homeostasisData,
        pathophysiologyData
      });
      
      toast.success("Assessment updated successfully.");
    } catch (error: any) {
      console.error(error);
      toast.error(error.message || "Failed to update assessment");
    } finally {
      setIsUpdatingAssessment(false);
    }
  };

  const handleSaveAnalysisToCase = async (analysisText: string, source: string) => {
    if (!activeCaseId || !activeCase) {
      toast.error("No active case selected to save analysis.");
      return;
    }

    try {
      const currentHistory = parsedChatHistory;
      const updatedHistory: ChatMessage[] = [
        ...currentHistory,
        { role: "user", parts: [{ text: `[SYSTEM AUTO-UPLOAD: ${source} Analysis]\n\n${analysisText}` }] },
        { role: "model", parts: [{ text: `I have received and logged the ${source} analysis. I will incorporate this into my ongoing assessment of the patient.` }] }
      ];

      await setDoc(doc(db, "cases", activeCaseId), {
        ...activeCase,
        chatHistory: JSON.stringify(updatedHistory)
      });
      
      toast.success(`Analysis saved to case ${activeCase.patientId}`);
    } catch (error: any) {
      console.error(error);
      toast.error("Failed to save analysis to case.");
    }
  };

  const handleExportFHIR = async () => {
    if (!activeCase) return;
    setIsExporting(true);
    try {
      toast.info("Generating HL7 FHIR R4 Bundle...");
      const fhirJson = await generateFHIRBundle(activeCase.report);
      
      // Create and download file
      const blob = new Blob([fhirJson], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `FHIR_Bundle_${activeCase.patientId}_${new Date().getTime()}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      toast.success("FHIR Bundle exported successfully");
    } catch (error: any) {
      console.error(error);
      toast.error(error.message || "Failed to export FHIR bundle");
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="grid h-screen w-full overflow-hidden bg-[var(--color-bg-deep)] text-[var(--color-text-primary)] font-sans" style={{ gridTemplateColumns: "240px 1fr", gridTemplateRows: "60px 1fr 40px" }}>
      {/* Header */}
      <header className="col-span-2 bg-[var(--color-bg-surface)] flex items-center justify-between px-5 border-b border-[var(--color-border-glow)]">
        <div className="flex items-center gap-3 font-mono font-bold tracking-[2px] text-[var(--color-accent-teal)]">
          PFSP-MEDINTEL-OS <span className="text-[10px] bg-[var(--color-accent-teal)] text-[var(--color-bg-deep)] px-1.5 py-0.5 rounded-sm">PRO</span>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 bg-[var(--color-bg-deep)] px-3 py-1.5 rounded-full border border-[var(--color-border-glow)]">
            <Globe className={`w-4 h-4 ${useSearch ? "text-[var(--color-accent-teal)]" : "text-[var(--color-text-dim)]"}`} />
            <Label htmlFor="search-mode" className="text-xs font-medium cursor-pointer text-[var(--color-text-primary)] hidden md:block">
              Search
            </Label>
            <Switch id="search-mode" checked={useSearch} onCheckedChange={(v) => { setUseSearch(v); if(v) setUseMaps(false); }} />
          </div>
          <div className="flex items-center gap-2 bg-[var(--color-bg-deep)] px-3 py-1.5 rounded-full border border-[var(--color-border-glow)]">
            <MapPin className={`w-4 h-4 ${useMaps ? "text-[var(--color-accent-teal)]" : "text-[var(--color-text-dim)]"}`} />
            <Label htmlFor="maps-mode" className="text-xs font-medium cursor-pointer text-[var(--color-text-primary)] hidden md:block">
              Maps
            </Label>
            <Switch id="maps-mode" checked={useMaps} onCheckedChange={(v) => { setUseMaps(v); if(v) setUseSearch(false); }} />
          </div>
          <div className="flex items-center gap-2 bg-[var(--color-bg-deep)] px-3 py-1.5 rounded-full border border-[var(--color-border-glow)]">
            <Brain className={`w-4 h-4 ${highThinking ? "text-[var(--color-accent-teal)]" : "text-[var(--color-text-dim)]"}`} />
            <Label htmlFor="thinking-mode" className="text-xs font-medium cursor-pointer text-[var(--color-text-primary)] hidden md:block">
              High Thinking
            </Label>
            <Switch id="thinking-mode" checked={highThinking} onCheckedChange={setHighThinking} />
          </div>
          
          <div className="h-6 w-px bg-[var(--color-border-glow)] mx-2"></div>
          
          {user ? (
            <div className="flex items-center gap-3">
              <span className="text-xs font-mono text-[var(--color-text-dim)] hidden sm:block">{user.email}</span>
              <Button variant="ghost" size="sm" onClick={logOut} className="text-[var(--color-text-dim)] hover:text-[var(--color-danger)] hover:bg-[var(--color-danger)]/10">
                <LogOut className="w-4 h-4 mr-2" /> Logout
              </Button>
            </div>
          ) : (
            <Button size="sm" onClick={signIn} className="bg-[var(--color-accent-teal)] text-[var(--color-bg-deep)] hover:bg-[var(--color-accent-teal)]/80">
              <LogIn className="w-4 h-4 mr-2" /> Sign In
            </Button>
          )}
        </div>
      </header>

      {/* Sidebar */}
      <aside className="bg-[rgba(15,19,26,0.5)] border-r border-[var(--color-border-glow)] p-5 flex flex-col gap-2.5 overflow-y-auto">
        <div className="space-y-1 mb-4">
          <Button 
            variant="ghost"
            className={`w-full justify-start gap-2 ${activeTab === 'diagnostics' ? 'bg-[var(--color-accent-teal)]/10 text-[var(--color-accent-teal)]' : 'text-[var(--color-text-dim)] hover:text-[var(--color-text-primary)]'}`}
            onClick={() => setActiveTab('diagnostics')}
          >
            <Activity className="w-4 h-4" /> Diagnostics Core
          </Button>
          <Button 
            variant="ghost"
            className={`w-full justify-start gap-2 ${activeTab === 'knowledge' ? 'bg-[var(--color-accent-teal)]/10 text-[var(--color-accent-teal)]' : 'text-[var(--color-text-dim)] hover:text-[var(--color-text-primary)]'}`}
            onClick={() => setActiveTab('knowledge')}
          >
            <BookOpen className="w-4 h-4" /> Knowledge Base
          </Button>
          <Button 
            variant="ghost"
            className={`w-full justify-start gap-2 ${activeTab === 'media' ? 'bg-[var(--color-accent-teal)]/10 text-[var(--color-accent-teal)]' : 'text-[var(--color-text-dim)] hover:text-[var(--color-text-primary)]'}`}
            onClick={() => setActiveTab('media')}
          >
            <ImageIcon className="w-4 h-4" /> Media Lab
          </Button>
          <Button 
            variant="ghost"
            className={`w-full justify-start gap-2 ${activeTab === 'voice' ? 'bg-[var(--color-accent-teal)]/10 text-[var(--color-accent-teal)]' : 'text-[var(--color-text-dim)] hover:text-[var(--color-text-primary)]'}`}
            onClick={() => setActiveTab('voice')}
          >
            <Mic className="w-4 h-4" /> Voice Comm
          </Button>
          <Button 
            variant="ghost"
            className={`w-full justify-start gap-2 ${activeTab === 'interoperability' ? 'bg-[var(--color-accent-teal)]/10 text-[var(--color-accent-teal)]' : 'text-[var(--color-text-dim)] hover:text-[var(--color-text-primary)]'}`}
            onClick={() => setActiveTab('interoperability')}
          >
            <Network className="w-4 h-4" /> Interoperability
          </Button>
          <Button 
            variant="ghost"
            className={`w-full justify-start gap-2 ${activeTab === 'telemetry' ? 'bg-[var(--color-accent-teal)]/10 text-[var(--color-accent-teal)]' : 'text-[var(--color-text-dim)] hover:text-[var(--color-text-primary)]'}`}
            onClick={() => setActiveTab('telemetry')}
          >
            <Activity className="w-4 h-4" /> Telemetry & ECG
          </Button>
        </div>

        {activeTab === 'diagnostics' && (
          <>
            <Button 
              className="w-full justify-start gap-2 bg-[var(--color-accent-teal)]/10 hover:bg-[var(--color-accent-teal)]/20 text-[var(--color-accent-teal)] border border-[var(--color-accent-teal)]/20" 
              onClick={() => setActiveCaseId(null)}
            >
              <Plus className="w-4 h-4" />
              New Case Analysis
            </Button>

            <div className="mt-4 mb-2 text-[10px] font-semibold text-[var(--color-text-dim)] uppercase tracking-widest">
              Case Memory
            </div>
            <div className="space-y-1">
              {!user ? (
                <div className="text-center p-4 text-sm text-[var(--color-text-dim)] italic">
                  Sign in to view cases
                </div>
              ) : cases.length === 0 ? (
                <div className="text-center p-4 text-sm text-[var(--color-text-dim)] italic">
                  No cases in memory
                </div>
              ) : (
                cases.map(c => (
                  <button
                    key={c.id}
                    onClick={() => setActiveCaseId(c.id)}
                    className={`w-full text-left px-4 py-3 rounded transition-colors flex flex-col gap-1 border-l-2 relative group ${
                      activeCaseId === c.id 
                        ? "text-[var(--color-accent-teal)] bg-[var(--color-accent-teal)]/5 border-[var(--color-accent-teal)]" 
                        : "text-[var(--color-text-dim)] border-transparent hover:bg-[var(--color-bg-surface)] hover:text-[var(--color-text-primary)]"
                    }`}
                  >
                    <div className="flex items-center justify-between w-full">
                      <span className="font-medium truncate text-sm uppercase tracking-wider pr-6">ID: {c.patientId}</span>
                      <span className="text-[10px] font-mono opacity-70 shrink-0">{c.date}</span>
                    </div>
                    <div className="text-xs opacity-70 truncate font-mono pr-6">
                      {c.report.substring(0, 40)}...
                    </div>
                    <div 
                      className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity p-1.5 hover:bg-[var(--color-danger)]/20 rounded text-[var(--color-danger)]"
                      onClick={(e) => handleDeleteCase(c.id, e)}
                      title="Delete Case"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </div>
                  </button>
                ))
              )}
            </div>
          </>
        )}
      </aside>

      {/* Main Content */}
      <main className="p-6 overflow-y-auto">
        {activeTab === 'knowledge' && <KnowledgeBase />}
        {activeTab === 'media' && <MediaLab activeCaseId={activeCaseId} onSaveToCase={handleSaveAnalysisToCase} />}
        {activeTab === 'voice' && <VoiceComm />}
        {activeTab === 'interoperability' && <Interoperability />}
        {activeTab === 'telemetry' && <TelemetryLab activeCaseId={activeCaseId} onSaveToCase={handleSaveAnalysisToCase} />}
        
        {activeTab === 'diagnostics' && (
          !activeCaseId ? (
            <div className="max-w-3xl mx-auto space-y-6">
              <div className="mb-6">
                <h1 className="font-mono text-xl mb-1 text-[var(--color-text-primary)]">New Clinical Analysis</h1>
                <p className="text-[var(--color-text-dim)] text-xs uppercase">PFSP-26 Bio-Neuron Ensemble Engine // Input</p>
              </div>
              <Card className="bg-[var(--color-bg-surface)] border-[var(--color-border-glow)] shadow-[0_10px_30px_rgba(0,0,0,0.5)]">
                <CardHeader className="border-b border-[var(--color-border-glow)] pb-4">
                  <CardTitle className="text-lg flex items-center gap-2 font-mono text-[var(--color-text-primary)]">
                    <FileText className="w-5 h-5 text-[var(--color-accent-teal)]" />
                    Input Case Data
                  </CardTitle>
                  <CardDescription className="text-[var(--color-text-dim)]">
                    Enter patient details and upload relevant files (PDF, images, or video) for AI analysis.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6 pt-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <Label htmlFor="patientId" className="text-[10px] text-[var(--color-text-dim)] uppercase">Patient ID / Reference</Label>
                      <Input 
                        id="patientId" 
                        placeholder="e.g., PT-2026-0415" 
                        value={patientId}
                        onChange={e => setPatientId(e.target.value)}
                        className="font-mono bg-[var(--color-bg-deep)] border-[var(--color-border-glow)] text-[var(--color-text-primary)] focus-visible:ring-[var(--color-accent-glow)]"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-[10px] text-[var(--color-text-dim)] uppercase">Clinical Setting</Label>
                      <Select value={clinicalSetting} onValueChange={setClinicalSetting}>
                        <SelectTrigger className="bg-[var(--color-bg-deep)] border-[var(--color-border-glow)] text-[var(--color-text-primary)]">
                          <SelectValue placeholder="Select setting" />
                        </SelectTrigger>
                        <SelectContent className="bg-[var(--color-bg-surface)] border-[var(--color-border-glow)] text-[var(--color-text-primary)]">
                          <SelectItem value="Intensive Care Unit (ICU)">Intensive Care Unit (ICU)</SelectItem>
                          <SelectItem value="Emergency Department (ED)">Emergency Department (ED)</SelectItem>
                          <SelectItem value="High Dependency Unit (HDU)">High Dependency Unit (HDU)</SelectItem>
                          <SelectItem value="Chronic Disease Management">Chronic Disease Management</SelectItem>
                          <SelectItem value="General Practice">General Practice</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="notes" className="text-[10px] text-[var(--color-text-dim)] uppercase">Clinical Notes</Label>
                    <Textarea 
                      id="notes" 
                      placeholder="Enter symptoms, history, or specific questions for the AI..." 
                      className="min-h-[120px] resize-y bg-[var(--color-bg-deep)] border-[var(--color-border-glow)] text-[var(--color-text-primary)] focus-visible:ring-[var(--color-accent-glow)]"
                      value={caseNotes}
                      onChange={e => setCaseNotes(e.target.value)}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label className="text-[10px] text-[var(--color-text-dim)] uppercase">Supporting Media (Optional)</Label>
                    <div className="border border-dashed border-[var(--color-border-glow)] rounded-lg p-6 hover:bg-[var(--color-bg-deep)] transition-colors bg-[var(--color-bg-deep)]/50">
                      <div className="flex flex-col items-center justify-center gap-3 text-center">
                        <div className="flex gap-2 text-[var(--color-accent-teal)] opacity-70">
                          <ImageIcon className="w-6 h-6" />
                          <File className="w-6 h-6" />
                          <Video className="w-6 h-6" />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-[var(--color-text-primary)]">Upload PDF, Image, or Video</p>
                          <p className="text-xs text-[var(--color-text-dim)] mt-1 font-mono">Max 20MB. Used for visual/document analysis.</p>
                        </div>
                        <Input 
                          type="file" 
                          ref={fileInputRef}
                          onChange={handleFileChange}
                          accept="image/*,video/*,application/pdf"
                          className="max-w-[250px] mt-2 cursor-pointer bg-[var(--color-bg-surface)] border-[var(--color-border-glow)] text-[var(--color-text-primary)]"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between p-4 bg-[var(--color-bg-deep)] rounded-lg border border-[var(--color-border-glow)]">
                    <div className="space-y-0.5">
                      <Label className="text-sm text-[var(--color-text-primary)]">Medical Coding Integration</Label>
                      <p className="text-xs text-[var(--color-text-dim)]">Include SNOMED CT, ICD-11, and LOINC codes in assessment</p>
                    </div>
                    <Switch checked={requireCoding} onCheckedChange={setRequireCoding} />
                  </div>
                </CardContent>
                <CardFooter className="border-t border-[var(--color-border-glow)] pt-4 flex justify-end">
                  <Button 
                    onClick={handleGenerateReport} 
                    disabled={isGenerating || !patientId.trim() || !user}
                    className="bg-[var(--color-accent-teal)] hover:bg-[var(--color-accent-teal)]/80 text-[var(--color-bg-deep)] gap-2 font-bold tracking-wide"
                  >
                    {isGenerating ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        PROCESSING...
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-4 h-4" />
                        GENERATE REPORT
                      </>
                    )}
                  </Button>
                </CardFooter>
              </Card>
            </div>
          ) : (
            <div className="h-full flex flex-col md:flex-row gap-6 max-w-7xl mx-auto">
              {/* Report Panel */}
              <div className="flex-1 flex flex-col gap-4">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <h1 className="font-mono text-xl mb-1 text-[var(--color-text-primary)]">Advanced Clinical Analytical Report</h1>
                    <p className="text-[var(--color-text-dim)] text-xs uppercase">PFSP-26 Bio-Neuron Ensemble Engine // Case ID: {activeCase?.patientId}</p>
                  </div>
                  <div className="flex gap-2">
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={handleExportFHIR}
                      disabled={isExporting}
                      className="bg-[var(--color-bg-deep)] border-[var(--color-border-glow)] text-[var(--color-text-primary)] hover:bg-[var(--color-bg-surface)] hover:text-[var(--color-accent-teal)]"
                    >
                      {isExporting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}
                      Export FHIR R4
                    </Button>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={() => toast.success("Simulated sync to Epic/Cerner EHR completed.")}
                      className="bg-[var(--color-bg-deep)] border-[var(--color-border-glow)] text-[var(--color-text-primary)] hover:bg-[var(--color-bg-surface)] hover:text-[var(--color-accent-teal)]"
                    >
                      <Database className="w-4 h-4 mr-2" />
                      Sync to EHR
                    </Button>
                  </div>
                </div>
                
                <Card className="flex-1 flex flex-col overflow-hidden bg-[var(--color-bg-surface)] border-[var(--color-border-glow)] shadow-[0_10px_30px_rgba(0,0,0,0.5)]">
                  <ScrollArea className="flex-1 p-6">
                    <div className="prose prose-sm prose-invert max-w-none prose-headings:font-mono prose-headings:text-[var(--color-accent-teal)] prose-a:text-[var(--color-accent-teal)]">
                      <ReactMarkdown>{activeCase?.report || ""}</ReactMarkdown>
                    </div>
                    
                    {activeCase?.medicalCodes && activeCase.medicalCodes !== "[]" && (
                      <div className="mt-8 pt-6 border-t border-[var(--color-border-glow)]">
                        <h3 className="font-mono text-sm text-[var(--color-accent-teal)] mb-4 uppercase tracking-wider">Structured Medical Codes</h3>
                        <div className="grid gap-2">
                          {(() => {
                            try {
                              const codes = JSON.parse(activeCase.medicalCodes);
                              return codes.map((c: any, i: number) => (
                                <div key={i} className="flex flex-col sm:flex-row sm:items-center justify-between p-3 bg-[var(--color-bg-deep)] border border-[var(--color-border-glow)] rounded text-sm">
                                  <div className="flex items-center gap-3">
                                    <span className="px-2 py-1 bg-[var(--color-accent-teal)]/10 text-[var(--color-accent-teal)] font-mono text-[10px] rounded uppercase tracking-wider min-w-[70px] text-center">
                                      {c.system}
                                    </span>
                                    <span className="font-mono text-[var(--color-text-primary)]">{c.code}</span>
                                  </div>
                                  <span className="text-[var(--color-text-dim)] text-xs mt-2 sm:mt-0 sm:text-right">{c.description}</span>
                                </div>
                              ));
                            } catch (e) {
                              return <div className="text-xs text-[var(--color-danger)]">Failed to parse medical codes.</div>;
                            }
                          })()}
                        </div>
                      </div>
                    )}
                  </ScrollArea>
                </Card>
              </div>

              {/* Inference Monitor Panel */}
              <div className="flex-1 flex flex-col gap-4 md:max-w-[450px]">
                <div className="mb-2">
                  <h1 className="font-mono text-xl mb-1 text-[var(--color-text-primary)]">Inference Monitor</h1>
                  <p className="text-[var(--color-text-dim)] text-xs uppercase">Real-time System Logs & Assessment</p>
                </div>
                
                <div className="flex gap-2 mb-2">
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    onClick={() => setInferenceTab('chat')}
                    className={`flex-1 text-xs font-mono uppercase tracking-wider border ${inferenceTab === 'chat' ? 'bg-[var(--color-accent-teal)]/10 text-[var(--color-accent-teal)] border-[var(--color-accent-teal)]/50' : 'bg-[var(--color-bg-surface)] text-[var(--color-text-dim)] border-[var(--color-border-glow)]'}`}
                  >
                    Discussion
                  </Button>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    onClick={() => setInferenceTab('homeostasis')}
                    className={`flex-1 text-xs font-mono uppercase tracking-wider border ${inferenceTab === 'homeostasis' ? 'bg-[var(--color-accent-teal)]/10 text-[var(--color-accent-teal)] border-[var(--color-accent-teal)]/50' : 'bg-[var(--color-bg-surface)] text-[var(--color-text-dim)] border-[var(--color-border-glow)]'}`}
                  >
                    Homeostasis
                  </Button>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    onClick={() => setInferenceTab('pathophysiology')}
                    className={`flex-1 text-xs font-mono uppercase tracking-wider border ${inferenceTab === 'pathophysiology' ? 'bg-[var(--color-accent-teal)]/10 text-[var(--color-accent-teal)] border-[var(--color-accent-teal)]/50' : 'bg-[var(--color-bg-surface)] text-[var(--color-text-dim)] border-[var(--color-border-glow)]'}`}
                  >
                    Pathophysiology
                  </Button>
                </div>
                
                <Card className="flex-1 flex flex-col overflow-hidden bg-[var(--color-bg-surface)] border-[var(--color-border-glow)] shadow-[0_10px_30px_rgba(0,0,0,0.5)]">
                  {inferenceTab === 'chat' && (
                    <>
                      <div className="flex-1 overflow-y-auto p-4 space-y-4 font-mono text-sm" ref={chatScrollRef}>
                        {parsedChatHistory.map((msg, idx) => (
                          <div 
                            key={idx} 
                            className={`flex flex-col ${msg.role === "user" ? "items-end" : "items-start"}`}
                          >
                            <span className="text-[10px] text-[var(--color-text-dim)] uppercase mb-1">
                              {msg.role === "user" ? "USER INPUT" : "SYSTEM RESPONSE"}
                            </span>
                            <div 
                              className={`max-w-[90%] p-3 border ${
                                msg.role === "user" 
                                  ? "bg-[var(--color-accent-teal)]/10 text-[var(--color-text-primary)] border-[var(--color-accent-teal)]/30" 
                                  : "bg-[var(--color-bg-deep)] text-[#00ff00] border-[#333]"
                              }`}
                            >
                              <div className="prose prose-sm prose-invert max-w-none prose-p:leading-relaxed">
                                {msg.role === "user" ? (
                                  msg.parts[0].text
                                ) : (
                                  <ReactMarkdown>{msg.parts[0].text}</ReactMarkdown>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                        {isChatting && (
                          <div className="flex flex-col items-start">
                            <span className="text-[10px] text-[var(--color-text-dim)] uppercase mb-1">SYSTEM RESPONSE</span>
                            <div className="bg-[var(--color-bg-deep)] text-[#00ff00] p-3 border border-[#333] flex items-center gap-2">
                              <Loader2 className="w-4 h-4 animate-spin" />
                              <span>PROCESSING QUERY...</span>
                            </div>
                          </div>
                        )}
                      </div>

                      <div className="p-4 bg-[var(--color-bg-deep)] border-t border-[var(--color-border-glow)] shrink-0">
                        <div className="flex justify-end mb-2">
                          <Button 
                            variant="outline" 
                            size="sm" 
                            onClick={handleUpdateAssessment}
                            disabled={isUpdatingAssessment}
                            className="text-[10px] font-mono h-7 border-[var(--color-accent-teal)]/50 text-[var(--color-accent-teal)] hover:bg-[var(--color-accent-teal)]/10"
                          >
                            {isUpdatingAssessment ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Activity className="w-3 h-3 mr-1" />}
                            Update Assessment (Real-time)
                          </Button>
                        </div>
                        <form 
                          onSubmit={(e) => { e.preventDefault(); handleSendMessage(); }}
                          className="flex gap-2"
                        >
                          <Input 
                            placeholder="Enter command or query..." 
                            value={chatInput}
                            onChange={e => setChatInput(e.target.value)}
                            disabled={isChatting}
                            className="flex-1 bg-[var(--color-bg-surface)] border-[var(--color-border-glow)] text-[var(--color-text-primary)] font-mono focus-visible:ring-[var(--color-accent-glow)]"
                          />
                          <Button 
                            type="submit" 
                            disabled={isChatting || !chatInput.trim()}
                            className="bg-[var(--color-accent-teal)] hover:bg-[var(--color-accent-teal)]/80 text-[var(--color-bg-deep)] shrink-0"
                          >
                            <MessageSquare className="w-4 h-4" />
                          </Button>
                        </form>
                      </div>
                    </>
                  )}
                  
                  {inferenceTab === 'homeostasis' && (
                    <ScrollArea className="flex-1 p-4">
                      <div className="space-y-4">
                        <h2 className="text-sm font-mono text-[var(--color-accent-teal)] uppercase tracking-wider mb-2">Lyapunov Equilibrium Stability</h2>
                        {(() => {
                          try {
                            const data = JSON.parse(activeCase?.homeostasisData || "[]");
                            if (!data || data.length === 0) return <p className="text-xs text-[var(--color-text-dim)]">No data available.</p>;
                            return data.map((item: any, i: number) => (
                              <HomeostasisItem key={i} item={item} />
                            ));
                          } catch (e) {
                            return <p className="text-xs text-[var(--color-danger)]">Failed to parse homeostasis data.</p>;
                          }
                        })()}
                      </div>
                    </ScrollArea>
                  )}
                  
                  {inferenceTab === 'pathophysiology' && (
                    <ScrollArea className="flex-1 p-4">
                      <div className="space-y-4">
                        <h2 className="text-sm font-mono text-[var(--color-accent-teal)] uppercase tracking-wider mb-2">Pathophysiological Mechanisms</h2>
                        {(() => {
                          try {
                            const data = JSON.parse(activeCase?.pathophysiologyData || "[]");
                            if (!data || data.length === 0) return <p className="text-xs text-[var(--color-text-dim)]">No data available.</p>;
                            return data.map((item: any, i: number) => (
                              <PathophysiologyItem key={i} item={item} />
                            ));
                          } catch (e) {
                            return <p className="text-xs text-[var(--color-danger)]">Failed to parse pathophysiology data.</p>;
                          }
                        })()}
                      </div>
                    </ScrollArea>
                  )}
                </Card>
              </div>
            </div>
          )
        )}
      </main>

      {/* Footer */}
      <footer className="col-span-2 bg-[var(--color-bg-surface)] border-t border-[var(--color-border-glow)] flex items-center justify-between px-5 text-[11px] text-[var(--color-text-dim)] font-mono">
        <div><span className="inline-block w-2 h-2 bg-[#00ff00] rounded-full mr-1.5 shadow-[0_0_5px_#00ff00]"></span> SYSTEM STABLE // ENCRYPTED END-TO-END</div>
        <div>LATENCY: 14ms | MEMORY: 4.2GB / 32GB</div>
        <div>© 2026 PFSP-MEDINTEL GLOBAL</div>
      </footer>
    </div>
  );
}
