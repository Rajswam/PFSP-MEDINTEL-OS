import { GoogleGenAI, Type, ThinkingLevel, Modality } from "@google/genai";

let aiClient: GoogleGenAI | null = null;

export function getAIClient(): GoogleGenAI {
  if (!aiClient) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey || apiKey.trim() === "" || apiKey.includes("TODO") || apiKey.includes("YOUR_API_KEY")) {
      throw new Error("GEMINI_API_KEY environment variable is missing or invalid. Please configure it in your settings.");
    }
    aiClient = new GoogleGenAI({ apiKey });
  }
  return aiClient;
}

export function handleGeminiError(error: any): never {
  console.error("Gemini API Error:", error);
  const errorMessage = error instanceof Error ? error.message : String(error);
  
  if (errorMessage.includes("429") || errorMessage.includes("RESOURCE_EXHAUSTED") || errorMessage.includes("quota")) {
    throw new Error("Gemini API quota exceeded. Please check your API key billing details or try again later.");
  }
  
  throw error;
}

const ai = {
  get models() {
    const baseModels = getAIClient().models;
    return new Proxy(baseModels, {
      get(target, prop) {
        const origMethod = target[prop as keyof typeof target];
        if (typeof origMethod === 'function') {
          return function (...args: any[]) {
            try {
              const result = (origMethod as any).apply(target, args);
              if (result instanceof Promise) {
                return result.catch(handleGeminiError);
              }
              if (result && typeof result[Symbol.asyncIterator] === 'function') {
                return (async function* () {
                  try {
                    for await (const item of result) {
                      yield item;
                    }
                  } catch (error) {
                    handleGeminiError(error);
                  }
                })();
              }
              return result;
            } catch (error) {
              handleGeminiError(error);
            }
          };
        }
        return origMethod;
      }
    });
  }
};

export async function generateReport(
  patientId: string,
  fileData: { data: string; mimeType: string } | null,
  textContext: string,
  useHighThinking: boolean,
  useSearch: boolean = false,
  clinicalSetting: string = "General Practice",
  requireCoding: boolean = true,
  knowledgeBaseContext: string = ""
) {
  let prompt = `
You are the PFSP-MEDINTEL Operating System, an elite expert physician companion. 
You operate across emergency, critical care, hospital, office, and ward settings. 
Your thought navigation must be structured, pathophysiologically and homeostatically grounded. 
Always provide triage advice, predict outcomes, and optimize for the best possible cure or outcome based on the clinical presentation.

Generate an ADVANCED CLINICAL ANALYTICAL REPORT (PFSP-26 Bio-Neuron Ensemble Active Inference Analysis).
Case ID: ${patientId}
Clinical Setting: ${clinicalSetting}

Analyze the provided case information (which may include text, images, videos, or PDFs).
Structure the report professionally with the following sections:
1. Patient Demographics & ID
2. Chief Complaint & History
3. Clinical Findings & Vitals
4. Pathophysiological & Homeostatic Assessment (Focus on acute/critical deviations, hemodynamics, and system failures)
5. Differential Diagnosis
6. Triage Advice & Prognostic Prediction
7. Recommended Action Plan & Interventions (Acute management progressing to chronic care if applicable)
8. Bio-Neuron Ensemble Insights
`;

  if (requireCoding) {
    prompt += `
CRITICAL REQUIREMENT: You MUST include relevant standardized medical codes for all diagnoses, observations, and procedures to ensure EHR/HL7 compatibility.
- Use ICD-11 for diagnoses and conditions.
- Use SNOMED CT for clinical concepts, findings, and pathophysiological states.
- Use LOINC for laboratory observations, vitals, and measurements.
Format codes clearly inline or in a dedicated table (e.g., **Condition** [ICD-11: 1A00], **Finding** [SNOMED: 123456789], **Lab** [LOINC: 1234-5]).
`;
  }

  if (knowledgeBaseContext) {
    prompt += `
EXPERT KNOWLEDGE BASE CONTEXT (Use this to inform your reasoning and optimize outcomes):
${knowledgeBaseContext}
`;
  }

  prompt += `\nCase Context:\n${textContext}`;

  const parts: any[] = [{ text: prompt }];
  if (fileData) {
    parts.push({
      inlineData: {
        data: fileData.data,
        mimeType: fileData.mimeType,
      },
    });
  }

  const model = useHighThinking ? "gemini-3.1-pro-preview" : "gemini-3-flash-preview";
  const config: any = {};
  
  if (useHighThinking) {
    config.thinkingConfig = { thinkingLevel: ThinkingLevel.HIGH };
  }

  if (useSearch) {
    config.tools = [{ googleSearch: {} }];
  }

  const response = await ai.models.generateContent({
    model,
    contents: { parts },
    config,
  });

  return response.text;
}

