import * as fs from 'fs';
import * as path from 'path';
import pdfParse from 'pdf-parse';
import mammoth from 'mammoth';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { PDF_PARSE_CONFIDENCE_THRESHOLD } from '../agents/config';
import type { PaperInput } from '../pipeline/types';

export async function parsePaperFile(filePath: string): Promise<PaperInput> {
  const ext = path.extname(filePath).toLowerCase();
  const fileBuffer = fs.readFileSync(filePath);
  const t0 = Date.now();

  const fileName = path.basename(filePath, ext);
  const result = await parsePaperBuffer(fileBuffer, ext, fileName);

  const elapsed = Date.now() - t0;
  console.log(`[Parser] Parsed ${filePath} in ${elapsed}ms`);

  return result;
}

export async function parsePaperBuffer(
  buffer: Buffer,
  ext: string,
  fileName = 'uploaded'
): Promise<PaperInput> {
  let rawText: string;
  let metadata: Record<string, unknown> = {};

  switch (ext.toLowerCase()) {
    case '.pdf':
      rawText = await parsePDF(buffer);
      break;
    case '.docx':
      rawText = await parseDOCX(buffer);
      break;
    case '.json':
      return parseJSON(buffer);
    default:
      throw new Error(
        `Unsupported file type: ${ext}. Supported formats: .pdf, .docx, .json`
      );
  }

  const paperId = fileName.replace(/[^a-zA-Z0-9_-]/g, '_');

  return {
    paper_id: paperId,
    title: extractTitle(rawText) || fileName,
    raw_text: rawText,
    metadata,
  };
}

async function parsePDF(buffer: Buffer): Promise<string> {
  try {
    const data = await pdfParse(buffer);
    const confidence = calculatePDFConfidence(data);
    console.log(`[Parser] pdf-parse confidence ${confidence.toFixed(2)}`);
    
    if (confidence < PDF_PARSE_CONFIDENCE_THRESHOLD) {
      console.log(`[PDF Parser] Low confidence (${confidence.toFixed(2)}), using Gemini OCR...`);
      return await parsePDFWithGemini(buffer);
    }
    
    return data.text;
  } catch (error) {
    throw new Error(`Failed to parse PDF: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function calculatePDFConfidence(data: Awaited<ReturnType<typeof pdfParse>>): number {
  let confidence = 1.0;
  
  const textLength = data.text.trim().length;
  const totalPages = data.numpages;
  
  if (textLength === 0) {
    return 0.0;
  }
  
  const avgCharsPerPage = textLength / totalPages;
  
  if (avgCharsPerPage < 100) {
    confidence *= 0.5;
  } else if (avgCharsPerPage < 500) {
    confidence *= 0.7;
  }
  
  const whitespaceRatio = (data.text.match(/\s/g) || []).length / data.text.length;
  if (whitespaceRatio > 0.5) {
    confidence *= 0.6;
  }
  
  const hasManyNewlines = (data.text.match(/\n\n\n+/g) || []).length > totalPages * 2;
  if (hasManyNewlines) {
    confidence *= 0.7;
  }
  
  return Math.min(confidence, 1.0);
}

async function parsePDFWithGemini(buffer: Buffer): Promise<string> {
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    throw new Error('GOOGLE_API_KEY is required for PDF OCR fallback');
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ 
    model: process.env.INGESTION_MODEL || 'gemini-2.5-flash'
  });

  try {
    const pdfBase64 = buffer.toString('base64');
    
    const result = await model.generateContent({
      contents: [{
        role: 'user',
        parts: [
          {
            text: 'Extract all text from this PDF document. Return only the raw text content, preserving the structure and formatting as much as possible. Do not add any commentary or markdown formatting.',
          },
          {
            inlineData: {
              mimeType: 'application/pdf',
              data: pdfBase64,
            },
          },
        ],
      }],
    });

    const text = result.response.text();
    if (!text || text.trim().length === 0) {
      throw new Error('Gemini returned empty text from PDF');
    }

    return text;
  } catch (error) {
    throw new Error(
      `Failed to parse PDF with Gemini: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

async function parseDOCX(buffer: Buffer): Promise<string> {
  try {
    const result = await mammoth.extractRawText({ buffer });
    return result.value;
  } catch (error) {
    throw new Error(`Failed to parse DOCX: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function parseJSON(buffer: Buffer): PaperInput {
  try {
    const data = JSON.parse(buffer.toString('utf-8'));
    return {
      paper_id: data.paper_id,
      title: data.title,
      raw_text: data.raw_text,
      metadata: data.metadata || {},
    };
  } catch (error) {
    throw new Error(`Failed to parse JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function extractTitle(text: string): string | undefined {
  const lines = text.split('\n').filter((line) => line.trim().length > 0);
  if (lines.length > 0) {
    const firstLine = lines[0].trim();
    if (firstLine.length > 10 && firstLine.length < 200) {
      return firstLine;
    }
  }
  return undefined;
}
