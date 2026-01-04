
import { GoogleGenAI, Type } from "@google/genai";
import { ChapterMarker } from "../types";

export async function analyzeAudioChapters(file: File): Promise<ChapterMarker[]> {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  // Convert file to base64
  const base64Data = await new Promise<string>((resolve) => {
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = (reader.result as string).split(',')[1];
      resolve(base64);
    };
    reader.readAsDataURL(file);
  });

  const prompt = `
    You are an expert audio analyst. Listen carefully to this audio file and identify the exact timestamps where a new chapter begins.
    Look for explicit markers like "Chapter One", "Chapter 2", or distinct musical cues/pauses followed by a book section introduction.
    
    The audio is likely a full book recording. 
    Accuracy is critical for splitting the file.
    Return a list of all detected chapters.
  `;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: [
        {
          parts: [
            { text: prompt },
            {
              inlineData: {
                mimeType: file.type || 'audio/mpeg',
                data: base64Data
              }
            }
          ]
        }
      ],
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              title: {
                type: Type.STRING,
                description: "The name of the chapter, e.g., 'Chapter 1' or 'Chapter 2: The Beginning'"
              },
              start_time_seconds: {
                type: Type.NUMBER,
                description: "The timestamp in seconds where the chapter begins."
              }
            },
            required: ["title", "start_time_seconds"]
          }
        }
      }
    });

    const results = JSON.parse(response.text || "[]");
    // Sort by timestamp to be safe
    return (results as ChapterMarker[]).sort((a, b) => a.start_time_seconds - b.start_time_seconds);
  } catch (error) {
    console.error("Gemini Analysis Error:", error);
    throw new Error("Failed to analyze audio. The file might be too large or the API encountered an issue.");
  }
}