export async function analyzeMedicalImage(
  fileData: { data: string; mimeType: string },
  analysisType: string
): Promise<string> {
  const prompt = `
You are an expert physician, cardiologist, and radiologist.
Analyze the provided medical image/data. The requested analysis type is: ${analysisType}.
Provide a detailed, structured, and highly professional clinical analysis of the findings.
Include any abnormalities, potential diagnoses, and recommendations.
Format the output clearly using markdown.
  `;

  const response = await ai.models.generateContent({
    model: "gemini-3.1-pro-preview",
    contents: {
      parts: [
        { text: prompt },
        {
          inlineData: {
            data: fileData.data,
            mimeType: fileData.mimeType,
          },
        },
      ],
    },
  });

  return response.text || "No analysis generated.";
}

export async function extractKnowledge(
  fileData: { data: string; mimeType: string },
  fileName: string
): Promise<{ title: string; summary: string; content: string }> {
  const prompt = `
You are an expert medical knowledge extraction system.
Analyze the provided document (${fileName}).
Extract the core medical knowledge, guidelines, pathophysiological insights, or research findings.
Format your response as a JSON object with the following keys:
- "title": A concise, descriptive title for the document.
- "summary": A brief 2-3 sentence summary of the key takeaways.
- "content": A detailed extraction of the important medical knowledge, structured logically.

Return ONLY valid JSON. Do not include markdown formatting like \`\`\`json.
  `;

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: {
      parts: [
        { text: prompt },
        { inlineData: { data: fileData.data, mimeType: fileData.mimeType } }
      ]
    },
    config: {
      responseMimeType: "application/json",
    }
  });

  try {
    const result = JSON.parse(response.text || "{}");
    return {
      title: result.title || fileName,
      summary: result.summary || "No summary available.",
      content: result.content || "No content extracted."
    };
  } catch (e) {
    console.error("Failed to parse knowledge extraction JSON", e);
    return {
      title: fileName,
      summary: "Extraction failed.",
      content: response.text || ""
    };
  }
}

export async function extractMedicalCodes(reportText: string): Promise<{ system: string; code: string; description: string }[]> {
  const prompt = `
You are an expert medical coder.
Extract all medical codes (SNOMED CT, ICD-11, LOINC) mentioned in the following clinical report.
Return a JSON array of objects with keys: "system" (e.g., "SNOMED", "ICD-11", "LOINC"), "code", and "description".
If no codes are found, return an empty array [].

Report:
${reportText}
  `;

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: prompt,
    config: { responseMimeType: "application/json" }
  });

  try {
    return JSON.parse(response.text || "[]");
  } catch (e) {
    console.error("Failed to parse medical codes JSON", e);
    return [];
  }
}

