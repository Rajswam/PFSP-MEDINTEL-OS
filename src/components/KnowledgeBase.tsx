import { useState, useRef, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, Upload, BookOpen, Trash2, FileText, Send, MessageSquare, Search } from "lucide-react";
import { extractKnowledge, chatWithKnowledgeBase } from "../lib/gemini";
import { toast } from "sonner";
import { db } from "../lib/firebase";
import { collection, query, where, onSnapshot, doc, setDoc, deleteDoc, orderBy } from "firebase/firestore";
import { useAuth } from "./AuthProvider";
import ReactMarkdown from "react-markdown";

export interface KnowledgeDocument {
  id: string;
  userId: string;
  title: string;
  summary: string;
  content: string;
  createdAt: string;
}

interface ChatMessage {
  role: "user" | "model";
  content: string;
}

export function KnowledgeBase() {
  const { user } = useAuth();
  const [documents, setDocuments] = useState<KnowledgeDocument[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [currentMessage, setCurrentMessage] = useState("");
  const [isChatting, setIsChatting] = useState(false);
  const chatScrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!user) {
      setDocuments([]);
      return;
    }

    const q = query(
      collection(db, "knowledgeBase"),
      where("userId", "==", user.uid),
      orderBy("createdAt", "desc")
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const loadedDocs: KnowledgeDocument[] = [];
      snapshot.forEach((doc) => {
        loadedDocs.push(doc.data() as KnowledgeDocument);
      });
      setDocuments(loadedDocs);
    }, (error) => {
      console.error("Firestore error:", error);
      toast.error("Failed to load knowledge base");
    });

    return () => unsubscribe();
  }, [user]);

  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [chatMessages]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!user) {
      toast.error("Please sign in to upload documents.");
      return;
    }

    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 20 * 1024 * 1024) {
      toast.error("File size must be less than 20MB");
      return;
    }

    setIsUploading(true);
    try {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = async () => {
        if (typeof reader.result === "string") {
          const base64Data = reader.result.split(",")[1];
          const fileData = { data: base64Data, mimeType: file.type };
          
          toast.info("Extracting knowledge from document...");
          const extracted = await extractKnowledge(fileData, file.name);
          
          const newDocId = Date.now().toString();
          const newDoc: KnowledgeDocument = {
            id: newDocId,
            userId: user.uid,
            title: extracted.title,
            summary: extracted.summary,
            content: extracted.content,
            createdAt: new Date().toISOString()
          };

          await setDoc(doc(db, "knowledgeBase", newDocId), newDoc);
          toast.success("Document added to Knowledge Base");
          
          if (fileInputRef.current) fileInputRef.current.value = "";
        }
      };
    } catch (error: any) {
      console.error(error);
      toast.error(error.message || "Failed to process document");
    } finally {
      setIsUploading(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteDoc(doc(db, "knowledgeBase", id));
      toast.success("Document removed from Knowledge Base");
    } catch (error) {
      toast.error("Failed to delete document");
    }
  };

  const handleSendMessage = async () => {
    if (!currentMessage.trim() || isChatting) return;

    const userMessage = currentMessage.trim();
    setCurrentMessage("");
    
    const newMessages: ChatMessage[] = [
      ...chatMessages,
      { role: "user", content: userMessage }
    ];
    setChatMessages(newMessages);
    setIsChatting(true);

    try {
      const knowledgeContext = documents.map(d => `Title: ${d.title}\nContent: ${d.content}`).join("\n\n---\n\n");
      
      const history = chatMessages.map(msg => ({
        role: msg.role,
        parts: [{ text: msg.content }]
      }));

      const responseText = await chatWithKnowledgeBase(history, userMessage, knowledgeContext);

      setChatMessages([
        ...newMessages,
        { role: "model", content: responseText }
      ]);
    } catch (error: any) {
      console.error("Chat error:", error);
      toast.error("Failed to get response from Knowledge Base");
      setChatMessages([
        ...newMessages,
        { role: "model", content: "Error: Could not process your request. Please try again." }
      ]);
    } finally {
      setIsChatting(false);
    }
  };

  const filteredDocuments = documents.filter(doc => 
    doc.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
    doc.summary.toLowerCase().includes(searchQuery.toLowerCase()) ||
    doc.content.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="max-w-7xl mx-auto h-[calc(100vh-8rem)] flex flex-col md:flex-row gap-6">
      {/* Left Column: Documents */}
      <div className="w-full md:w-1/3 flex flex-col h-full space-y-4">
        <div className="flex items-center justify-between shrink-0">
          <div>
            <h1 className="font-mono text-xl mb-1 text-[var(--color-text-primary)]">Knowledge Base</h1>
            <p className="text-[var(--color-text-dim)] text-xs uppercase">Reference Ecosystem</p>
          </div>
          <div>
            <Button 
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading || !user}
              size="sm"
              className="bg-[var(--color-accent-teal)] hover:bg-[var(--color-accent-teal)]/80 text-[var(--color-bg-deep)] gap-2 font-bold tracking-wide"
            >
              {isUploading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Upload className="w-4 h-4" />
              )}
              UPLOAD
            </Button>
            <Input 
              type="file" 
              ref={fileInputRef}
              onChange={handleFileUpload}
              accept="application/pdf,text/plain,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              className="hidden"
            />
          </div>
        </div>

        <div className="relative shrink-0">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-text-dim)]" />
          <Input 
            type="text"
            placeholder="Search documents..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 font-mono text-sm bg-[var(--color-bg-surface)] border-[var(--color-border-glow)] text-[var(--color-text-primary)] focus-visible:ring-[var(--color-accent-glow)]"
          />
        </div>

        <ScrollArea className="flex-1 border border-[var(--color-border-glow)] rounded-lg bg-[var(--color-bg-surface)]/30 p-4">
          <div className="space-y-4">
            {filteredDocuments.map((doc) => (
              <Card key={doc.id} className="bg-[var(--color-bg-surface)] border-[var(--color-border-glow)] shadow-[0_4px_12px_rgba(0,0,0,0.2)] flex flex-col">
                <CardHeader className="border-b border-[var(--color-border-glow)] pb-3 pt-3 px-4">
                  <div className="flex justify-between items-start gap-2">
                    <CardTitle className="text-sm font-mono text-[var(--color-text-primary)] leading-tight">
                      {doc.title}
                    </CardTitle>
                    <Button variant="ghost" size="icon" className="h-6 w-6 text-[var(--color-danger)] hover:bg-[var(--color-danger)]/20 shrink-0" onClick={() => handleDelete(doc.id)}>
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                  <CardDescription className="text-[10px] text-[var(--color-text-dim)] font-mono">
                    {new Date(doc.createdAt).toLocaleDateString()}
                  </CardDescription>
                </CardHeader>
                <CardContent className="pt-3 px-4 pb-4">
                  <p className="text-xs text-[var(--color-text-dim)] line-clamp-3">
                    {doc.summary}
                  </p>
                </CardContent>
              </Card>
            ))}

            {documents.length === 0 && (
              <div className="py-8 flex flex-col items-center justify-center text-center opacity-50">
                <BookOpen className="w-8 h-8 text-[var(--color-text-dim)] mb-3" />
                <h3 className="text-sm font-mono text-[var(--color-text-primary)] mb-1">Empty</h3>
                <p className="text-xs text-[var(--color-text-dim)] max-w-[200px]">
                  Upload guidelines or research to enhance reasoning.
                </p>
              </div>
            )}

            {documents.length > 0 && filteredDocuments.length === 0 && (
              <div className="py-8 flex flex-col items-center justify-center text-center opacity-50">
                <Search className="w-8 h-8 text-[var(--color-text-dim)] mb-3" />
                <h3 className="text-sm font-mono text-[var(--color-text-primary)] mb-1">No results found</h3>
                <p className="text-xs text-[var(--color-text-dim)] max-w-[200px]">
                  No documents match your search query.
                </p>
              </div>
            )}
          </div>
        </ScrollArea>
      </div>

      {/* Right Column: Chat Interface */}
      <div className="w-full md:w-2/3 flex flex-col h-full border border-[var(--color-border-glow)] rounded-lg bg-[var(--color-bg-surface)]/30 overflow-hidden">
        <div className="bg-[var(--color-bg-surface)] border-b border-[var(--color-border-glow)] p-4 flex items-center gap-3 shrink-0">
          <MessageSquare className="w-5 h-5 text-[var(--color-accent-teal)]" />
          <div>
            <h2 className="font-mono text-sm text-[var(--color-text-primary)]">Knowledge Base Assistant</h2>
            <p className="text-[10px] text-[var(--color-text-dim)] uppercase tracking-wider">Query your uploaded documents</p>
          </div>
        </div>

        <ScrollArea className="flex-1 p-4" ref={chatScrollRef}>
          {chatMessages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center opacity-50 space-y-4 py-12">
              <MessageSquare className="w-12 h-12 text-[var(--color-text-dim)]" />
              <div>
                <p className="text-sm font-mono text-[var(--color-text-primary)] mb-1">Ask anything about your documents</p>
                <p className="text-xs text-[var(--color-text-dim)]">The assistant will use your uploaded knowledge base to answer.</p>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              {chatMessages.map((msg, idx) => (
                <div key={idx} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div 
                    className={`max-w-[85%] rounded-lg p-4 ${
                      msg.role === "user" 
                        ? "bg-[var(--color-accent-teal)]/20 border border-[var(--color-accent-teal)]/30 text-[var(--color-text-primary)]" 
                        : "bg-[var(--color-bg-surface)] border border-[var(--color-border-glow)] text-[var(--color-text-primary)]"
                    }`}
                  >
                    <div className="text-xs font-mono mb-2 opacity-50 uppercase tracking-wider">
                      {msg.role === "user" ? "You" : "Assistant"}
                    </div>
                    <div className="text-sm prose prose-sm prose-invert max-w-none">
                      <ReactMarkdown>{msg.content}</ReactMarkdown>
                    </div>
                  </div>
                </div>
              ))}
              {isChatting && (
                <div className="flex justify-start">
                  <div className="bg-[var(--color-bg-surface)] border border-[var(--color-border-glow)] rounded-lg p-4 flex items-center gap-3">
                    <Loader2 className="w-4 h-4 animate-spin text-[var(--color-accent-teal)]" />
                    <span className="text-xs font-mono text-[var(--color-text-dim)]">Searching knowledge base...</span>
                  </div>
                </div>
              )}
            </div>
          )}
        </ScrollArea>

        <div className="p-4 bg-[var(--color-bg-surface)] border-t border-[var(--color-border-glow)] shrink-0">
          <div className="flex gap-2">
            <Input
              value={currentMessage}
              onChange={(e) => setCurrentMessage(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSendMessage();
                }
              }}
              placeholder={documents.length === 0 ? "Upload documents first to query the knowledge base..." : "Ask a question about your documents..."}
              disabled={isChatting || documents.length === 0}
              className="flex-1 bg-[var(--color-bg-deep)] border-[var(--color-border-glow)] text-[var(--color-text-primary)] font-mono text-sm"
            />
            <Button 
              onClick={handleSendMessage}
              disabled={isChatting || !currentMessage.trim() || documents.length === 0}
              className="bg-[var(--color-accent-teal)] hover:bg-[var(--color-accent-teal)]/80 text-[var(--color-bg-deep)]"
            >
              <Send className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
