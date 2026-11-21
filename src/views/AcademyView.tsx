import { useEffect, useState } from 'react';
import {
  BookOpen,
  Bookmark,
  CheckCircle2,
  Code2,
  FlaskConical,
  FileText,
  Sparkles,
  Terminal,
  Trash2,
} from 'lucide-react';
import { useMideo } from '../context/MideoContext';
import { ACADEMY_COURSES } from '../data/academyData';
import {
  saveCourseProgress,
  toggleBookmark,
  listNotes,
  saveNote,
  deleteNote,
} from '../services/dataService';
import { extractReadableError } from '../services/firebase';
import type { NoteItem } from '../types/mideocode';

export function AcademyView() {
  const {
    firebaseUser,
    courseProgress,
    bookmarks,
    selectedCourseId,
    selectedLessonId,
    openCourse,
    openInIde,
    askAi,
    openDoc,
    openLab,
    grantXp,
    refreshUserData,
    notify,
  } = useMideo();

  const [categoryFilter, setCategoryFilter] = useState<string>('All');
  const [exerciseCode, setExerciseCode] = useState('');
  const [exerciseFeedback, setExerciseFeedback] = useState<{ ok: boolean; msg: string } | null>(null);
  const [quizAnswers, setQuizAnswers] = useState<Record<string, number>>({});
  const [quizSubmitted, setQuizSubmitted] = useState(false);

  const [notes, setNotes] = useState<NoteItem[]>([]);
  const [noteTitle, setNoteTitle] = useState('');
  const [noteBody, setNoteBody] = useState('');
  const [savingNote, setSavingNote] = useState(false);

  const course = ACADEMY_COURSES.find((c) => c.id === selectedCourseId) || ACADEMY_COURSES[0];
  const allLessons = course.modules.flatMap((m) => m.lessons);
  const lesson = allLessons.find((l) => l.id === selectedLessonId) || allLessons[0];
  const progress = courseProgress[course.id];

  useEffect(() => {
    setExerciseCode(lesson.exercise.starterCode);
    setExerciseFeedback(null);
    setQuizAnswers({});
    setQuizSubmitted(false);
  }, [lesson.id, lesson.exercise.starterCode]);

  useEffect(() => {
    if (!firebaseUser) return;
    listNotes(firebaseUser.uid)
      .then((all) => setNotes(all.filter((n) => n.lessonId === lesson.id)))
      .catch(() => {});
  }, [firebaseUser, lesson.id]);

  const categories = ['All', 'Web Development', 'Programming Languages', 'Databases', 'Development Tools', 'Computer Science'];
  const filteredCourses =
    categoryFilter === 'All'
      ? ACADEMY_COURSES
      : ACADEMY_COURSES.filter((c) => c.category === categoryFilter);

  const isLessonComplete = progress?.completedLessonIds.includes(lesson.id) ?? false;
  const isExerciseComplete = progress?.completedExerciseIds.includes(lesson.exercise.id) ?? false;
  const isBookmarked = bookmarks.some((b) => b.targetType === 'lesson' && b.targetId === lesson.id);

  const handleMarkLessonComplete = async () => {
    if (!firebaseUser) return;
    try {
      const prevLessons = progress?.completedLessonIds || [];
      const nextLessons = prevLessons.includes(lesson.id) ? prevLessons : [...prevLessons, lesson.id];
      const pct = Math.round((nextLessons.length / allLessons.length) * 100);
      await saveCourseProgress(firebaseUser.uid, {
        courseId: course.id,
        completedLessonIds: nextLessons,
        completedExerciseIds: progress?.completedExerciseIds || [],
        quizScores: progress?.quizScores || {},
        lastLessonId: lesson.id,
        progressPercent: pct,
      });
      await grantXp('lesson', lesson.id, `Completed lesson: ${lesson.title}`);
      await refreshUserData();
    } catch (err) {
      notify('error', extractReadableError(err, 'Unable to save lesson completion.'));
    }
  };

  const handleCheckExercise = async () => {
    const trimmed = exerciseCode.trim();
    if (!trimmed) {
      setExerciseFeedback({ ok: false, msg: 'Please write your solution before checking.' });
      return;
    }
    if (!trimmed.includes(lesson.exercise.expectedOutputIncludes)) {
      setExerciseFeedback({
        ok: false,
        msg: `Not quite yet. Hint: ${lesson.exercise.hint}`,
      });
      return;
    }
    setExerciseFeedback({ ok: true, msg: 'Exercise criteria verified! Progress recorded.' });
    if (firebaseUser) {
      try {
        const prevEx = progress?.completedExerciseIds || [];
        const nextEx = prevEx.includes(lesson.exercise.id) ? prevEx : [...prevEx, lesson.exercise.id];
        const prevLessons = progress?.completedLessonIds || [];
        const nextLessons = prevLessons.includes(lesson.id) ? prevLessons : [...prevLessons, lesson.id];
        await saveCourseProgress(firebaseUser.uid, {
          courseId: course.id,
          completedLessonIds: nextLessons,
          completedExerciseIds: nextEx,
          quizScores: progress?.quizScores || {},
          lastLessonId: lesson.id,
          progressPercent: Math.round((nextLessons.length / allLessons.length) * 100),
        });
        await grantXp('lesson', `ex_${lesson.exercise.id}`, `Solved exercise: ${lesson.exercise.title}`);
        await refreshUserData();
      } catch (err) {
        notify('error', extractReadableError(err, 'Unable to record exercise progress.'));
      }
    }
  };

  const handleSubmitQuiz = async () => {
    setQuizSubmitted(true);
    const total = lesson.quiz.length;
    const correct = lesson.quiz.filter((q) => quizAnswers[q.id] === q.correctIndex).length;
    const scorePct = Math.round((correct / total) * 100);
    if (firebaseUser) {
      try {
        const nextScores = { ...(progress?.quizScores || {}), [lesson.id]: scorePct };
        await saveCourseProgress(firebaseUser.uid, {
          courseId: course.id,
          completedLessonIds: progress?.completedLessonIds || [],
          completedExerciseIds: progress?.completedExerciseIds || [],
          quizScores: nextScores,
          lastLessonId: lesson.id,
          progressPercent: progress?.progressPercent || 0,
        });
        if (scorePct === 100) {
          await grantXp('quiz', lesson.id, `100% Quiz score on ${lesson.title}`);
        } else {
          notify('info', `Quiz scored ${scorePct}%. Review explanations below and retry for XP.`);
        }
        await refreshUserData();
      } catch (err) {
        notify('error', extractReadableError(err, 'Unable to save quiz result.'));
      }
    }
  };

  const handleToggleBookmark = async () => {
    if (!firebaseUser) return;
    try {
      const added = await toggleBookmark(firebaseUser.uid, 'lesson', lesson.id, `${course.title}: ${lesson.title}`);
      await refreshUserData();
      notify('info', added ? 'Lesson bookmarked.' : 'Bookmark removed.');
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Unable to update bookmark.');
    }
  };

  const handleSaveNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firebaseUser || !noteBody.trim()) return;
    setSavingNote(true);
    try {
      const saved = await saveNote(firebaseUser.uid, {
        courseId: course.id,
        lessonId: lesson.id,
        title: noteTitle.trim() || lesson.title,
        content: noteBody.trim(),
      });
      setNotes((prev) => [saved, ...prev]);
      setNoteTitle('');
      setNoteBody('');
      notify('success', 'Study note saved to your account.');
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Unable to save study note.');
    } finally {
      setSavingNote(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Course Catalog Filter Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Mideo Academy</h1>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Structured courses connected directly to Mideo IDE, Lab, Docs, and Mideo AI.
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setCategoryFilter(cat)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
                categoryFilter === cat
                  ? 'bg-blue-600 text-white'
                  : 'border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Course Selector Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {filteredCourses.map((c) => {
          const pct = courseProgress[c.id]?.progressPercent ?? 0;
          const active = c.id === course.id;
          return (
            <button
              key={c.id}
              onClick={() => openCourse(c.id)}
              className={`p-5 rounded-xl border text-left transition-colors cursor-pointer ${
                active
                  ? 'border-blue-600 bg-blue-600/5 dark:bg-blue-950/25'
                  : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1322] hover:border-slate-400'
              }`}
            >
              <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 mb-1.5">
                <span>{c.language} · {c.difficulty}</span>
                <span className="font-mono tabular-nums">{pct}%</span>
              </div>
              <h2 className="text-sm font-semibold text-slate-900 dark:text-white">{c.title}</h2>
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 line-clamp-2">{c.overview}</p>
            </button>
          );
        })}
      </div>

      {/* Active Course & Lesson Workspace */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Course Outline Sidebar */}
        <aside className="lg:col-span-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1322] p-5 space-y-5">
          <div>
            <p className="text-xs font-medium text-blue-600 dark:text-blue-400">{course.category}</p>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white mt-1">{course.title}</h2>
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-2 leading-relaxed">{course.overview}</p>
          </div>

          <div className="text-xs space-y-1.5 border-t border-slate-200 dark:border-slate-800 pt-4">
            <p className="font-semibold text-slate-900 dark:text-white">Learning Objectives</p>
            <ul className="space-y-1 text-slate-600 dark:text-slate-400 list-disc pl-4">
              {course.objectives.map((obj, idx) => (
                <li key={idx}>{obj}</li>
              ))}
            </ul>
          </div>

          <div className="space-y-3 border-t border-slate-200 dark:border-slate-800 pt-4">
            {course.modules.map((mod) => (
              <div key={mod.id}>
                <h3 className="text-xs font-semibold text-slate-900 dark:text-white mb-2">{mod.title}</h3>
                <div className="space-y-1">
                  {mod.lessons.map((l) => {
                    const done = progress?.completedLessonIds.includes(l.id);
                    const isCurrent = l.id === lesson.id;
                    return (
                      <button
                        key={l.id}
                        onClick={() => openCourse(course.id, l.id)}
                        className={`w-full px-3 py-2 rounded-lg text-left text-xs flex items-center justify-between gap-2 transition-colors cursor-pointer ${
                          isCurrent
                            ? 'bg-blue-600 text-white font-medium'
                            : 'hover:bg-slate-100 dark:hover:bg-slate-800/70 text-slate-700 dark:text-slate-300'
                        }`}
                      >
                        <span className="truncate">{l.title}</span>
                        {done && <CheckCircle2 className={`w-3.5 h-3.5 shrink-0 ${isCurrent ? 'text-white' : 'text-emerald-500'}`} />}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </aside>

        {/* Main Lesson Reader & Interactive Tools */}
        <div className="lg:col-span-8 space-y-6">
          <article className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1322] p-6 sm:p-8 space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
              <div>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {course.language} · {lesson.durationMinutes} min read
                </p>
                <h2 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white mt-1">
                  {lesson.title}
                </h2>
                <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">{lesson.summary}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={handleToggleBookmark}
                  className={`px-3 py-2 rounded-lg border text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer ${
                    isBookmarked
                      ? 'border-blue-600 bg-blue-600/10 text-blue-600 dark:text-blue-400'
                      : 'border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                  }`}
                >
                  <Bookmark className="w-3.5 h-3.5" />
                  {isBookmarked ? 'Bookmarked' : 'Bookmark'}
                </button>
                <button
                  onClick={handleMarkLessonComplete}
                  className={`px-3.5 py-2 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer ${
                    isLessonComplete
                      ? 'bg-emerald-600 text-white'
                      : 'bg-blue-600 hover:bg-blue-700 text-white'
                  }`}
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  {isLessonComplete ? 'Completed' : 'Mark Complete'}
                </button>
              </div>
            </div>

            {/* Concept Explanation */}
            <div className="space-y-3 text-sm text-slate-700 dark:text-slate-300 leading-relaxed max-w-[70ch]">
              {lesson.explanation.map((p, idx) => (
                <p key={idx}>{p}</p>
              ))}
            </div>

            {/* Code Example + Cross-System Bridge Actions */}
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
              <div className="px-4 py-2.5 bg-slate-100 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-mono text-slate-600 dark:text-slate-300">
                  {lesson.codeExample.filename}
                </span>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={() =>
                      openInIde({
                        title: `${lesson.title} Example`,
                        language:
                          lesson.codeExample.language === 'python'
                            ? 'python'
                            : lesson.codeExample.language === 'html'
                              ? 'web'
                              : 'javascript',
                        files: [
                          {
                            name: lesson.codeExample.filename,
                            folder: '',
                            language: lesson.codeExample.language,
                            content: lesson.codeExample.code,
                          },
                        ],
                      })
                    }
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium cursor-pointer"
                  >
                    <Code2 className="w-3.5 h-3.5" />
                    Open in Mideo IDE
                  </button>
                  <button
                    onClick={() =>
                      askAi({
                        mode: 'explain',
                        prompt: `Explain this ${lesson.codeExample.language} example from "${lesson.title}" step by step.`,
                        context: {
                          courseTitle: course.title,
                          lessonTitle: lesson.title,
                          language: lesson.codeExample.language,
                          selectedCode: lesson.codeExample.code,
                        },
                      })
                    }
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded border border-slate-300 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-800 text-xs font-medium cursor-pointer"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-violet-500" />
                    Ask Mideo AI
                  </button>
                  {lesson.labToolId && (
                    <button
                      onClick={() => openLab(lesson.labToolId!)}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded border border-slate-300 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-800 text-xs font-medium cursor-pointer"
                    >
                      <FlaskConical className="w-3.5 h-3.5 text-blue-500" />
                      Try in Lab
                    </button>
                  )}
                  {lesson.relatedDocId && (
                    <button
                      onClick={() => openDoc(lesson.relatedDocId!)}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded border border-slate-300 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-800 text-xs font-medium cursor-pointer"
                    >
                      <FileText className="w-3.5 h-3.5" />
                      Docs
                    </button>
                  )}
                </div>
              </div>
              <pre className="p-4 bg-[#0B1020] text-slate-100 text-xs font-mono overflow-x-auto leading-relaxed">
                <code>{lesson.codeExample.code}</code>
              </pre>
              <div className="px-4 py-2.5 bg-slate-50 dark:bg-slate-900/60 border-t border-slate-200 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-400">
                <strong className="text-slate-800 dark:text-slate-200">Expected Output: </strong>
                <span className="font-mono">{lesson.codeExample.expectedOutput}</span>
              </div>
            </div>

            {/* Common Mistakes */}
            <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/40">
              <h3 className="text-xs font-semibold text-slate-900 dark:text-white mb-2">Common Mistakes to Avoid</h3>
              <ul className="space-y-1 text-xs text-slate-600 dark:text-slate-400 list-disc pl-4">
                {lesson.commonMistakes.map((m, i) => (
                  <li key={i}>{m}</li>
                ))}
              </ul>
            </div>

            {/* Interactive Exercise */}
            <div className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Terminal className="w-4 h-4 text-blue-500" />
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                    Exercise: {lesson.exercise.title}
                  </h3>
                </div>
                {isExerciseComplete && (
                  <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">Verified</span>
                )}
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-400">{lesson.exercise.prompt}</p>
              <textarea
                rows={4}
                value={exerciseCode}
                onChange={(e) => setExerciseCode(e.target.value)}
                className="w-full p-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-[#0B1020] text-slate-100 font-mono text-xs focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
              <div className="flex items-center justify-between gap-3">
                <button
                  onClick={handleCheckExercise}
                  className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold cursor-pointer"
                >
                  Check Exercise
                </button>
                {exerciseFeedback && (
                  <span className={`text-xs ${exerciseFeedback.ok ? 'text-emerald-500' : 'text-amber-500'}`}>
                    {exerciseFeedback.msg}
                  </span>
                )}
              </div>
            </div>

            {/* Module Quiz */}
            <div className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 space-y-4">
              <div className="flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-violet-500" />
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Knowledge Check</h3>
              </div>
              {lesson.quiz.map((q) => (
                <div key={q.id} className="space-y-2">
                  <p className="text-xs font-medium text-slate-900 dark:text-white">{q.prompt}</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {q.options.map((opt, idx) => {
                      const picked = quizAnswers[q.id] === idx;
                      const isCorrect = idx === q.correctIndex;
                      return (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => {
                            setQuizAnswers((prev) => ({ ...prev, [q.id]: idx }));
                            setQuizSubmitted(false);
                          }}
                          className={`p-2.5 rounded-lg border text-left text-xs transition-colors cursor-pointer ${
                            quizSubmitted
                              ? isCorrect
                                ? 'border-emerald-500 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300'
                                : picked
                                  ? 'border-red-500 bg-red-500/10 text-red-600 dark:text-red-300'
                                  : 'border-slate-200 dark:border-slate-800'
                              : picked
                                ? 'border-blue-600 bg-blue-600/10 text-blue-600 dark:text-blue-300'
                                : 'border-slate-200 dark:border-slate-800 hover:border-slate-400'
                          }`}
                        >
                          {opt}
                        </button>
                      );
                    })}
                  </div>
                  {quizSubmitted && (
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">{q.explanation}</p>
                  )}
                </div>
              ))}
              <button
                onClick={handleSubmitQuiz}
                className="px-4 py-2 rounded-lg bg-slate-900 dark:bg-slate-800 hover:bg-blue-600 text-white text-xs font-semibold cursor-pointer"
              >
                Submit Quiz Answers
              </button>
            </div>
          </article>

          {/* Personal Lesson Notes (Persisted in Firestore) */}
          <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1322] p-6 space-y-4">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
              Personal Study Notes for "{lesson.title}"
            </h3>
            <form onSubmit={handleSaveNote} className="space-y-3">
              <input
                type="text"
                value={noteTitle}
                onChange={(e) => setNoteTitle(e.target.value)}
                placeholder="Note title (optional)"
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-xs"
              />
              <textarea
                rows={3}
                required
                value={noteBody}
                onChange={(e) => setNoteBody(e.target.value)}
                placeholder="Write key takeaways or questions..."
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-xs"
              />
              <button
                type="submit"
                disabled={savingNote}
                className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold cursor-pointer"
              >
                Save Note
              </button>
            </form>

            {notes.length > 0 && (
              <div className="divide-y divide-slate-200 dark:divide-slate-800 pt-2">
                {notes.map((n) => (
                  <div key={n.id} className="py-3 flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold text-slate-900 dark:text-white">{n.title}</p>
                      <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 whitespace-pre-wrap">{n.content}</p>
                    </div>
                    <button
                      onClick={async () => {
                        try {
                          await deleteNote(n.id);
                          setNotes((prev) => prev.filter((x) => x.id !== n.id));
                          notify('info', 'Note deleted.');
                        } catch (err) {
                          notify('error', err instanceof Error ? err.message : 'Unable to delete note.');
                        }
                      }}
                      aria-label="Delete note"
                      className="p-1.5 text-slate-400 hover:text-red-500 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