export async function extractSystemAssessments(reportText: string) {
  const prompt = `
You are an expert physician and pathophysiologist. Analyze the following clinical report and perform a Lyapunov equilibrium stability assessment of the patient's homeostatic mechanisms and pathophysiological processes.

Assess the following homeostatic mechanisms: acid-base, fluid-electrolyte, coagulation, inflammatory state/index, microbiome (gut/oral/general/focal), alveolar ventilation, cellular & mitochondrial function/respiration, and anabolic/catabolic state.
CRITICAL: You MUST list ALL abnormal homeostatic mechanisms that cause or contribute to the disease process, clinical condition, or current clinical situation. Include the extent of deviation from normal physiology.

Assess the pathophysiological mechanisms broadly classified into: infection, inflammation, neoplastic (benign/malignant), autoimmune, vascular, environmental & toxins/drug side effects, functional, genetic, epigenetic, genomic, proteomic, molecular, biochemical, and structural.
CRITICAL: You MUST include ALL pathophysiological mechanisms that cause or contribute to the condition. Enhance explainability by establishing clear cause-and-effect links, relationships, and reasoning.

Return the assessment as a JSON object with two arrays: "homeostasis" and "pathophysiology".

Format:
{
  "homeostasis": [
    {
      "system": "Acid-Base",
      "status": "Normal" | "Abnormal",
      "deviation": "None" | "Mild" | "Moderate" | "Severe",
      "lyapunovStability": "Stable" | "Asymptotically Stable" | "Unstable",
      "description": "Brief explanation of the mechanism, the extent of deviation from normal physiology, and how it contributes to the disease process."
    }
  ],
  "pathophysiology": [
    {
      "category": "Infection",
      "involved": true | false,
      "description": "Detailed explanation of how this mechanism causes or contributes to the condition, establishing clear cause-and-effect links, relationships, and reasoning."
    }
  ]
}

Clinical Report:
${reportText}
  `;

  const response = await ai.models.generateContent({
    model: "gemini-3.1-pro-preview",
    contents: prompt,
    config: {
      responseMimeType: "application/json",
    }
  });

  try {
    return JSON.parse(response.text || "{\"homeostasis\":[],\"pathophysiology\":[]}");
  } catch (e) {
    console.error("Failed to parse system assessments JSON", e);
    return { homeostasis: [], pathophysiology: [] };
  }
}

export async function generateFHIRBundle(reportText: string): Promise<string> {
  const prompt = `
You are an expert medical informatician and HL7 FHIR integration specialist.
Convert the following clinical report into a valid HL7 FHIR R4 JSON Bundle.
The Bundle should be of type "document" or "collection" and include relevant resources such as:
- Patient
- Encounter
- Condition (extracting ICD-11 / SNOMED codes)
- Observation (extracting LOINC codes for labs/vitals)
- DiagnosticReport

Return ONLY valid JSON. Do not include markdown formatting like \`\`\`json.

Clinical Report:
${reportText}
  `;

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: prompt,
    config: {
      responseMimeType: "application/json",
    }
  });

  return response.text || "{}";
}

export async function chatWithCase(
  history: { role: "user" | "model"; parts: { text: string }[] }[],
  message: string,
  useHighThinking: boolean,
  useSearch: boolean = false,
  useMaps: boolean = false,
  knowledgeBaseContext: string = ""
) {
  // Use flash-lite for low latency if high thinking is disabled
  const model = useHighThinking ? "gemini-3.1-pro-preview" : "gemini-3.1-flash-lite-preview";
  
  let systemInstruction = "You are the PFSP-MEDINTEL Operating System, an elite expert physician companion assisting a medical professional with a specific case in an acute/critical care setting. Provide concise, accurate, and professional medical insights. Use SNOMED, ICD-11, and LOINC codes where appropriate. Think pathophysiologically and homeostatically. Optimize for the best cure or outcome.";
  
  if (knowledgeBaseContext) {
    systemInstruction += `\n\nEXPERT KNOWLEDGE BASE CONTEXT:\n${knowledgeBaseContext}`;
  }

  const config: any = {
    systemInstruction,
  };

  if (useHighThinking) {
    config.thinkingConfig = { thinkingLevel: ThinkingLevel.HIGH };
  }

  if (useSearch) {
    config.tools = [{ googleSearch: {} }];
  } else if (useMaps) {
    config.tools = [{ googleMaps: {} }];
  }

  const contents = history.map(h => ({
    role: h.role,
    parts: h.parts
  }));
  
  contents.push({
    role: "user",
    parts: [{ text: message }]
  });

  const response = await ai.models.generateContent({
    model,
    contents,
    config,
  });

  return response.text;
}

