import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import type {
  MockInterviewQuestionTurn,
  MockInterviewScorecard,
} from '../types/mideocode.ts';

function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    throw new Error(
      'GEMINI_API_KEY is not configured on the server. Add GEMINI_API_KEY in Settings > Secrets to enable AI interviewer questions.',
    );
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

async function callGeminiWithRetry<T>(fn: () => Promise<T>, maxRetries = 2): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      const msg = err instanceof Error ? err.message : String(err);
      const retryable =
        msg.includes('429') ||
        msg.includes('503') ||
        msg.includes('UNAVAILABLE') ||
        msg.includes('RESOURCE_EXHAUSTED');
      if (!retryable || attempt === maxRetries) {
        throw err;
      }
      await new Promise((r) => setTimeout(r, 400 * Math.pow(2, attempt)));
    }
  }
  throw lastError;
}

export async function generateInterviewFollowup(input: {
  careerPathTitle: string;
  challengeTitle: string;
  problemStatement: string;
  difficulty: 'easy' | 'medium' | 'hard';
  language: 'javascript' | 'python';
  code: string;
  passedCount: number;
  totalCount: number;
  elapsedSeconds: number;
  transcript: MockInterviewQuestionTurn[];
}): Promise<{
  briefReaction: string;
  question: string;
  topicTag: string;
}> {
  const ai = getGeminiClient();

  const recentTranscript = (input.transcript || [])
    .slice(-8)
    .map((t) => `${t.role === 'interviewer' ? 'Interviewer' : 'Candidate'}: ${t.content}`)
    .join('\n');

  const prompt = [
    `Target Role: ${input.careerPathTitle.slice(0, 100)}`,
    `Problem: ${input.challengeTitle} (${input.difficulty})`,
    `Problem Summary: ${input.problemStatement.slice(0, 1000)}`,
    `Language: ${input.language}`,
    `Elapsed Time: ${Math.floor(input.elapsedSeconds / 60)}m ${input.elapsedSeconds % 60}s`,
    `Latest Server Test Suite Outcome: ${input.passedCount}/${input.totalCount} test cases passed.`,
    '',
    'Candidate Current Code:',
    '```' + input.language,
    input.code.slice(0, 8000),
    '```',
    '',
    recentTranscript ? `Interview Transcript So Far:\n${recentTranscript}` : 'This is the opening technical follow-up.',
    '',
    'Instructions:',
    '1. Act as a calm, realistic senior engineering interviewer conducting a timed coding interview.',
    '2. Give a concise 1-2 sentence reaction referencing their actual code or explanation (do NOT reveal full solution code).',
    '3. Ask ONE focused follow-up question probing time/space complexity, edge cases, data-structure choice, or a scaling scenario tailored to their current code.',
  ].join('\n');

  const response = await callGeminiWithRetry(() =>
    ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: prompt,
      config: {
        systemInstruction:
          'You are a staff software engineer conducting a structured timed mock coding interview. Be encouraging, crisp, technically accurate, and never hand the candidate a complete copy-paste solution.',
        thinkingConfig: { thinkingLevel: ThinkingLevel.MEDIUM },
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            briefReaction: {
              type: Type.STRING,
              description: '1-2 sentence reaction acknowledging their latest answer or code progress.',
            },
            question: {
              type: Type.STRING,
              description: 'Single focused technical interview follow-up question.',
            },
            topicTag: {
              type: Type.STRING,
              description: 'Short category label such as Time Complexity, Edge Cases, Space Trade-off, or Code Clarity.',
            },
          },
          required: ['briefReaction', 'question', 'topicTag'],
        },
      },
    }),
  );

  const rawText = (response.text ?? '').trim();
  const parsed = JSON.parse(rawText) as {
    briefReaction?: string;
    question?: string;
    topicTag?: string;
  };

  if (!parsed.question) {
    throw new Error('Interviewer model returned an incomplete follow-up payload.');
  }

  return {
    briefReaction: String(parsed.briefReaction || '').trim().slice(0, 500),
    question: String(parsed.question).trim().slice(0, 800),
    topicTag: String(parsed.topicTag || 'Technical Follow-up').trim().slice(0, 48),
  };
}

