export type ExperienceLevel = 'beginner' | 'intermediate' | 'advanced';
export type UserRole = 'member' | 'moderator' | 'admin';
export type ThemeMode = 'dark' | 'light';
export type EditorTheme = 'oneDark' | 'githubLight';
export type WorkspaceStartMode = 'dashboard' | 'academy' | 'ide' | 'missions' | 'challenges';
export type AiStylePreference = 'fast' | 'balanced' | 'deep';
export type FocusAudioPreference = 'off' | 'lofi' | 'rain' | 'whitenoise';
export type EditorFontFamily = 'jetbrains' | 'fira' | 'source' | 'system';
export type CodingLayoutDensity = 'comfortable' | 'compact';

export type NavSection =
  | 'dashboard'
  | 'insights'
  | 'academy'
  | 'missions'
  | 'ide'
  | 'ai'
  | 'rescue'
  | 'projects'
  | 'versions'
  | 'collaboration'
  | 'testlab'
  | 'architect'
  | 'docs'
  | 'lab'
  | 'challenges'
  | 'quest'
  | 'community'
  | 'career'
  | 'cloud'
  | 'playground'
  | 'profile'
  | 'admin';

export type AiMode = 'general' | 'learn' | 'debug' | 'explain' | 'practice' | 'build' | 'review';

export interface UserProfile {
  uid: string;
  displayName: string;
  photoURL?: string;
  email?: string;
  phoneNumber?: string;
  country?: string;
  experienceLevel: ExperienceLevel;
  preferredLanguages: string[];
  learningGoals: string[];
  interests: string[];
  hearAboutUs?: string;
  primaryFocus?: string;
  codingCommitment?: string;
  onboardingComplete: boolean;
  activeCareerPathId?: string;
  startingView?: WorkspaceStartMode;
  aiStylePreference?: AiStylePreference;
  defaultFocusMode?: boolean;
  defaultFocusAudio?: FocusAudioPreference;
  editorFontFamily?: EditorFontFamily;
  codingLayoutDensity?: CodingLayoutDensity;
  starterTemplateId?: string;
  xp: number;
  level: number;
  streak: number;
  lastActivityDate?: string;
  role: UserRole;
  createdAt: unknown;
  updatedAt: unknown;
}

export interface PublicProfile {
  uid: string;
  displayName: string;
  photoURL?: string;
  level: number;
  xp: number;
  streak: number;
  badgesCount: number;
  updatedAt: unknown;
}

export interface UserSettings {
  userId: string;
  theme: ThemeMode;
  editorTheme: EditorTheme;
  editorFontSize: number;
  tabSize: 2 | 4;
  autosave: boolean;
  startingView?: WorkspaceStartMode;
  aiStylePreference?: AiStylePreference;
  defaultFocusMode?: boolean;
  defaultFocusAudio?: FocusAudioPreference;
  editorFontFamily?: EditorFontFamily;
  codingLayoutDensity?: CodingLayoutDensity;
  updatedAt: unknown;
}

export interface QuizQuestion {
  id: string;
  prompt: string;
  options: string[];
  correctIndex: number;
  explanation: string;
}

export interface LessonExercise {
  id: string;
  title: string;
  prompt: string;
  language: 'javascript' | 'html' | 'css' | 'python';
  starterCode: string;
  expectedOutputIncludes: string;
  hint: string;
}

export interface Lesson {
  id: string;
  moduleId: string;
  courseId: string;
  title: string;
  durationMinutes: number;
  summary: string;
  explanation: string[];
  codeExample: {
    language: 'html' | 'css' | 'javascript' | 'typescript' | 'python' | 'sql';
    filename: string;
    code: string;
    expectedOutput: string;
  };
  commonMistakes: string[];
  exercise: LessonExercise;
  quiz: QuizQuestion[];
  relatedDocId?: string;
  labToolId?: string;
}

export interface CourseModule {
  id: string;
  title: string;
  description: string;
  lessons: Lesson[];
}

export interface Course {
  id: string;
  title: string;
  category: 'Web Development' | 'Programming Languages' | 'Databases' | 'Development Tools' | 'Computer Science';
  language: string;
  difficulty: ExperienceLevel;
  estimatedHours: number;
  overview: string;
  objectives: string[];
  prerequisites: string[];
  completionCriteria: string;
  relatedProjectId?: string;
  relatedChallengeId?: string;
  modules: CourseModule[];
}

export interface CourseProgress {
  userId: string;
  courseId: string;
  completedLessonIds: string[];
  completedExerciseIds: string[];
  quizScores: Record<string, number>;
  lastLessonId?: string;
  progressPercent: number;
  updatedAt: unknown;
}

export type ProjectCollaboratorRole = 'owner' | 'editor' | 'viewer';

export interface ProjectFile {
  id: string;
  projectId: string;
  ownerId: string;
  name: string;
  folder: string;
  language: string;
  visibility: 'private' | 'public';
  content: string;
  collaboratorIds?: string[];
  lastEditedByUid?: string;
  lastEditedByName?: string;
  updatedAt: unknown;
}

export interface Project {
  id: string;
  ownerId: string;
  ownerName: string;
  title: string;
  description: string;
  language: 'web' | 'javascript' | 'typescript' | 'python' | 'sql' | 'html' | 'css' | 'cpp' | 'csharp' | 'java' | 'go' | 'rust' | 'php';
  guidedProjectId?: string;
  architectureId?: string;
  visibility: 'private' | 'public';
  isPortfolio: boolean;
  milestonesCompleted: string[];
  status: 'active' | 'submitted' | 'completed';
  version: number;
  storageBytes: number;
  collaboratorIds?: string[];
  collaboratorRoles?: Record<string, ProjectCollaboratorRole>;
  collaboratorNames?: Record<string, string>;
  lastEditedByUid?: string;
  lastEditedByName?: string;
  createdAt: unknown;
  updatedAt: unknown;
}