export async function chatWithKnowledgeBase(
  history: { role: "user" | "model"; parts: { text: string }[] }[],
  message: string,
  knowledgeBaseContext: string
) {
  const model = "gemini-3.1-pro-preview";
  
  const systemInstruction = `You are the PFSP-MEDINTEL Knowledge Base Assistant.
Your primary role is to answer questions, summarize, and provide insights based strictly on the provided EXPERT KNOWLEDGE BASE CONTEXT.
If the answer is not contained within the context, you should state that clearly, but you may use your general medical knowledge to supplement if appropriate, while clearly distinguishing between what is in the uploaded documents and what is general knowledge.

EXPERT KNOWLEDGE BASE CONTEXT:
${knowledgeBaseContext}`;

  const config: any = {
    systemInstruction,
    thinkingConfig: { thinkingLevel: ThinkingLevel.HIGH }
  };

  const contents = history.map(h => ({
    role: h.role,
    parts: h.parts
  }));
  
  contents.push({
    role: "user",
    parts: [{ text: message }]
  });

  const response = await ai.models.generateContent({
    model,
    contents,
    config,
  });

  return response.text;
}

export async function generateImage(prompt: string, aspectRatio: string = "1:1") {
  const response = await ai.models.generateContent({
    model: 'gemini-3.1-flash-image-preview',
    contents: {
      parts: [{ text: prompt }],
    },
    config: {
      imageConfig: {
        aspectRatio: aspectRatio,
        imageSize: "1K"
      }
    },
  });
  
  for (const part of response.candidates?.[0]?.content?.parts || []) {
    if (part.inlineData) {
      return `data:image/png;base64,${part.inlineData.data}`;
    }
  }
  throw new Error("No image generated");
}

export async function generateVideo(prompt: string) {
  let operation = await ai.models.generateVideos({
    model: 'veo-3.1-lite-generate-preview',
    prompt: prompt,
    config: {
      numberOfVideos: 1,
      resolution: '1080p',
      aspectRatio: '16:9'
    }
  });

  while (!operation.done) {
    await new Promise(resolve => setTimeout(resolve, 5000));
    break; 
  }
  
  throw new Error("Video generation takes several minutes. Polling is required.");
}

export async function generateMusic(prompt: string): Promise<string> {
  const response = await ai.models.generateContentStream({
    model: "lyria-3-clip-preview",
    contents: prompt,
  });

  let audioBase64 = "";
  let mimeType = "audio/wav";

  for await (const chunk of response) {
    const parts = chunk.candidates?.[0]?.content?.parts;
    if (!parts) continue;
    for (const part of parts) {
      if (part.inlineData?.data) {
        if (!audioBase64 && part.inlineData.mimeType) {
          mimeType = part.inlineData.mimeType;
        }
        audioBase64 += part.inlineData.data;
      }
    }
  }

  return `data:${mimeType};base64,${audioBase64}`;
}

export async function transcribeAudio(fileData: { data: string; mimeType: string }): Promise<string> {
  const prompt = `You are an expert medical transcriptionist. Transcribe the following audio accurately.`;
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: {
      parts: [
        { text: prompt },
        { inlineData: { data: fileData.data, mimeType: fileData.mimeType } }
      ]
    }
  });
  return response.text || "No transcription generated.";
}

export async function generateSpeech(text: string): Promise<string> {
  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash-preview-tts",
    contents: [{ parts: [{ text }] }],
    config: {
      responseModalities: [Modality.AUDIO],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: { voiceName: 'Kore' },
        },
      },
    },
  });

  const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
  if (base64Audio) {
    return `data:audio/wav;base64,${base64Audio}`;
  }
  throw new Error("No speech generated");
}
