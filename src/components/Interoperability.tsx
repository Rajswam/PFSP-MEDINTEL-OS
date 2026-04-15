import { useState, useRef } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Network, Database, Activity, Link as LinkIcon, FileJson, Image as ImageIcon, Upload, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import dicomParser from "dicom-parser";

interface EHRSystem {
  id: string;
  name: string;
  type: "Epic" | "Cerner" | "EMIS" | "SystmOne" | "NHS Spine";
  status: "connected" | "disconnected" | "connecting";
  lastSync?: string;
}

const INITIAL_SYSTEMS: EHRSystem[] = [
  { id: "epic-1", name: "Epic Systems (Hospital Trust)", type: "Epic", status: "disconnected" },
  { id: "cerner-1", name: "Oracle Cerner Millennium", type: "Cerner", status: "disconnected" },
  { id: "emis-1", name: "EMIS Web (Primary Care)", type: "EMIS", status: "disconnected" },
  { id: "systmone-1", name: "TPP SystmOne (GP Surgery)", type: "SystmOne", status: "disconnected" },
  { id: "nhs-spine", name: "NHS Spine / PDS", type: "NHS Spine", status: "disconnected" },
];

export function Interoperability() {
  const [activeTab, setActiveTab] = useState<"ehr" | "fhir" | "dicom">("ehr");
  const [systems, setSystems] = useState<EHRSystem[]>(INITIAL_SYSTEMS);
  
  // DICOM State
  const [dicomMetadata, setDicomMetadata] = useState<any | null>(null);
  const [isParsingDicom, setIsParsingDicom] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleConnect = (id: string) => {
    setSystems(sys => sys.map(s => s.id === id ? { ...s, status: "connecting" } : s));
    
    // Simulate OAuth / SMART on FHIR connection flow
    setTimeout(() => {
      setSystems(sys => sys.map(s => s.id === id ? { ...s, status: "connected", lastSync: new Date().toISOString() } : s));
      toast.success(`Successfully authenticated with EHR system via SMART on FHIR.`);
    }, 2000);
  };

  const handleDisconnect = (id: string) => {
    setSystems(sys => sys.map(s => s.id === id ? { ...s, status: "disconnected", lastSync: undefined } : s));
    toast.info("Disconnected from EHR system.");
  };

  const handleDicomUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsParsingDicom(true);
    setDicomMetadata(null);

    try {
      const arrayBuffer = await file.arrayBuffer();
      const byteArray = new Uint8Array(arrayBuffer);
      
      // Parse DICOM
      const dataSet = dicomParser.parseDicom(byteArray);
      
      // Extract common tags
      const patientName = dataSet.string('x00100010') || "Unknown";
      const patientId = dataSet.string('x00100020') || "Unknown";
      const studyDate = dataSet.string('x00080020') || "Unknown";
      const modality = dataSet.string('x00080060') || "Unknown";
      const studyDescription = dataSet.string('x00081030') || "Unknown";
      const manufacturer = dataSet.string('x00080070') || "Unknown";

      setDicomMetadata({
        patientName,
        patientId,
        studyDate,
        modality,
        studyDescription,
        manufacturer,
        transferSyntax: dataSet.string('x00020010'),
        fileSize: (file.size / 1024 / 1024).toFixed(2) + " MB"
      });
      
      toast.success("DICOM file parsed successfully.");
    } catch (error) {
      console.error("DICOM parsing error:", error);
      toast.error("Failed to parse DICOM file. Ensure it is a valid .dcm file.");
    } finally {
      setIsParsingDicom(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  return (
    <div className="h-full flex flex-col">
      <div className="flex gap-2 mb-4 border-b border-[var(--color-border-glow)] pb-2">
        <Button 
          variant="ghost" 
          onClick={() => setActiveTab("ehr")}
          className={`font-mono text-xs uppercase tracking-wider ${activeTab === "ehr" ? "text-[var(--color-accent-teal)] bg-[var(--color-accent-teal)]/10" : "text-[var(--color-text-dim)]"}`}
        >
          <Network className="w-4 h-4 mr-2" />
          EHR Gateways
        </Button>
        <Button 
          variant="ghost" 
          onClick={() => setActiveTab("fhir")}
          className={`font-mono text-xs uppercase tracking-wider ${activeTab === "fhir" ? "text-[var(--color-accent-teal)] bg-[var(--color-accent-teal)]/10" : "text-[var(--color-text-dim)]"}`}
        >
          <FileJson className="w-4 h-4 mr-2" />
          FHIR / HL7
        </Button>
        <Button 
          variant="ghost" 
          onClick={() => setActiveTab("dicom")}
          className={`font-mono text-xs uppercase tracking-wider ${activeTab === "dicom" ? "text-[var(--color-accent-teal)] bg-[var(--color-accent-teal)]/10" : "text-[var(--color-text-dim)]"}`}
        >
          <ImageIcon className="w-4 h-4 mr-2" />
          PACS / DICOM
        </Button>
      </div>

      <ScrollArea className="flex-1 pr-4">
        {activeTab === "ehr" && (
          <div className="space-y-4">
            <div className="mb-6">
              <h2 className="text-lg font-mono text-[var(--color-text-primary)] mb-2">EHR Integration Gateways</h2>
              <p className="text-sm text-[var(--color-text-dim)]">
                Connect to major Electronic Health Record systems via SMART on FHIR and proprietary APIs. 
                Supports NHS Spine, Epic, Cerner, EMIS, and SystmOne for seamless data exchange.
              </p>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              {systems.map(sys => (
                <Card key={sys.id} className="bg-[var(--color-bg-deep)] border-[var(--color-border-glow)]">
                  <CardHeader className="pb-2">
                    <div className="flex justify-between items-start">
                      <div>
                        <CardTitle className="text-sm font-mono text-[var(--color-text-primary)]">{sys.name}</CardTitle>
                        <CardDescription className="text-xs text-[var(--color-text-dim)] mt-1">Provider: {sys.type}</CardDescription>
                      </div>
                      {sys.status === "connected" ? (
                        <CheckCircle2 className="w-5 h-5 text-[#00ff00]" />
                      ) : sys.status === "connecting" ? (
                        <Loader2 className="w-5 h-5 text-[var(--color-accent-teal)] animate-spin" />
                      ) : (
                        <XCircle className="w-5 h-5 text-[var(--color-danger)]" />
                      )}
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center justify-between mt-2">
                      <div className="text-xs font-mono text-[var(--color-text-dim)]">
                        Status: <span className={sys.status === "connected" ? "text-[#00ff00]" : "text-[var(--color-danger)]"}>{sys.status.toUpperCase()}</span>
                        {sys.lastSync && <div className="mt-1">Last Sync: {new Date(sys.lastSync).toLocaleTimeString()}</div>}
                      </div>
                      {sys.status === "connected" ? (
                        <Button size="sm" variant="outline" onClick={() => handleDisconnect(sys.id)} className="border-[var(--color-danger)] text-[var(--color-danger)] hover:bg-[var(--color-danger)]/10">
                          Disconnect
                        </Button>
                      ) : (
                        <Button size="sm" onClick={() => handleConnect(sys.id)} disabled={sys.status === "connecting"} className="bg-[var(--color-accent-teal)] text-[var(--color-bg-deep)] hover:bg-[var(--color-accent-teal)]/80">
                          {sys.status === "connecting" ? "Authenticating..." : "Connect (OAuth)"}
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}

        {activeTab === "fhir" && (
          <div className="space-y-4">
            <div className="mb-6">
              <h2 className="text-lg font-mono text-[var(--color-text-primary)] mb-2">FHIR / HL7 Interoperability</h2>
              <p className="text-sm text-[var(--color-text-dim)]">
                View and manage Fast Healthcare Interoperability Resources (FHIR) bundles. 
                Data is standardized to HL7 FHIR R4 for cross-system compatibility.
              </p>
            </div>
            
            <Card className="bg-[var(--color-bg-deep)] border-[var(--color-border-glow)]">
              <CardHeader>
                <CardTitle className="text-sm font-mono text-[var(--color-text-primary)]">FHIR Bundle Explorer</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="bg-[var(--color-bg-surface)] p-4 rounded border border-[#333] font-mono text-xs text-[var(--color-text-dim)] overflow-x-auto">
                  <pre>
{`{
  "resourceType": "Bundle",
  "type": "collection",
  "entry": [
    {
      "resource": {
        "resourceType": "Patient",
        "id": "example-1",
        "identifier": [
          {
            "system": "https://fhir.nhs.uk/Id/nhs-number",
            "value": "1234567890"
          }
        ],
        "name": [{"family": "Smith", "given": ["John"]}]
      }
    }
  ]
}`}
                  </pre>
                </div>
                <div className="mt-4 flex gap-2">
                  <Button size="sm" variant="outline" className="border-[var(--color-accent-teal)] text-[var(--color-accent-teal)]">
                    <Upload className="w-4 h-4 mr-2" /> Import FHIR JSON
                  </Button>
                  <Button size="sm" className="bg-[var(--color-accent-teal)] text-[var(--color-bg-deep)]">
                    <Database className="w-4 h-4 mr-2" /> Sync to Active EHR
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {activeTab === "dicom" && (
          <div className="space-y-4">
            <div className="mb-6">
              <h2 className="text-lg font-mono text-[var(--color-text-primary)] mb-2">PACS / DICOM Imaging</h2>
              <p className="text-sm text-[var(--color-text-dim)]">
                Authentic DICOM file parsing and metadata extraction for MRI, CT, Ultrasound, and X-Ray imaging.
              </p>
            </div>

            <Card className="bg-[var(--color-bg-deep)] border-[var(--color-border-glow)]">
              <CardContent className="pt-6">
                <div 
                  className="border-2 border-dashed border-[var(--color-border-glow)] rounded-lg p-8 text-center hover:bg-[var(--color-bg-surface)] transition-colors cursor-pointer"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <input 
                    type="file" 
                    ref={fileInputRef} 
                    className="hidden" 
                    accept=".dcm,application/dicom" 
                    onChange={handleDicomUpload}
                  />
                  {isParsingDicom ? (
                    <Loader2 className="w-8 h-8 mx-auto text-[var(--color-accent-teal)] animate-spin mb-4" />
                  ) : (
                    <ImageIcon className="w-8 h-8 mx-auto text-[var(--color-text-dim)] mb-4" />
                  )}
                  <h3 className="text-sm font-mono text-[var(--color-text-primary)] mb-1">Upload DICOM File (.dcm)</h3>
                  <p className="text-xs text-[var(--color-text-dim)]">Click to browse or drag and drop</p>
                </div>

                {dicomMetadata && (
                  <div className="mt-6">
                    <h3 className="text-sm font-mono text-[var(--color-accent-teal)] uppercase tracking-wider mb-3">Extracted DICOM Metadata</h3>
                    <div className="grid grid-cols-2 gap-4 bg-[var(--color-bg-surface)] p-4 rounded border border-[#333]">
                      <div>
                        <div className="text-[10px] text-[var(--color-text-dim)] uppercase">Patient Name</div>
                        <div className="font-mono text-sm text-[var(--color-text-primary)]">{dicomMetadata.patientName}</div>
                      </div>
                      <div>
                        <div className="text-[10px] text-[var(--color-text-dim)] uppercase">Patient ID</div>
                        <div className="font-mono text-sm text-[var(--color-text-primary)]">{dicomMetadata.patientId}</div>
                      </div>
                      <div>
                        <div className="text-[10px] text-[var(--color-text-dim)] uppercase">Modality</div>
                        <div className="font-mono text-sm text-[var(--color-text-primary)]">{dicomMetadata.modality}</div>
                      </div>
                      <div>
                        <div className="text-[10px] text-[var(--color-text-dim)] uppercase">Study Date</div>
                        <div className="font-mono text-sm text-[var(--color-text-primary)]">{dicomMetadata.studyDate}</div>
                      </div>
                      <div className="col-span-2">
                        <div className="text-[10px] text-[var(--color-text-dim)] uppercase">Study Description</div>
                        <div className="font-mono text-sm text-[var(--color-text-primary)]">{dicomMetadata.studyDescription}</div>
                      </div>
                      <div>
                        <div className="text-[10px] text-[var(--color-text-dim)] uppercase">Manufacturer</div>
                        <div className="font-mono text-sm text-[var(--color-text-primary)]">{dicomMetadata.manufacturer}</div>
                      </div>
                      <div>
                        <div className="text-[10px] text-[var(--color-text-dim)] uppercase">File Size</div>
                        <div className="font-mono text-sm text-[var(--color-text-primary)]">{dicomMetadata.fileSize}</div>
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