export interface ProjectVersionSnapshot {
  name: string;
  folder: string;
  language: string;
  content: string;
}

export type VersionChangeType = 'manual' | 'autosave' | 'ai_build' | 'ai_fix' | 'restore' | 'collab';

export interface ProjectVersion {
  id: string;
  projectId: string;
  ownerId: string;
  versionNumber: number;
  label: string;
  description?: string;
  authorId?: string;
  authorName?: string;
  changeType?: VersionChangeType;
  aiOperation?: string;
  changedFiles?: string[];
  parentVersionId?: string;
  collaboratorIds?: string[];
  filesCount: number;
  snapshot: ProjectVersionSnapshot[];
  createdAt: unknown;
}

export interface GuidedProjectTemplate {
  id: string;
  title: string;
  category: string;
  language: 'web' | 'javascript' | 'python';
  difficulty: ExperienceLevel;
  description: string;
  objectives: string[];
  milestones: { id: string; title: string; checkHint: string }[];
  starterFiles: { name: string; folder: string; language: string; content: string }[];
}

export interface DocArticle {
  id: string;
  title: string;
  category: 'Web' | 'Languages' | 'Databases' | 'Tools' | 'Concepts';
  version: string;
  overview: string;
  definition: string;
  syntax: string;
  parameters: { name: string; type: string; description: string }[];
  returnValue: string;
  exampleCode: string;
  exampleLanguage: 'html' | 'css' | 'javascript' | 'python' | 'sql';
  expectedOutput: string;
  commonMistakes: string[];
  bestPractices: string[];
  relatedIds: string[];
  relatedCourseId?: string;
}

export interface Challenge {
  id: string;
  title: string;
  difficulty: 'easy' | 'medium' | 'hard';
  category: string;
  cadence: 'daily' | 'weekly' | 'topic';
  xpReward: number;
  supportedLanguages: ('javascript' | 'python')[];
  problemStatement: string;
  inputDescription: string;
  outputDescription: string;
  constraints: string[];
  examples: { input: string; output: string; explanation: string }[];
  hints: string[];
  explanation: string;
  starterCode: {
    javascript: string;
    python: string;
  };
  relatedCourseId?: string;
}

export interface ChallengeTestResult {
  index: number;
  isHidden: boolean;
  passed: boolean;
  inputPreview: string;
  expectedPreview: string;
  actualPreview: string;
  error?: string;
}

export interface ChallengeAttempt {
  id: string;
  userId: string;
  challengeId: string;
  language: 'javascript' | 'typescript' | 'python';
  code: string;
  passed: boolean;
  passedCount: number;
  totalCount: number;
  executionMs: number;
  createdAt: unknown;
}

export interface PlaygroundItem {
  id: string;
  ownerId: string;
  ownerName: string;
  title: string;
  templateId: string;
  html: string;
  css: string;
  js: string;
  visibility: 'private' | 'public';
  forkedFrom?: string;
  createdAt: unknown;
  updatedAt: unknown;
}

export interface CommunityPost {
  id: string;
  authorId: string;
  authorName: string;
  authorRole?: UserRole;
  title: string;
  body: string;
  category: 'question' | 'showcase' | 'discussion' | 'tip' | 'announcement';
  tags: string[];
  codeSnippet?: string;
  imageUrls?: string[];
  videoUrl?: string;
  videoName?: string;
  videoMimeType?: string;
  videoSizeBytes?: number;
  visibility: 'public' | 'hidden';
  likesCount: number;
  commentsCount: number;
  createdAt: unknown;
  updatedAt: unknown;
}

export interface CommunityComment {
  id: string;
  postId: string;
  authorId: string;
  authorName: string;
  authorRole?: UserRole;
  body: string;
  createdAt: unknown;
}

export interface CareerPathway {
  id: string;
  title: string;
  summary: string;
  requiredSkills: { id: string; name: string; category: string }[];
  recommendedCourseIds: string[];
  prerequisites: string[];
  recommendedProjectIds: string[];
  milestones: string[];
  portfolioChecklist: string[];
  cvTips: string[];
  interviewQuestions: { question: string; keyPoints: string[] }[];
}

export interface AiProposedFile {
  filename: string;
  folder?: string;
  language: string;
  code: string;
}

export interface AiChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  proposedCode?: {
    filename: string;
    language: string;
    code: string;
  };
  proposedFiles?: AiProposedFile[];
  sources?: Array<{ title: string; uri: string }>;
  actions?: Array<{ type: 'open_view' | 'focus_mode'; target: string; label: string }>;
  attachments?: Array<{ name: string; kind: 'image' | 'text' }>;
  createdAt: string;
}

export interface AiConversation {
  id: string;
  userId: string;
  title: string;
  mode: AiMode;
  messages: AiChatMessage[];
  createdAt: unknown;
  updatedAt: unknown;
}

export interface BookmarkItem {
  id: string;
  userId: string;
  targetType: 'lesson' | 'doc' | 'post' | 'project' | 'mission';
  targetId: string;
  title: string;
  createdAt: unknown;
}

export interface NoteItem {
  id: string;
  userId: string;
  courseId?: string;
  lessonId?: string;
  title: string;
  content: string;
  createdAt: unknown;
  updatedAt: unknown;
}

export interface NotificationItem {
  id: string;
  userId: string;
  title: string;
  body: string;
  linkView?: string;
  read: boolean;
  createdAt: unknown;
}

export interface AchievementItem {
  id: string;
  userId: string;
  badgeId: string;
  title: string;
  unlockedAt: unknown;
}