export async function evaluateInterviewSession(input: {
  careerPathTitle: string;
  challengeTitle: string;
  problemStatement: string;
  difficulty: 'easy' | 'medium' | 'hard';
  language: 'javascript' | 'python';
  code: string;
  passedTests: number;
  totalTests: number;
  durationMinutes: number;
  elapsedSeconds: number;
  transcript: MockInterviewQuestionTurn[];
}): Promise<MockInterviewScorecard> {
  const ai = getGeminiClient();

  const correctnessScore =
    input.totalTests > 0
      ? Math.round((Math.min(input.passedTests, input.totalTests) / input.totalTests) * 100)
      : 0;

  const transcriptText = (input.transcript || [])
    .slice(-16)
    .map((t) => `${t.role === 'interviewer' ? 'Interviewer' : 'Candidate'}: ${t.content}`)
    .join('\n');

  const candidateResponsesCount = (input.transcript || []).filter((t) => t.role === 'candidate').length;

  const prompt = [
    `Career Track: ${input.careerPathTitle.slice(0, 100)}`,
    `Problem: ${input.challengeTitle} (${input.difficulty})`,
    `Problem Summary: ${input.problemStatement.slice(0, 1000)}`,
    `Language: ${input.language}`,
    `Time Budget: ${input.durationMinutes} minutes · Elapsed: ${Math.floor(input.elapsedSeconds / 60)}m ${input.elapsedSeconds % 60}s`,
    `Authoritative Server Test Pass Rate: ${input.passedTests}/${input.totalTests} (${correctnessScore}%)`,
    `Candidate Written Follow-up Answers Count: ${candidateResponsesCount}`,
    '',
    'Final Submitted Code:',
    '```' + input.language,
    input.code.slice(0, 10000),
    '```',
    '',
    transcriptText ? `Interview Q&A Transcript:\n${transcriptText}` : 'Candidate did not submit written interview follow-up responses.',
    '',
    'Score the candidate honestly and accurately based on the real code, server test results, and Q&A transcript:',
    '- If tests failed or code is still starter/incomplete, reflect that strictly in complexityScore and codeQualityScore.',
    '- If candidate skipped explaining complexity or gave superficial answers, reflect that strictly in communicationScore.',
    '- Identify the actual Big-O time & space complexity of their submitted implementation.',
  ].join('\n');

  const response = await callGeminiWithRetry(() =>
    ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: prompt,
      config: {
        systemInstruction:
          'You are an engineering hiring bar-raiser producing a fair, concrete, evidence-based technical interview scorecard. Never inflate scores when tests fail or code is incomplete.',
        thinkingConfig: { thinkingLevel: ThinkingLevel.HIGH },
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            codeQualityScore: { type: Type.INTEGER },
            complexityScore: { type: Type.INTEGER },
            communicationScore: { type: Type.INTEGER },
            detectedTimeComplexity: { type: Type.STRING },
            detectedSpaceComplexity: { type: Type.STRING },
            strengths: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
            },
            improvements: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
            },
            summaryFeedback: { type: Type.STRING },
          },
          required: [
            'codeQualityScore',
            'complexityScore',
            'communicationScore',
            'detectedTimeComplexity',
            'detectedSpaceComplexity',
            'strengths',
            'improvements',
            'summaryFeedback',
          ],
        },
      },
    }),
  );

  const rawText = (response.text ?? '').trim();
  const parsed = JSON.parse(rawText) as {
    codeQualityScore?: number;
    complexityScore?: number;
    communicationScore?: number;
    detectedTimeComplexity?: string;
    detectedSpaceComplexity?: string;
    strengths?: string[];
    improvements?: string[];
    summaryFeedback?: string;
  };

  const clamp = (n: unknown) => {
    const num = Number(n);
    if (!Number.isFinite(num)) return 0;
    return Math.max(0, Math.min(100, Math.round(num)));
  };

  const codeQualityScore = clamp(parsed.codeQualityScore);
  const complexityScore = clamp(parsed.complexityScore);
  const communicationScore =
    candidateResponsesCount === 0
      ? Math.min(clamp(parsed.communicationScore), 45)
      : clamp(parsed.communicationScore);

  const overallScore = Math.round(
    correctnessScore * 0.4 +
      complexityScore * 0.25 +
      codeQualityScore * 0.2 +
      communicationScore * 0.15,
  );

  const readinessLabel: MockInterviewScorecard['readinessLabel'] =
    overallScore >= 85
      ? 'Strong Hire Signal'
      : overallScore >= 70
        ? 'Interview Ready'
        : overallScore >= 50
          ? 'Developing'
          : 'Needs Practice';

  return {
    overallScore,
    correctnessScore,
    codeQualityScore,
    complexityScore,
    communicationScore,
    readinessLabel,
    detectedTimeComplexity: String(parsed.detectedTimeComplexity || 'Unknown').slice(0, 64),
    detectedSpaceComplexity: String(parsed.detectedSpaceComplexity || 'Unknown').slice(0, 64),
    strengths: (Array.isArray(parsed.strengths) ? parsed.strengths : [])
      .map((s) => String(s).trim().slice(0, 240))
      .filter(Boolean)
      .slice(0, 5),
    improvements: (Array.isArray(parsed.improvements) ? parsed.improvements : [])
      .map((s) => String(s).trim().slice(0, 240))
      .filter(Boolean)
      .slice(0, 5),
    summaryFeedback: String(parsed.summaryFeedback || 'Evaluation complete.').trim().slice(0, 1200),
  };
}