export interface XpTransaction {
  id: string;
  userId: string;
  sourceType: 'lesson' | 'quiz' | 'challenge' | 'project' | 'mission';
  sourceId: string;
  amount: number;
  reason: string;
  createdAt: unknown;
}

export interface ModerationReport {
  id: string;
  reporterId: string;
  targetType: 'post' | 'comment' | 'user';
  targetId: string;
  reason: 'spam' | 'harassment' | 'misinformation' | 'unsafe_code' | 'other';
  details?: string;
  status: 'open' | 'reviewed' | 'resolved' | 'dismissed';
  createdAt: unknown;
  updatedAt: unknown;
}

export interface IdeLaunchPayload {
  title: string;
  language: 'web' | 'javascript' | 'typescript' | 'python' | 'sql' | 'html' | 'css' | 'cpp' | 'csharp' | 'java' | 'go' | 'rust' | 'php';
  files: { name: string; folder: string; language: string; content: string }[];
  guidedProjectId?: string;
  architectureId?: string;
}

// ---------------------------------------------------------------------------
// Mission Mode Domain Types
// ---------------------------------------------------------------------------
export type MissionCategory =
  | 'HTML and CSS'
  | 'JavaScript'
  | 'Python'
  | 'Frontend Development'
  | 'Backend Development'
  | 'Full-Stack Development'
  | 'Database Development'
  | 'Algorithms and Data Structures'
  | 'API Development'
  | 'Software Engineering';

export type MissionDifficulty = 'Beginner' | 'Intermediate' | 'Advanced' | 'Expert';
export type MissionLanguage = 'web' | 'javascript' | 'python' | 'sql';
export type MissionStatus = 'draft' | 'published' | 'archived';
export type MissionValidationMethod =
  | 'html'
  | 'css'
  | 'javascript'
  | 'python'
  | 'sql'
  | 'hybrid'
  | 'instructional';

export type MissionSubView =
  | 'landing'
  | 'details'
  | 'workspace'
  | 'history'
  | 'analytics'
  | 'custom'
  | 'team';

export interface MissionHint {
  id: string;
  order: number;
  title: string;
  level: 'nudge' | 'concept' | 'structure' | 'walkthrough';
  content: string;
}

export interface MissionStarterFile {
  id: string;
  name: string;
  folder: string;
  language: string;
  content: string;
  readOnly?: boolean;
}

export interface MissionCheckpoint {
  id: string;
  missionId: string;
  order: number;
  title: string;
  instructions: string;
  requirements: string[];
  completionCriteria: string;
  validationMethod: MissionValidationMethod;
  dependsOn: string[];
  hint?: string;
  isAssessed: boolean;
  status: 'active' | 'archived';
  updatedAt?: unknown;
}

export type MissionQualityStatus = 'draft' | 'testing' | 'approved';

export interface MissionQualityCheckItem {
  id: string;
  stage: 'content' | 'technical' | 'reward' | 'workflow';
  name: string;
  status: 'passed' | 'failed' | 'blocked';
  message: string;
  errorDetails?: string;
  suggestedFix?: string;
}

export interface MissionQualityReport {
  status: MissionQualityStatus;
  checkedAt: string;
  checkedByUid: string;
  summary: string;
  passedCount: number;
  failedCount: number;
  blockedCount: number;
  checks: MissionQualityCheckItem[];
}

export interface MissionReadinessQuestion {
  id: string;
  skill: string;
  prompt: string;
  options: string[];
  correctIndex: number;
  explanation: string;
  recommendedLesson?: { courseId: string; lessonId: string; title: string };
}

export interface Mission {
  id: string;
  title: string;
  description: string;
  category: MissionCategory;
  difficulty: MissionDifficulty;
  language: MissionLanguage;
  supportedLanguages: string[];
  requiredSkills: string[];
  prerequisiteMissionIds: string[];
  prerequisiteSummary?: string;
  prerequisitesOptional: boolean;
  relatedLessonIds: { courseId: string; lessonId: string; title: string }[] | string[];
  learningObjectives: string[];
  estimatedMinutes: number;
  scenario: string;
  clientName?: string;
  userRole?: string;
  projectObjective?: string;
  constraints?: string[];
  requirements: string[];
  instructions: string[];
  hints: MissionHint[];
  completionCriteria: string;
  xpReward: number;
  badgeId: string;
  badgeTitle: string;
  isFeatured: boolean;
  status: MissionStatus;
  qualityStatus?: MissionQualityStatus;
  qualityReport?: MissionQualityReport;
  readinessQuestions?: MissionReadinessQuestion[];
  authorId: string;
  createdAt?: unknown;
  updatedAt?: unknown;
  // Hydrated convenience fields for curated or editor-assembled missions
  checkpoints?: MissionCheckpoint[];
  starterFiles?: MissionStarterFile[];
  publicTestPreviews?: string[];
  source?: 'curated' | 'firestore';
}

export interface MissionTemplate {
  id: string;
  missionId: string;
  language: MissionLanguage;
  files: MissionStarterFile[];
  status: 'active' | 'archived';
  updatedAt?: unknown;
}

export interface MissionReward {
  id: string;
  missionId: string;
  xpAmount: number;
  badgeId: string;
  badgeTitle: string;
  skillsAwarded: string[];
  portfolioEligible: boolean;
  status: 'active' | 'archived';
  updatedAt?: unknown;
}

export type MissionAttemptStatus =
  | 'in_progress'
  | 'submitted'
  | 'needs_improvement'
  | 'completed'
  | 'archived';

export interface MissionCheckpointFeedback {
  passed: boolean;
  message: string;
  details?: string[];
  checkedAt: string;
}

export interface MissionAttempt {
  id: string;
  userId: string;
  missionId: string;
  status: MissionAttemptStatus;
  currentCheckpointId: string;
  completedCheckpointIds: string[];
  acknowledgedStepIds: string[];
  files: MissionStarterFile[];
  version: number;
  checkpointFeedback: Record<string, MissionCheckpointFeedback>;
  rewardsGranted: boolean;
  xpAwarded: number;
  unlockedBadgeIds: string[];
  addedToPassport: boolean;
  portfolioProjectId?: string;
  startedAt: unknown;
  lastActivityAt: unknown;
  completedAt?: unknown;
}

export interface MissionSubmission {
  id: string;
  userId: string;
  missionId: string;
  attemptId: string;
  projectVersion: number;
  language: string;
  filesSnapshot: { name: string; folder: string; language: string; content: string }[];
  status: 'passed' | 'failed';
  createdAt: unknown;
}

export interface MissionTestCaseResult {
  id: string;
  label: string;
  isHidden: boolean;
  passed: boolean;
  expectedSummary: string;
  actualSummary: string;
  error?: string;
}

export interface MissionEvaluation {
  id: string;
  userId: string;
  missionId: string;
  attemptId: string;
  submissionId: string;
  passed: boolean;
  passedCount: number;
  totalCount: number;
  requirementsSatisfied: string[];
  requirementsMissing: string[];
  testResults: MissionTestCaseResult[];
  runtimeErrors: string[];
  suggestions: string[];
  executionMs: number;
  attestation: string;
  createdAt: unknown;
}

export interface MissionHintHistory {
  id: string;
  userId: string;
  missionId: string;
  attemptId: string;
  hintIndex: number;
  hintId: string;
  openedAt: unknown;
}

export interface MissionRecommendation {
  mission: Mission;
  score: number;
  recommendedDifficulty?: MissionDifficulty;
  weakSkills?: string[];
  reasons: string[];
  prerequisitesMet: boolean;
  missingPrerequisites: string[];
  attempt?: MissionAttempt;
}

export interface AdaptiveDifficultyConfig {
  id: string;
  checkpointPassWeight: number;
  evaluationPassWeight: number;
  attemptEfficiencyWeight: number;
  intermediateThreshold: number;
  advancedThreshold: number;
  expertThreshold: number;
  updatedAt?: unknown;
  updatedBy?: string;
}

export interface MissionReadinessResult {
  id: string;
  userId: string;
  missionId: string;
  scorePct: number;
  passedCount: number;
  totalCount: number;
  ready: boolean;
  weakSkills: string[];
  recommendedLessons: { courseId: string; lessonId: string; title: string }[];
  answers: number[];
  createdAt: unknown;
}

export interface MissionAttemptVersion {
  id: string;
  attemptId: string;
  userId: string;
  missionId: string;
  versionNumber: number;
  label: string;
  filesSnapshot: MissionStarterFile[];
  completedCheckpointIds: string[];
  createdAt: unknown;
}

export interface MissionRating {
  id: string;
  missionId: string;
  userId: string;
  difficultyRating: number;
  clarityRating: number;
  usefulnessRating: number;
  starterQualityRating: number;
  overallRating: number;
  comment: string;
  createdAt: unknown;
  updatedAt: unknown;
}

export interface CustomMission {
  id: string;
  authorId: string;
  authorName: string;
  title: string;
  description: string;
  scenario: string;
  category: MissionCategory;
  language: MissionLanguage;
  difficulty: MissionDifficulty;
  skills: string[];
  learningObjectives: string[];
  requirements: string[];
  checkpoints: {
    id: string;
    order: number;
    title: string;
    instructions: string;
    completionCriteria: string;
    checkContains?: string;
  }[];
  starterFiles: MissionStarterFile[];
  hints: string[];
  completionCriteria: string;
  personalDeadline?: string;
  visibility: 'private' | 'shared';
  status: 'active' | 'archived';
  reportedCount?: number;
  createdAt: unknown;
  updatedAt: unknown;
}

export type TeamMemberRole = 'owner' | 'editor' | 'viewer';

export interface TeamContributionEntry {
  editedSaves: number;
  checkpointsValidated: number;
  charsContributed: number;
  lastActiveAt: string;
}

export interface MissionTeam {
  id: string;
  missionId: string;
  missionTitle: string;
  title: string;
  ownerId: string;
  ownerName: string;
  memberIds: string[];
  memberRoles: Record<string, TeamMemberRole>;
  memberNames: Record<string, string>;
  checkpointAssignments: Record<string, string>;
  files: MissionStarterFile[];
  version: number;
  completedCheckpointIds: string[];
  contributions: Record<string, TeamContributionEntry>;
  status: 'active' | 'submitted' | 'completed';
  lastEditedByUid?: string;
  lastEditedByName?: string;
  createdAt: unknown;
  updatedAt: unknown;
}

export interface MissionTeamInvite {
  id: string;
  teamId: string;
  missionId: string;
  missionTitle: string;
  teamTitle: string;
  inviterId: string;
  inviterName: string;
  inviteeUid: string;
  inviteeName?: string;
  role: 'editor' | 'viewer';
  inviteCode: string;
  status: 'pending' | 'accepted' | 'declined';
  createdAt: unknown;
  updatedAt: unknown;
}

export interface PersonalMissionAnalyticsSummary {
  totalStarted: number;
  totalCompleted: number;
  totalActive: number;
  completionRatePct: number;
  checkpointSuccessRatePct: number;
  totalSubmissions: number;
  passedSubmissions: number;
  averageAttemptsPerCompleted: number;
  recommendedDifficulty: MissionDifficulty;
  difficultyRationale: string;
  skillsPracticed: { skill: string; count: number; masteryPct: number }[];
  weakSkills: string[];
  commonFailureAreas: { area: string; occurrences: number }[];
  timeline: { label: string; started: number; completed: number; passedSubmissions: number }[];
}

export interface MissionRuntimeTestSpec {
  id: string;
  label: string;
  isHidden: boolean;
  kind: 'javascript' | 'python' | 'sql' | 'html_css';
  targetFile?: string;
  driverOrQuery: string;
  expectedJson?: unknown;
  mustContainAll?: string[];
  regexChecks?: string[];
  requirementText: string;
}

export interface MissionServerEvalConfig {
  missionId: string;
  language: MissionLanguage;
  xpReward: number;
  badgeId: string;
  badgeTitle: string;
  checkpointValidators: Record<string, MissionRuntimeTestSpec[]>;
  submissionTests: MissionRuntimeTestSpec[];
}

export interface MissionLeaderboardEntry {
  id: string;
  missionId: string;
  userId: string;
  displayName: string;
  photoURL?: string;
  xpAwarded: number;
  durationSeconds: number;
  version: number;
  efficiencyScore: number;
  completedAt: unknown;
  updatedAt: unknown;
}

// ---------------------------------------------------------------------------
// 1. TestLab Domain Types
// ---------------------------------------------------------------------------
export type TestType =
  | 'unit'
  | 'integration'
  | 'functional'
  | 'api'
  | 'regression'
  | 'component'
  | 'edge_case';

export type TestCaseStatus = 'passed' | 'failed' | 'skipped' | 'error' | 'running';

export interface TestCaseItem {
  id: string;
  name: string;
  description: string;
  testType: TestType;
  targetFile: string;
  targetLine?: number;
  code: string;
  expectedResult: string;
  enabled: boolean;
  aiGenerated?: boolean;
}

export interface TestSuite {
  id: string;
  userId: string;
  projectId: string;
  projectTitle: string;
  title: string;
  language: string;
  framework: string;
  testType: TestType;
  cases: TestCaseItem[];
  approved: boolean;
  collaboratorIds?: string[];
  createdAt: unknown;
  updatedAt: unknown;
}

export interface TestCaseResult {
  caseId: string;
  name: string;
  description: string;
  testType: TestType;
  status: TestCaseStatus;
  durationMs: number;
  expectedResult: string;
  actualResult: string;
  failureMessage?: string;
  fileRef?: string;
  lineRef?: number;
}

export interface TestCoverageSummary {
  available: boolean;
  reason?: string;
  linePct?: number;
  statementPct?: number;
  functionPct?: number;
  branchPct?: number;
  coveredLines?: number;
  totalLines?: number;
  fileBreakdown?: {
    file: string;
    linePct: number;
    coveredLines: number;
    totalLines: number;
  }[];
}

export interface TestRunSession {
  id: string;
  userId: string;
  projectId: string;
  projectTitle: string;
  suiteId: string;
  suiteTitle: string;
  language: string;
  testType: TestType;
  status: 'passed' | 'failed' | 'error';
  totalTests: number;
  passedTests: number;
  failedTests: number;
  skippedTests: number;
  errorTests: number;
  durationMs: number;
  results: TestCaseResult[];
  coverage: TestCoverageSummary;
  aiAssisted: boolean;
  collaboratorIds?: string[];
  createdAt: unknown;
}

// ---------------------------------------------------------------------------
// 2. Architect Domain Types
// ---------------------------------------------------------------------------
export type DiagramKind =
  | 'system'
  | 'er'
  | 'workflow'
  | 'journey'
  | 'api'
  | 'component'
  | 'dataflow';

export interface ArchitectureDiagramNode {
  id: string;
  label: string;
  sublabel?: string;
  layer: 'client' | 'api' | 'service' | 'data' | 'external' | 'auth';
  x: number;
  y: number;
}

export interface ArchitectureDiagramEdge {
  id: string;
  from: string;
  to: string;
  label: string;
}

export interface ArchitectureDiagram {
  kind: DiagramKind;
  title: string;
  summary: string;
  nodes: ArchitectureDiagramNode[];
  edges: ArchitectureDiagramEdge[];
}

export interface DatabaseFieldSpec {
  name: string;
  type: string;
  nullable: boolean;
  isPrimaryKey?: boolean;
  isForeignKey?: boolean;
  references?: string;
  unique?: boolean;
  constraints?: string;
}

export interface DatabaseSchemaTable {
  id: string;
  name: string;
  description: string;
  fields: DatabaseFieldSpec[];
  indexes: string[];
}

export interface ApiEndpointSpec {
  id: string;
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path: string;
  summary: string;
  authRequired: boolean;
  roleRequirement?: string;
  requestSchema: string;
  responseSchema: string;
  validationRules: string[];
  errorResponses: { status: number; code: string; message: string }[];
}

export interface TechRecommendation {
  layer: 'Frontend' | 'Backend' | 'Database' | 'Authentication' | 'Testing' | 'Deployment';
  choice: string;
  rationale: string;
}

export interface ArchitectureModuleSpec {
  id: string;
  name: string;
  purpose: string;
  folderPath: string;
  dependencies: string[];
  keyFiles: string[];
}

export interface ArchitecturePlan {
  id: string;
  userId: string;
  projectId?: string;
  title: string;
  prompt: string;
  overview: string;
  frontendSpec: string;
  backendSpec: string;
  authSpec: string;
  techStack: TechRecommendation[];
  modules: ArchitectureModuleSpec[];
  databaseTables: DatabaseSchemaTable[];
  apiEndpoints: ApiEndpointSpec[];
  diagrams: ArchitectureDiagram[];
  versionNumber: number;
  status: 'draft' | 'approved' | 'sent_to_build';
  createdAt: unknown;
  updatedAt: unknown;
}

export interface ArchitectureVersion {
  id: string;
  architectureId: string;
  userId: string;
  versionNumber: number;
  label: string;
  changeSummary: string;
  snapshot: Omit<ArchitecturePlan, 'id' | 'userId' | 'createdAt' | 'updatedAt'>;
  createdAt: unknown;
}

// ---------------------------------------------------------------------------
// 3. Version History Diff & Restoration Types
// ---------------------------------------------------------------------------
export interface DiffLineEntry {
  type: 'unchanged' | 'added' | 'removed';
  oldLine?: number;
  newLine?: number;
  text: string;
}

export interface FileDiffSummary {
  path: string;
  status: 'added' | 'removed' | 'modified' | 'unchanged';
  additions: number;
  deletions: number;
  lines: DiffLineEntry[];
}

// ---------------------------------------------------------------------------
// 4. Collaboration Domain Types
// ---------------------------------------------------------------------------
export interface ProjectInvitation {
  id: string;
  projectId: string;
  projectTitle: string;
  inviterId: string;
  inviterName: string;
  inviteeEmail: string;
  role: 'editor' | 'viewer';
  status: 'pending' | 'accepted' | 'declined' | 'cancelled';
  inviteSignature: string;
  expiresAt: string;
  createdAt: unknown;
  updatedAt: unknown;
}

export interface ProjectComment {
  id: string;
  projectId: string;
  authorId: string;
  authorName: string;
  filePath?: string;
  lineStart?: number;
  lineEnd?: number;
  parentCommentId?: string;
  mentions: string[];
  body: string;
  status: 'open' | 'resolved';
  resolvedBy?: string;
  collaboratorIds?: string[];
  createdAt: unknown;
  updatedAt: unknown;
}

export type ProjectActivityAction =
  | 'invite_sent'
  | 'invite_accepted'
  | 'invite_declined'
  | 'invite_cancelled'
  | 'role_changed'
  | 'member_removed'
  | 'file_saved'
  | 'file_created'
  | 'file_deleted'
  | 'version_created'
  | 'version_restored'
  | 'comment_added'
  | 'comment_resolved'
  | 'ai_applied'
  | 'tests_run';

export interface ProjectActivityEvent {
  id: string;
  projectId: string;
  actorId: string;
  actorName: string;
  action: ProjectActivityAction;
  summary: string;
  targetName?: string;
  collaboratorIds?: string[];
  createdAt: unknown;
}

// ---------------------------------------------------------------------------
// 5. Developer Insights Domain Types
// ---------------------------------------------------------------------------
export type ActivityCategory =
  | 'lesson'
  | 'exercise'
  | 'challenge'
  | 'project'
  | 'ide'
  | 'version'
  | 'testlab'
  | 'architect'
  | 'ai';

export interface ActivityEvent {
  id: string;
  userId: string;
  category: ActivityCategory;
  action: string;
  language?: string;
  technology?: string;
  aiAssisted: boolean;
  durationSeconds?: number;
  scorePct?: number;
  projectId?: string;
  dayKey: string;
  createdAt: unknown;
}

export type SkillEvidenceTier =
  | 'Getting Started'
  | 'Developing'
  | 'Practising'
  | 'Demonstrated Progress';

export interface SkillProgressionItem {
  skill: string;
  tier: SkillEvidenceTier;
  evidenceCount: number;
  completedLessons: number;
  passedChallenges: number;
  projectsCount: number;
  testsPassedCount: number;
  scorePct: number;
}

export interface DeveloperInsightsSnapshot {
  range: '7d' | '30d' | '90d' | 'all';
  totalActions: number;
  independentActions: number;
  aiAssistedActions: number;
  activeDays: number;
  lessonsCompleted: number;
  exercisesCompleted: number;
  challengesAttempted: number;
  challengesPassed: number;
  challengeAccuracyPct: number;
  projectsCreated: number;
  projectsCompleted: number;
  versionSnapshotsCount: number;
  testRunsCount: number;
  testPassRatePct: number;
  architectPlansCount: number;
  aiConversationsCount: number;
  dailySeries: {
    dayKey: string;
    label: string;
    independent: number;
    aiAssisted: number;
    testsRun: number;
  }[];
  languageBreakdown: {
    language: string;
    count: number;
    pct: number;
  }[];
  skills: SkillProgressionItem[];
  recommendations: {
    id: string;
    title: string;
    rationale: string;
    targetView: NavSection;
    ctaLabel: string;
  }[];
}

export type ContributionCategoryFilter =
  | 'all'
  | 'lessons'
  | 'challenges'
  | 'missions'
  | 'projects'
  | 'tests';

export interface ContributionDayBreakdown {
  lessons: number;
  challenges: number;
  missions: number;
  projects: number;
  tests: number;
  ai: number;
}

export interface ContributionDayCell {
  dateKey: string;
  count: number;
  breakdown: ContributionDayBreakdown;
  actions: string[];
  isFuture: boolean;
}

export interface ContributionHeatmapData {
  startDateKey: string;
  endDateKey: string;
  weeks: ContributionDayCell[][];
  monthLabels: { label: string; weekIndex: number }[];
  totalContributions: number;
  activeDays: number;
  currentStreak: number;
  longestStreak: number;
  bestDay: { dateKey: string; count: number } | null;
}

// ---------------------------------------------------------------------------
// 6. MideoCode Project Rescue AI Domain Types
// ---------------------------------------------------------------------------
export type RescueScanMode = 'quick' | 'deep' | 'full' | 'custom';
export type RescueSeverity = 'critical' | 'high' | 'medium' | 'low' | 'suggestion';
export type RescueCertainty = 'confirmed' | 'possible';
export type RescueIssueCategory =
  | 'syntax'
  | 'type'
  | 'runtime'
  | 'import'
  | 'dependency'
  | 'config'
  | 'api_integration'
  | 'database'
  | 'auth'
  | 'security'
  | 'performance'
  | 'architecture'
  | 'documentation';

export type RescueInternalTab =
  | 'overview'
  | 'files'
  | 'intelligence'
  | 'documentation'
  | 'scanner'
  | 'investigate'
  | 'root_cause'
  | 'fixes'
  | 'rescue_mode'
  | 'history'
  | 'chat'
  | 'settings';

export type RescueImportSourceType = 'zip' | 'folder' | 'files' | 'git' | 'workspace';

export interface RescueImportSummary {
  sourceType: RescueImportSourceType;
  projectTitle: string;
  importedCount: number;
  skippedCount: number;
  totalBytes: number;
  languages: Record<string, number>;
  frameworks: string[];
  skippedReasons?: string[];
  branch?: string;
  repoUrl?: string;
}

export interface RescueZipRootCandidate {
  rootPath: string;
  fileCount: number;
  hasConfigFile: boolean;
}

export interface RescueCustomScanConfig {
  checks: RescueIssueCategory[];
  excludedPaths: string[];
}

export type RescueFileRole =
  | 'entry'
  | 'component'
  | 'page'
  | 'route'
  | 'api_client'
  | 'service'
  | 'state'
  | 'database'
  | 'auth'
  | 'config'
  | 'documentation'
  | 'test'
  | 'utility'
  | 'module';

export interface RescueFileSummary {
  fileId?: string;
  path: string;
  language: string;
  role?: RescueFileRole;
  linesCount: number;
  bytes: number;
  imports: string[];
  importedBy: string[];
  exports: string[];
  apiCalls: string[];
  apiRoutes: string[];
}

export interface RescueProjectIndex {
  totalFiles: number;
  inspectedFiles: number;
  skippedFiles: { path: string; reason: string }[];
  languages: Record<string, number>;
  frameworksDetected: string[];
  packageDependencies: string[];
  entryPoints: string[];
  files: RescueFileSummary[];
  circularDependencies: string[][];
  unreferencedFiles: string[];
  apiRouteConnections: {
    frontendFile: string;
    endpoint: string;
    matchedBackendFile?: string;
    status: 'connected' | 'unmatched_endpoint' | 'static_only';
  }[];
}

export interface RescueDocumentationDiscrepancy {
  kind: 'missing_documented_route' | 'missing_script' | 'missing_referenced_file';
  docFile: string;
  target: string;
  details: string;
}

export interface RescueDocumentationReport {
  docFiles: {
    path: string;
    title: string;
    wordCount: number;
    headings: string[];
    excerpt: string;
  }[];
  purposeSummary: string;
  setupInstructions: string[];
  documentedEndpoints: string[];
  referencedPaths: string[];
  discrepancies: RescueDocumentationDiscrepancy[];
}

export interface RescueIssue {
  id: string;
  title: string;
  severity: RescueSeverity;
  certainty: RescueCertainty;
  confidence: number;
  category: RescueIssueCategory;
  filePath: string;
  line?: number;
  column?: number;
  symbolOrSnippet?: string;
  evidenceSource: string;
  summary: string;
  beginnerExplanation: string;
  developerExplanation: string;
  relatedFiles: string[];
  recommendedAction: string;
  learnTopic?: string;
}

export interface RescueRootCauseAnalysis {
  issueId?: string;
  problemTitle: string;
  certainty: RescueCertainty;
  confidence: number;
  whatIsHappening: string;
  confirmedCauses: string[];
  possibleCauses: string[];
  responsibleFile: string;
  affectedFiles: string[];
  whyItOccurred: string;
  safestSolution: string;
  beginnerExplanation: string;
  developerExplanation: string;
  learnKeywords: string[];
  inspectedFilesList: string[];
  unverifiedScopeNotes: string[];
}

export type RescueRiskLevel = 'Low Risk' | 'Moderate Risk' | 'High Risk';

export interface RescueImpactReport {
  dependentFiles: string[];
  affectedFeatures: string[];
  removedOrChangedExports: string[];
  riskLevel?: RescueRiskLevel;
  riskRationale?: string;
  preFlightPassed: boolean;
  preFlightChecks: {
    checkName: string;
    executed: boolean;
    passed: boolean;
    details: string;
  }[];
  potentialConflicts: string[];
}

export interface RescueFixProposal {
  id: string;
  issueId?: string;
  problemIdentified: string;
  fileId?: string;
  filePath: string;
  language: string;
  targetFileHash?: string;
  originalCode: string;
  proposedCode: string;
  explanation: string;
  reason: string;
  potentialSideEffects: string[];
  impact: RescueImpactReport;
  status: 'pending' | 'applied' | 'rejected' | 'rolled_back';
}

export type RescueVerificationStatus =
  | 'VERIFIED'
  | 'PARTIALLY_VERIFIED'
  | 'FAILED'
  | 'NOT_VERIFIED';

export interface RescueVerificationResult {
  passed: boolean;
  verificationStatus?: RescueVerificationStatus;
  summary: string;
  checksExecuted: {
    name: string;
    executed: boolean;
    passed: boolean;
    details: string;
  }[];
  remainingIssuesCount: number;
  newIssuesIntroduced: RescueIssue[];
  testLabSummary?: {
    executed: boolean;
    suiteTitle?: string;
    passedTests?: number;
    totalTests?: number;
    message: string;
  };
}

export interface RescueRuntimeAudit {
  tool: string;
  available: boolean;
  executed: boolean;
  note: string;
}

export interface RescueDismissedIssue {
  issueId: string;
  reason: 'wont_fix' | 'false_positive' | 'deferred' | 'reviewed';
  note?: string;
  dismissedAt: string;
}

export type RescueScanStage =
  | 'Preparing Project'
  | 'Loading File Inventory'
  | 'Inspecting Source Files'
  | 'Reading Documentation'
  | 'Analyzing Dependencies'
  | 'Mapping Project Architecture'
  | 'Running Static Diagnostics'
  | 'Investigating Detected Problems'
  | 'Classifying Issues'
  | 'Generating Scan Report';

export interface RescueScanJob {
  jobId: string;
  userId: string;
  projectId: string;
  projectTitle: string;
  scanMode: RescueScanMode;
  status: 'running' | 'completed' | 'failed' | 'cancelled';
  currentStage: RescueScanStage;
  progressPct: number;
  filesProcessed: number;
  totalFiles: number;
  startedAt: string;
  finishedAt?: string;
  error?: string;
  report?: RescueScanReport;
}

export interface RescueScanReport {
  id: string;
  userId: string;
  projectId: string;
  projectTitle: string;
  scanMode: RescueScanMode;
  healthScore: number;
  filesInspected: number;
  confirmedCount: number;
  potentialCount: number;
  severityCounts: {
    critical: number;
    high: number;
    medium: number;
    low: number;
    suggestion: number;
  };
  summary: string;
  recommendedRepairOrder: string[];
  suggestedImprovements: string[];
  projectIndex: RescueProjectIndex;
  documentationReport?: RescueDocumentationReport;
  issues: RescueIssue[];
  runtimeAudit: RescueRuntimeAudit[];
  reviewedIssueIds?: string[];
  dismissedIssues?: RescueDismissedIssue[];
  excludedPaths?: string[];
  projectFingerprint?: string;
  createdAt: unknown;
}

export interface RescueAppliedFixRecord {
  id: string;
  userId: string;
  projectId: string;
  projectTitle: string;
  filePath: string;
  problemIdentified: string;
  snapshotVersionId: string;
  snapshotVersionNumber: number;
  verificationPassed: boolean;
  verificationStatus?: RescueVerificationStatus;
  verificationSummary: string;
  status: 'applied' | 'rolled_back';
  createdAt: unknown;
}

export interface RescueInvestigationRecord {
  id: string;
  userId: string;
  projectId: string;
  projectTitle: string;
  issueId?: string;
  problemTitle: string;
  responsibleFile: string;
  certainty: RescueCertainty;
  confidence: number;
  expectedBehavior?: string;
  actualBehavior?: string;
  analysis: RescueRootCauseAnalysis;
  status: 'open' | 'fix_proposed' | 'resolved';
  createdAt: unknown;
  updatedAt: unknown;
}

export interface RescueAdminEvent {
  id: string;
  kind: 'failed_import' | 'failed_scan' | 'ai_error' | 'security_event';
  userId?: string;
  projectTitle?: string;
  message: string;
  details?: string;
  createdAt: string;
}

export interface RescueAdminTelemetry {
  activeJobs: RescueScanJob[];
  recentJobs: RescueScanJob[];
  failedImports: RescueAdminEvent[];
  failedScans: RescueAdminEvent[];
  aiErrors: RescueAdminEvent[];
  securityEvents: RescueAdminEvent[];
  generatedAt: string;
}

export interface RescueChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  citedFiles?: string[];
  suggestedTab?: RescueInternalTab;
  createdAt: string;
}

export interface RescueLaunchContext {
  projectId: string;
  initialTab?: RescueInternalTab;
  initialPrompt?: string;
}

// ---------------------------------------------------------------------------
// 7. Real-Time Pair Programming Presence & Chat Types
// ---------------------------------------------------------------------------
export interface PairPresenceMember {
  clientId: string;
  uid: string;
  displayName: string;
  photoURL?: string;
  role: ProjectCollaboratorRole;
  activeFileId?: string;
  activeFileName?: string;
  cursorLine?: number;
  isTyping?: boolean;
  joinedAt: string;
  updatedAt: string;
}

export interface PairChatMessage {
  id: string;
  projectId: string;
  senderId: string;
  senderName: string;
  senderPhotoURL?: string;
  body: string;
  fileRef?: string;
  lineRef?: number;
  collaboratorIds?: string[];
  createdAt: unknown;
}

export interface PairFileSavedNotice {
  projectId: string;
  fileId: string;
  fileName: string;
  version: number;
  updatedByUid: string;
  updatedByName: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// 8. Timed Mock Coding Interview Domain Types
// ---------------------------------------------------------------------------
export interface MockInterviewQuestionTurn {
  id: string;
  role: 'interviewer' | 'candidate';
  content: string;
  topicTag?: string;
  createdAt: string;
}

export interface MockInterviewScorecard {
  overallScore: number;
  correctnessScore: number;
  codeQualityScore: number;
  complexityScore: number;
  communicationScore: number;
  readinessLabel: 'Needs Practice' | 'Developing' | 'Interview Ready' | 'Strong Hire Signal';
  detectedTimeComplexity: string;
  detectedSpaceComplexity: string;
  strengths: string[];
  improvements: string[];
  summaryFeedback: string;
}

export interface MockInterviewSession {
  id: string;
  userId: string;
  careerPathId: string;
  careerPathTitle: string;
  challengeId: string;
  challengeTitle: string;
  difficulty: 'easy' | 'medium' | 'hard';
  language: 'javascript' | 'python';
  durationMinutes: number;
  elapsedSeconds: number;
  status: 'completed' | 'time_expired';
  passedTests: number;
  totalTests: number;
  codeSubmitted: string;
  transcript: MockInterviewQuestionTurn[];
  scorecard: MockInterviewScorecard;
  createdAt: unknown;
}

