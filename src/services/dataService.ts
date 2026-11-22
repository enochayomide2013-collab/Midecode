import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
  serverTimestamp,
  writeBatch,
  increment,
  deleteField,
} from './appDb';
import type { AppUser as User } from './authService';
import { db, auth, handleFirestoreError, OperationType } from './firebase';
import {
  clearPendingRegistrationName,
  clearPendingRegistrationPhone,
  fetchWithAuthAndRetry,
  getCountryInfoFromPhone,
  getPendingRegistrationName,
  getPendingRegistrationPhone,
} from './authService';
import type {
  UserProfile,
  UserRole,
  PublicProfile,
  UserSettings,
  CourseProgress,
  Project,
  ProjectFile,
  ProjectVersion,
  ProjectVersionSnapshot,
  PlaygroundItem,
  ChallengeAttempt,
  CommunityPost,
  CommunityComment,
  BookmarkItem,
  NoteItem,
  NotificationItem,
  AchievementItem,
  AiConversation,
  ModerationReport,
  ExperienceLevel,
  VersionChangeType,
  ActivityCategory,
} from '../types/mideocode';

const utf8Encoder = new TextEncoder();

export function utf8ByteLength(value: string): number {
  return utf8Encoder.encode(value || '').length;
}

export function truncateToUtf8Bytes(value: string, maxBytes: number): string {
  const input = value || '';
  if (maxBytes <= 0 || !input) return '';
  if (utf8ByteLength(input) <= maxBytes) return input;
  // Binary search character boundary so multi-byte UTF-8 never exceeds maxBytes
  let lo = 0;
  let hi = Math.min(input.length, maxBytes);
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (utf8ByteLength(input.slice(0, mid)) <= maxBytes) {
      lo = mid;
    } else {
      hi = mid - 1;
    }
  }
  return input.slice(0, lo);
}

export function buildBoundedVersionSnapshot(
  files: { name: string; folder?: string; language: string; content: string }[],
  maxFiles = 40,
  maxTotalBytes = 480_000,
): ProjectVersionSnapshot[] {
  const capped = files.slice(0, Math.min(50, maxFiles));
  if (capped.length === 0) return [];
  const perFileBudget = Math.max(2048, Math.floor(maxTotalBytes / capped.length));
  const snapshot: ProjectVersionSnapshot[] = [];
  let runningBytes = 0;

  for (const f of capped) {
    const remainingBudget = Math.max(0, maxTotalBytes - runningBytes);
    if (remainingBudget < 512) break;
    const allowedContentBytes = Math.min(18_000, perFileBudget, remainingBudget - 256);
    const safeName = truncateToUtf8Bytes((f.name || 'file.txt').trim() || 'file.txt', 120);
    const safeFolder = truncateToUtf8Bytes((f.folder || '').trim(), 120);
    const safeLang = truncateToUtf8Bytes((f.language || 'text').trim() || 'text', 32);
    const safeContent = truncateToUtf8Bytes(f.content || '', Math.max(0, allowedContentBytes));
    runningBytes +=
      utf8ByteLength(safeName) +
      utf8ByteLength(safeFolder) +
      utf8ByteLength(safeLang) +
      utf8ByteLength(safeContent) +
      96;
    snapshot.push({
      name: safeName,
      folder: safeFolder,
      language: safeLang,
      content: safeContent,
    });
  }
  return snapshot;
}

export function sanitizeForFirestore<T>(value: T): T {
  if (Array.isArray(value)) {
    return value
      .filter((item) => item !== undefined)
      .map((item) => sanitizeForFirestore(item)) as unknown as T;
  }
  if (
    value !== null &&
    typeof value === 'object' &&
    Object.getPrototypeOf(value) === Object.prototype
  ) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (v !== undefined) {
        out[k] = sanitizeForFirestore(v);
      }
    }
    return out as T;
  }
  return value;
}

export function calculateLevelFromXp(xp: number): number {
  return Math.max(1, Math.floor(xp / 250) + 1);
}

export function getTodayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function recordDeveloperActivity(
  uid: string,
  input: {
    category: ActivityCategory;
    action: string;
    language?: string;
    technology?: string;
    aiAssisted?: boolean;
    durationSeconds?: number;
    scorePct?: number;
    projectId?: string;
  },
): Promise<void> {
  if (!uid) return;
  const eventId = `act_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  try {
    const payload = sanitizeForFirestore<Record<string, unknown>>({
      id: eventId,
      userId: uid,
      category: input.category,
      action: input.action.trim().slice(0, 140),
      language: input.language ? input.language.slice(0, 32) : undefined,
      technology: input.technology ? input.technology.slice(0, 64) : undefined,
      aiAssisted: Boolean(input.aiAssisted),
      durationSeconds:
        typeof input.durationSeconds === 'number' && input.durationSeconds >= 0
          ? Math.min(86400, Math.round(input.durationSeconds))
          : undefined,
      scorePct:
        typeof input.scorePct === 'number'
          ? Math.max(0, Math.min(100, Math.round(input.scorePct)))
          : undefined,
      projectId: input.projectId ? input.projectId.slice(0, 128) : undefined,
      dayKey: getTodayKey(),
      createdAt: serverTimestamp(),
    });
    await setDoc(doc(db, 'activityEvents', eventId), payload);
  } catch {
    // Non-blocking activity logging
  }
}

// ---------------------------------------------------------------------------
// User Profiles, Public Profiles & Settings
// ---------------------------------------------------------------------------
const inFlightProfileLoads = new Map<string, Promise<UserProfile>>();

export async function loadOrCreateUserProfile(firebaseUser: User): Promise<UserProfile> {
  const existingLoad = inFlightProfileLoads.get(firebaseUser.uid);
  if (existingLoad) {
    return existingLoad;
  }

  const run = (async (): Promise<UserProfile> => {
    const userRef = doc(db, 'users', firebaseUser.uid);
    try {
      const snap = await getDoc(userRef);
      let resolvedProfile: UserProfile | null = snap.exists() ? (snap.data() as UserProfile) : null;

      const pendingName = getPendingRegistrationName(firebaseUser.uid, firebaseUser.email);
      const pendingPhone = getPendingRegistrationPhone(firebaseUser.uid, firebaseUser.email);
      const rawPreferredName =
        pendingName ||
        firebaseUser.displayName?.trim() ||
        resolvedProfile?.displayName?.trim() ||
        firebaseUser.email?.split('@')[0] ||
        (firebaseUser.phoneNumber ? `Developer ${firebaseUser.phoneNumber.slice(-4)}` : 'MideoCode Learner');
      const preferredDisplayName = truncateToUtf8Bytes(rawPreferredName.trim(), 80) || 'MideoCode Learner';
      const safePhoto = firebaseUser.photoURL?.trim()
        ? truncateToUtf8Bytes(firebaseUser.photoURL.trim(), 500)
        : '';
      const safeEmail = firebaseUser.email?.trim()
        ? truncateToUtf8Bytes(firebaseUser.email.trim(), 254)
        : '';
      const rawPhone = pendingPhone?.phoneNumber?.trim() || firebaseUser.phoneNumber?.trim() || '';
      const safePhone = rawPhone ? truncateToUtf8Bytes(rawPhone, 32) : '';
      const rawCountry =
        pendingPhone?.country?.trim() ||
        (safePhone ? getCountryInfoFromPhone(safePhone)?.name || '' : '');
      const safeCountry = rawCountry ? truncateToUtf8Bytes(rawCountry, 80) : '';

      if (!resolvedProfile) {
        const newProfile: Record<string, unknown> = {
          uid: firebaseUser.uid,
          displayName: preferredDisplayName,
          experienceLevel: 'beginner',
          preferredLanguages: ['JavaScript', 'HTML/CSS'],
          learningGoals: ['Build real-world projects'],
          interests: ['Web Development'],
          onboardingComplete: false,
          xp: 0,
          level: 1,
          streak: 1,
          lastActivityDate: getTodayKey(),
          role: 'member',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        };
        if (safePhoto) newProfile.photoURL = safePhoto;
        if (safeEmail) newProfile.email = safeEmail;
        if (safePhone) newProfile.phoneNumber = safePhone;
        if (safeCountry) newProfile.country = safeCountry;

        await setDoc(userRef, newProfile);
        const createdSnap = await getDoc(userRef);
        resolvedProfile = createdSnap.data() as UserProfile;
      } else {
        const patch: Record<string, unknown> = {};
        if (pendingName) {
          const safePending = truncateToUtf8Bytes(pendingName.trim(), 80);
          if (safePending && resolvedProfile.displayName !== safePending) {
            patch.displayName = safePending;
          }
        }
        if (!resolvedProfile.photoURL && safePhoto) {
          patch.photoURL = safePhoto;
        }
        if (!resolvedProfile.email && safeEmail) {
          patch.email = safeEmail;
        }
        if (!resolvedProfile.phoneNumber && safePhone) {
          patch.phoneNumber = safePhone;
        }
        if (!resolvedProfile.country && safeCountry) {
          patch.country = safeCountry;
        }
        if (Object.keys(patch).length > 0) {
          patch.updatedAt = serverTimestamp();
          await updateDoc(userRef, patch).catch(() => {});
          resolvedProfile = { ...resolvedProfile, ...patch } as UserProfile;
        }
      }

      if (pendingName) {
        clearPendingRegistrationName(firebaseUser.uid, firebaseUser.email);
      }
      if (pendingPhone) {
        clearPendingRegistrationPhone(firebaseUser.uid, firebaseUser.email);
      }

      const displayName =
        truncateToUtf8Bytes((resolvedProfile?.displayName || preferredDisplayName).trim(), 80) ||
        'MideoCode Learner';

      // Mirror non-PII public profile if missing
      const publicRef = doc(db, 'publicProfiles', firebaseUser.uid);
      const publicSnap = await getDoc(publicRef);
      if (!publicSnap.exists()) {
        const publicProfile: Record<string, unknown> = {
          uid: firebaseUser.uid,
          displayName,
          level: resolvedProfile?.level ?? 1,
          xp: resolvedProfile?.xp ?? 0,
          streak: resolvedProfile?.streak ?? 1,
          badgesCount: 0,
          updatedAt: serverTimestamp(),
        };
        const photo = resolvedProfile?.photoURL?.trim() || safePhoto;
        if (photo) publicProfile.photoURL = truncateToUtf8Bytes(photo, 500);
        await setDoc(publicRef, publicProfile);
      } else if (pendingName) {
        const safePending = truncateToUtf8Bytes(pendingName.trim(), 80);
        if (safePending && (publicSnap.data() as { displayName?: string })?.displayName !== safePending) {
          await updateDoc(publicRef, {
            displayName: safePending,
            updatedAt: serverTimestamp(),
          }).catch(() => {});
        }
      }

      // Create default user settings if missing
      const settingsRef = doc(db, 'userSettings', firebaseUser.uid);
      const settingsSnap = await getDoc(settingsRef);
      if (!settingsSnap.exists()) {
        await setDoc(settingsRef, {
          userId: firebaseUser.uid,
          theme: 'dark',
          editorTheme: 'oneDark',
          editorFontSize: 14,
          tabSize: 2,
          autosave: true,
          updatedAt: serverTimestamp(),
        });
      }

      // Welcome notification if missing (non-blocking on brand-new user creation)
      if (!snap.exists()) {
        try {
          const notifId = `welcome_${firebaseUser.uid.slice(0, 20)}`;
          const notifRef = doc(db, 'notifications', notifId);
          const notifSnap = await getDoc(notifRef);
          if (!notifSnap.exists()) {
            await setDoc(notifRef, {
              id: notifId,
              userId: firebaseUser.uid,
              title: 'Welcome to MideoCode',
              body: 'Your workspace, cloud storage, and academy roadmap are ready.',
              linkView: 'academy',
              read: false,
              createdAt: serverTimestamp(),
            });
          }
        } catch {
          // Non-blocking welcome notification
        }
      }

      return resolvedProfile;
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `users/${firebaseUser.uid}`);
    } finally {
      inFlightProfileLoads.delete(firebaseUser.uid);
    }
  })();

  inFlightProfileLoads.set(firebaseUser.uid, run);
  return run;
}

export async function saveOnboardingProfile(
  uid: string,
  payload: {
    displayName: string;
    phoneNumber?: string;
    country?: string;
    photoURL?: string;
    experienceLevel: ExperienceLevel;
    preferredLanguages: string[];
    learningGoals: string[];
    interests: string[];
    hearAboutUs?: string;
    primaryFocus?: string;
    codingCommitment?: string;
    activeCareerPathId?: string;
  },
): Promise<void> {
  const path = `users/${uid}`;
  try {
    const cleanName = truncateToUtf8Bytes(payload.displayName.trim(), 80) || 'Developer';
    const userPatch: Record<string, unknown> = {
      displayName: cleanName,
      experienceLevel: payload.experienceLevel,
      preferredLanguages: payload.preferredLanguages.slice(0, 12),
      learningGoals: payload.learningGoals.slice(0, 12),
      interests: payload.interests.slice(0, 16),
      hearAboutUs: payload.hearAboutUs ? truncateToUtf8Bytes(payload.hearAboutUs.trim(), 100) : '',
      primaryFocus: payload.primaryFocus ? truncateToUtf8Bytes(payload.primaryFocus.trim(), 120) : '',
      codingCommitment: payload.codingCommitment ? truncateToUtf8Bytes(payload.codingCommitment.trim(), 80) : '',
      activeCareerPathId: payload.activeCareerPathId || 'frontend-developer',
      onboardingComplete: true,
      updatedAt: serverTimestamp(),
    };
    if (payload.phoneNumber && payload.phoneNumber.trim()) {
      const cleanPhone = truncateToUtf8Bytes(payload.phoneNumber.trim(), 32);
      userPatch.phoneNumber = cleanPhone;
      const derivedCountry = payload.country?.trim() || getCountryInfoFromPhone(cleanPhone)?.name;
      if (derivedCountry) {
        userPatch.country = truncateToUtf8Bytes(derivedCountry, 80);
      }
    } else if (payload.country && payload.country.trim()) {
      userPatch.country = truncateToUtf8Bytes(payload.country.trim(), 80);
    }
    const publicPatch: Record<string, unknown> = {
      displayName: cleanName,
      updatedAt: serverTimestamp(),
    };
    if (payload.photoURL && payload.photoURL.trim()) {
      const cleanPhoto = truncateToUtf8Bytes(payload.photoURL.trim(), 500);
      userPatch.photoURL = cleanPhoto;
      publicPatch.photoURL = cleanPhoto;
    }
    await updateDoc(doc(db, 'users', uid), userPatch);
    await updateDoc(doc(db, 'publicProfiles', uid), publicPatch);
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function processAndUploadAvatar(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) {
    throw new Error('Please choose a valid image file (PNG, JPG, WebP, or GIF).');
  }
  if (file.size > 10 * 1024 * 1024) {
    throw new Error('Selected image must be smaller than 10 MB.');
  }

  const imageDataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Failed to read selected image file.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Unsupported or corrupted image file.'));
      img.onload = () => {
        const size = 256;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Canvas context unavailable for image resizing.'));
          return;
        }
        const minDim = Math.min(img.width, img.height);
        const sx = (img.width - minDim) / 2;
        const sy = (img.height - minDim) / 2;
        ctx.drawImage(img, sx, sy, minDim, minDim, 0, 0, size, size);
        resolve(canvas.toDataURL('image/jpeg', 0.86));
      };
      img.src = String(reader.result || '');
    };
    reader.readAsDataURL(file);
  });

  const res = await fetchWithAuthAndRetry('/api/profile/avatar', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ imageDataUrl }),
  });
  const data = (await res.json()) as { photoURL?: string; error?: string };
  if (!res.ok || !data.photoURL) {
    throw new Error(data.error || 'Failed to upload profile picture.');
  }
  return data.photoURL;
}

export async function updateUserAvatar(uid: string, photoURL: string | null): Promise<void> {
  const path = `users/${uid}`;
  try {
    const clean = photoURL?.trim().slice(0, 500) || null;
    await updateDoc(doc(db, 'users', uid), {
      photoURL: clean ? clean : deleteField(),
      updatedAt: serverTimestamp(),
    });
    await updateDoc(doc(db, 'publicProfiles', uid), {
      photoURL: clean ? clean : deleteField(),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function updateUserPhoneNumber(
  uid: string,
  phoneNumber: string | null,
  country?: string | null,
): Promise<void> {
  const path = `users/${uid}`;
  try {
    const clean = phoneNumber?.trim().slice(0, 32) || null;
    const cleanCountry = clean
      ? (country?.trim() || getCountryInfoFromPhone(clean)?.name || '').slice(0, 80) || null
      : null;
    await updateDoc(doc(db, 'users', uid), {
      phoneNumber: clean ? clean : deleteField(),
      country: cleanCountry ? cleanCountry : deleteField(),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function getUserSettings(uid: string): Promise<UserSettings | null> {
  const path = `userSettings/${uid}`;
  try {
    const snap = await getDoc(doc(db, 'userSettings', uid));
    return snap.exists() ? (snap.data() as UserSettings) : null;
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, path);
  }
}

export async function saveUserSettings(
  uid: string,
  partial: Partial<Pick<UserSettings, 'theme' | 'editorTheme' | 'editorFontSize' | 'tabSize' | 'autosave'>>,
): Promise<void> {
  const path = `userSettings/${uid}`;
  const ref = doc(db, 'userSettings', uid);
  try {
    const cleanPartial = sanitizeForFirestore(partial);
    const snap = await getDoc(ref);
    if (snap.exists()) {
      await updateDoc(ref, {
        ...cleanPartial,
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(ref, {
        userId: uid,
        theme: 'dark',
        editorTheme: 'oneDark',
        editorFontSize: 14,
        tabSize: 2,
        autosave: true,
        ...cleanPartial,
        updatedAt: serverTimestamp(),
      });
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function listPublicLeaderboard(): Promise<PublicProfile[]> {
  try {
    const q = query(collection(db, 'publicProfiles'), orderBy('xp', 'desc'), limit(20));
    const snap = await getDocs(q);
    return snap.docs.map((d) => d.data() as PublicProfile);
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, 'publicProfiles');
  }
}

// ---------------------------------------------------------------------------
// Verified XP & Achievements (Backed by /api/xp/attest + Idempotent Ledger)
// ---------------------------------------------------------------------------
export async function listUserXpTransactions(
  uid: string,
): Promise<{ id: string; sourceType: string; sourceId: string; amount: number; reason: string }[]> {
  try {
    const q = query(collection(db, 'xpTransactions'), where('userId', '==', uid), limit(100));
    const snap = await getDocs(q);
    return snap.docs.map((d) => d.data() as { id: string; sourceType: string; sourceId: string; amount: number; reason: string });
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, 'xpTransactions');
  }
}

export async function awardVerifiedXp(
  uid: string,
  sourceType: 'lesson' | 'quiz' | 'challenge' | 'project' | 'mission',
  sourceId: string,
  reason: string,
): Promise<{ awarded: number; alreadyClaimed: boolean; newXp: number; newLevel: number }> {
  const cleanSourceId = sourceId.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 60);
  const txId = `${uid.slice(0, 32)}_${sourceType}_${cleanSourceId}`.slice(0, 120);
  const txRef = doc(db, 'xpTransactions', txId);
  const userRef = doc(db, 'users', uid);
  const publicRef = doc(db, 'publicProfiles', uid);

  let userData: UserProfile | undefined;
  let userExists = false;
  let publicExists = false;

  try {
    const [existingTx, userSnap, publicSnap] = await Promise.all([
      getDoc(txRef),
      getDoc(userRef),
      getDoc(publicRef),
    ]);
    userExists = userSnap.exists();
    publicExists = publicSnap.exists();
    userData = userSnap.data() as UserProfile | undefined;
    const currentXp = userData?.xp ?? 0;

    if (existingTx.exists()) {
      return {
        awarded: 0,
        alreadyClaimed: true,
        newXp: currentXp,
        newLevel: calculateLevelFromXp(currentXp),
      };
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, `xpTransactions/${txId}`);
  }

  // Keep backend HTTP attestation outside handleFirestoreError so network/API
  // errors are never misclassified as Firestore permission or write failures.
  let amount = 0;
  try {
    const res = await fetchWithAuthAndRetry('/api/xp/attest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sourceType, sourceId: cleanSourceId }),
    });
    if (!res.ok) {
      let errMsg = 'Failed to verify XP reward on backend.';
      try {
        const errPayload = (await res.json()) as { error?: string };
        if (errPayload?.error) errMsg = errPayload.error;
      } catch {
        // Use fallback error message
      }
      throw new Error(errMsg);
    }
    const attested = (await res.json()) as { amount: number };
    amount = Math.min(250, Math.max(5, Number(attested.amount) || 25));
  } catch (err) {
    if (err instanceof TypeError || (err instanceof Error && /failed to fetch|network/i.test(err.message))) {
      throw new Error('Unable to reach the XP verification server. Please check your connection and try again.');
    }
    throw err instanceof Error ? err : new Error('Failed to verify XP reward on backend.');
  }

  const currentXp = userData?.xp ?? 0;
  const currentLevel = userData?.level ?? 1;
  const newXp = currentXp + amount;
  const newLevel = Math.min(500, Math.min(currentLevel + 2, Math.max(currentLevel, calculateLevelFromXp(newXp))));
  const today = getTodayKey();
  const prevDate = userData?.lastActivityDate;
  let newStreak = userData?.streak ?? 1;
  if (prevDate && prevDate !== today) {
    const diffDays = Math.round((new Date(today).getTime() - new Date(prevDate).getTime()) / 86_400_000);
    newStreak = diffDays === 1 ? newStreak + 1 : Math.max(1, newStreak);
  }

  try {
    const batch = writeBatch(db);
    batch.set(txRef, {
      id: txId,
      userId: uid,
      sourceType,
      sourceId: cleanSourceId,
      amount,
      reason: (reason || 'XP Reward').slice(0, 160),
      createdAt: serverTimestamp(),
    });
    if (userExists) {
      batch.update(userRef, {
        xp: newXp,
        level: newLevel,
        streak: newStreak,
        lastActivityDate: today,
        updatedAt: serverTimestamp(),
      });
    }
    if (publicExists) {
      batch.update(publicRef, {
        xp: newXp,
        level: newLevel,
        streak: newStreak,
        updatedAt: serverTimestamp(),
      });
    } else {
      const publicDoc: Record<string, unknown> = {
        uid,
        displayName: (userData?.displayName || 'MideoCode Learner').slice(0, 80),
        level: newLevel,
        xp: newXp,
        streak: newStreak,
        badgesCount: 0,
        updatedAt: serverTimestamp(),
      };
      if (userData?.photoURL) {
        publicDoc.photoURL = userData.photoURL.slice(0, 500);
      }
      batch.set(publicRef, publicDoc);
    }
    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `xpTransactions/${txId}`);
  }

  // Unlock milestone achievements cleanly without jeopardizing XP commit
  try {
    await checkAndUnlockAchievement(uid, sourceType, newXp);
  } catch {
    // Non-blocking achievement check
  }

  return { awarded: amount, alreadyClaimed: false, newXp, newLevel };
}

async function checkAndUnlockAchievement(
  uid: string,
  sourceType: string,
  totalXp: number,
): Promise<void> {
  const candidates: { badgeId: string; title: string; condition: boolean }[] = [
    { badgeId: 'first_lesson', title: 'First Concept Mastered', condition: sourceType === 'lesson' },
    { badgeId: 'challenge_solver', title: 'Algorithm Problem Solver', condition: sourceType === 'challenge' },
    { badgeId: 'project_builder', title: 'Project Shipper', condition: sourceType === 'project' },
    { badgeId: 'xp_250', title: 'Level 2 Engineer (250 XP)', condition: totalXp >= 250 },
    { badgeId: 'xp_500', title: '500 XP Milestone', condition: totalXp >= 500 },
  ];

  for (const item of candidates) {
    if (!item.condition) continue;
    const achId = `${uid.slice(0, 40)}_${item.badgeId}`.slice(0, 120);
    const achRef = doc(db, 'achievements', achId);
    try {
      const snap = await getDoc(achRef);
      if (!snap.exists()) {
        await setDoc(achRef, {
          id: achId,
          userId: uid,
          badgeId: item.badgeId,
          title: item.title,
          unlockedAt: serverTimestamp(),
        });
        const publicRef = doc(db, 'publicProfiles', uid);
        const publicSnap = await getDoc(publicRef);
        if (publicSnap.exists()) {
          await updateDoc(publicRef, {
            badgesCount: increment(1),
            updatedAt: serverTimestamp(),
          });
        }
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `achievements/${achId}`);
    }
  }
}

export async function unlockCustomAchievement(
  uid: string,
  badgeId: string,
  title: string,
): Promise<boolean> {
  const cleanBadge = badgeId.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64);
  const achId = `${uid.slice(0, 40)}_${cleanBadge}`.slice(0, 120);
  const achRef = doc(db, 'achievements', achId);
  try {
    const snap = await getDoc(achRef);
    if (snap.exists()) return false;
    await setDoc(achRef, {
      id: achId,
      userId: uid,
      badgeId: cleanBadge,
      title: title.slice(0, 120),
      unlockedAt: serverTimestamp(),
    });
    const publicRef = doc(db, 'publicProfiles', uid);
    const publicSnap = await getDoc(publicRef);
    if (publicSnap.exists()) {
      await updateDoc(publicRef, {
        badgesCount: increment(1),
        updatedAt: serverTimestamp(),
      });
    }
    return true;
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `achievements/${achId}`);
  }
}

export async function listUserAchievements(uid: string): Promise<AchievementItem[]> {
  try {
    const q = query(collection(db, 'achievements'), where('userId', '==', uid));
    const snap = await getDocs(q);
    return snap.docs.map((d) => d.data() as AchievementItem);
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, 'achievements');
  }
}

// ---------------------------------------------------------------------------
// Academy Progress, Bookmarks, Notes
// ---------------------------------------------------------------------------
export async function listCourseProgress(uid: string): Promise<Record<string, CourseProgress>> {
  const path = `userProgress/${uid}/courses`;
  try {
    const snap = await getDocs(collection(db, 'userProgress', uid, 'courses'));
    const map: Record<string, CourseProgress> = {};
    snap.docs.forEach((d) => {
      const item = d.data() as CourseProgress;
      map[item.courseId] = item;
    });
    return map;
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, path);
  }
}

export async function saveCourseProgress(
  uid: string,
  progress: Omit<CourseProgress, 'userId' | 'updatedAt'>,
): Promise<void> {
  const path = `userProgress/${uid}/courses/${progress.courseId}`;
  try {
    const ref = doc(db, 'userProgress', uid, 'courses', progress.courseId);
    const snap = await getDoc(ref);
    const payload = {
      userId: uid,
      courseId: progress.courseId,
      completedLessonIds: progress.completedLessonIds,
      completedExerciseIds: progress.completedExerciseIds,
      quizScores: progress.quizScores,
      lastLessonId: progress.lastLessonId || '',
      progressPercent: progress.progressPercent,
      updatedAt: serverTimestamp(),
    };
    if (snap.exists()) {
      await updateDoc(ref, {
        completedLessonIds: payload.completedLessonIds,
        completedExerciseIds: payload.completedExerciseIds,
        quizScores: payload.quizScores,
        lastLessonId: payload.lastLessonId,
        progressPercent: payload.progressPercent,
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(ref, payload);
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function listBookmarks(uid: string): Promise<BookmarkItem[]> {
  try {
    const q = query(collection(db, 'bookmarks'), where('userId', '==', uid));
    const snap = await getDocs(q);
    return snap.docs.map((d) => d.data() as BookmarkItem);
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, 'bookmarks');
  }
}

export async function toggleBookmark(
  uid: string,
  targetType: 'lesson' | 'doc' | 'post' | 'project' | 'mission',
  targetId: string,
  title: string,
): Promise<boolean> {
  const cleanTarget = targetId.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 60);
  const id = `${uid.slice(0, 32)}_${targetType}_${cleanTarget}`.slice(0, 120);
  const ref = doc(db, 'bookmarks', id);
  try {
    const snap = await getDoc(ref);
    if (snap.exists()) {
      await deleteDoc(ref);
      return false;
    }
    await setDoc(ref, {
      id,
      userId: uid,
      targetType,
      targetId: targetId.slice(0, 128),
      title: title.slice(0, 160),
      createdAt: serverTimestamp(),
    });
    return true;
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `bookmarks/${id}`);
  }
}

export async function listNotes(uid: string): Promise<NoteItem[]> {
  try {
    const q = query(collection(db, 'notes'), where('userId', '==', uid));
    const snap = await getDocs(q);
    return snap.docs.map((d) => d.data() as NoteItem);
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, 'notes');
  }
}

export async function saveNote(
  uid: string,
  input: { id?: string; courseId?: string; lessonId?: string; title: string; content: string },
): Promise<NoteItem> {
  const id = input.id || `note_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const ref = doc(db, 'notes', id);
  try {
    const snap = await getDoc(ref);
    if (snap.exists()) {
      await updateDoc(ref, {
        title: input.title.trim().slice(0, 160) || 'Untitled Note',
        content: input.content.slice(0, 10000),
        updatedAt: serverTimestamp(),
      });
    } else {
      const payload: Record<string, unknown> = {
        id,
        userId: uid,
        title: input.title.trim().slice(0, 160) || 'Untitled Note',
        content: input.content.slice(0, 10000),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      if (input.courseId) payload.courseId = input.courseId.slice(0, 80);
      if (input.lessonId) payload.lessonId = input.lessonId.slice(0, 80);
      await setDoc(ref, payload);
    }
    const fresh = await getDoc(ref);
    return fresh.data() as NoteItem;
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `notes/${id}`);
  }
}

export async function deleteNote(noteId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'notes', noteId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `notes/${noteId}`);
  }
}

// ---------------------------------------------------------------------------
// Projects, Files & Cloud Version History
// ---------------------------------------------------------------------------
export async function listUserProjects(uid: string): Promise<Project[]> {
  try {
    const q = query(collection(db, 'projects'), where('ownerId', '==', uid));
    const snap = await getDocs(q);
    return snap.docs.map((d) => d.data() as Project);
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, 'projects');
  }
}

export async function listSharedProjects(uid: string): Promise<Project[]> {
  try {
    const q = query(collection(db, 'projects'), where('collaboratorIds', 'array-contains', uid), limit(30));
    const snap = await getDocs(q);
    return snap.docs.map((d) => d.data() as Project);
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, 'projects');
  }
}

export async function listPublicProjects(): Promise<Project[]> {
  try {
    const q = query(collection(db, 'projects'), where('visibility', '==', 'public'), limit(24));
    const snap = await getDocs(q);
    return snap.docs.map((d) => d.data() as Project);
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, 'projects');
  }
}

export async function createProjectWithFiles(
  uid: string,
  ownerName: string,
  input: {
    title: string;
    description: string;
    language: Project['language'];
    guidedProjectId?: string;
    architectureId?: string;
    files: { name: string; folder: string; language: string; content: string }[];
  },
): Promise<{ project: Project; files: ProjectFile[] }> {
  const projectId = `proj_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const safeOwnerName = truncateToUtf8Bytes((ownerName || '').trim() || 'Developer', 80) || 'Developer';

  const normalizedFiles = input.files.slice(0, 80).map((f) => ({
    name: truncateToUtf8Bytes((f.name || 'file.txt').trim() || 'file.txt', 120),
    folder: truncateToUtf8Bytes((f.folder || '').trim(), 120),
    language: truncateToUtf8Bytes((f.language || 'javascript').trim() || 'javascript', 32),
    content: truncateToUtf8Bytes(f.content || '', 145_000),
  }));

  const rawBytes = normalizedFiles.reduce((acc, f) => acc + utf8ByteLength(f.content), 0);
  const totalBytes = Math.max(0, Math.min(5_000_000, rawBytes));

  const projectPayload: Record<string, unknown> = {
    id: projectId,
    ownerId: uid,
    ownerName: safeOwnerName,
    title: truncateToUtf8Bytes(input.title.trim() || 'Untitled Workspace', 120) || 'Untitled Workspace',
    description: truncateToUtf8Bytes(input.description.trim(), 1000),
    language: input.language,
    visibility: 'private',
    isPortfolio: false,
    milestonesCompleted: [],
    status: 'active',
    version: 1,
    storageBytes: totalBytes,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  if (input.guidedProjectId) {
    projectPayload.guidedProjectId = truncateToUtf8Bytes(input.guidedProjectId, 80);
  }
  if (input.architectureId) {
    projectPayload.architectureId = truncateToUtf8Bytes(input.architectureId, 128);
  }

  try {
    await setDoc(doc(db, 'projects', projectId), projectPayload);

    const createdFiles: ProjectFile[] = [];
    for (let i = 0; i < normalizedFiles.length; i++) {
      const f = normalizedFiles[i];
      const fileId = `file_${Date.now()}_${i}_${Math.random().toString(36).slice(2, 6)}`;
      const fileDoc = {
        id: fileId,
        projectId,
        ownerId: uid,
        name: f.name,
        folder: f.folder,
        language: f.language,
        visibility: 'private' as const,
        content: f.content,
        updatedAt: serverTimestamp(),
      };
      await setDoc(doc(db, 'projects', projectId, 'files', fileId), fileDoc);
      createdFiles.push(fileDoc as unknown as ProjectFile);
    }

    // Create initial bounded version snapshot v1 (strictly < 1 MiB Firestore doc cap)
    const vId = `v1_${Date.now()}`;
    await setDoc(doc(db, 'projects', projectId, 'versions', vId), {
      id: vId,
      projectId,
      ownerId: uid,
      versionNumber: 1,
      label: 'Initial workspace snapshot',
      authorId: uid,
      authorName: safeOwnerName,
      changeType: input.architectureId ? 'ai_build' : 'manual',
      changedFiles: normalizedFiles.map((f) => (f.folder ? `${f.folder}/${f.name}` : f.name)).slice(0, 50),
      filesCount: normalizedFiles.length,
      snapshot: buildBoundedVersionSnapshot(normalizedFiles),
      createdAt: serverTimestamp(),
    });

    await recordDeveloperActivity(uid, {
      category: 'project',
      action: `Created project "${truncateToUtf8Bytes(input.title, 80)}"`,
      language: input.language,
      aiAssisted: Boolean(input.architectureId),
      projectId,
    });

    const projectSnap = await getDoc(doc(db, 'projects', projectId));
    const filesSnap = await getDocs(
      query(collection(db, 'projects', projectId, 'files'), where('ownerId', '==', uid)),
    );
    return {
      project: projectSnap.data() as Project,
      files: filesSnap.docs.map((d) => d.data() as ProjectFile),
    };
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `projects/${projectId}`);
  }
}

export async function getProjectFiles(projectId: string): Promise<ProjectFile[]> {
  try {
    const filesCol = collection(db, 'projects', projectId, 'files');
    const uid = auth.currentUser?.uid;
    if (!uid) {
      const pubSnap = await getDocs(query(filesCol, where('visibility', '==', 'public')));
      return pubSnap.docs.map((d) => d.data() as ProjectFile);
    }

    const [ownedSnap, collabSnap, publicSnap] = await Promise.all([
      getDocs(query(filesCol, where('ownerId', '==', uid))),
      getDocs(query(filesCol, where('collaboratorIds', 'array-contains', uid))),
      getDocs(query(filesCol, where('visibility', '==', 'public'))),
    ]);

    const byId = new Map<string, ProjectFile>();
    for (const d of ownedSnap.docs) byId.set(d.id, d.data() as ProjectFile);
    for (const d of collabSnap.docs) byId.set(d.id, d.data() as ProjectFile);
    for (const d of publicSnap.docs) byId.set(d.id, d.data() as ProjectFile);
    return Array.from(byId.values());
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, `projects/${projectId}/files`);
  }
}

export async function saveProjectFileContent(
  projectId: string,
  fileId: string,
  content: string,
  expectedProjectVersion: number,
  allFilesTotalBytes: number,
  editorMeta?: { uid: string; name: string },
): Promise<{
  conflict: boolean;
  serverVersion: number;
  newVersion: number;
  lastEditedByName?: string;
  serverFileContent?: string;
}> {
  try {
    const projRef = doc(db, 'projects', projectId);
    const projSnap = await getDoc(projRef);
    const serverProject = projSnap.data() as Project | undefined;
    if (!serverProject) {
      throw new Error('Project not found in cloud.');
    }
    if (serverProject.version > expectedProjectVersion) {
      const serverFileSnap = await getDoc(doc(db, 'projects', projectId, 'files', fileId));
      const serverFile = serverFileSnap.data() as ProjectFile | undefined;
      return {
        conflict: true,
        serverVersion: serverProject.version,
        newVersion: serverProject.version,
        lastEditedByName: serverProject.lastEditedByName || serverProject.ownerName,
        serverFileContent: serverFile?.content,
      };
    }
    const fileUpdate: Record<string, unknown> = {
      content: content.slice(0, 150000),
      updatedAt: serverTimestamp(),
    };
    if (editorMeta) {
      fileUpdate.lastEditedByUid = editorMeta.uid;
      fileUpdate.lastEditedByName = editorMeta.name.slice(0, 80);
    }
    await updateDoc(doc(db, 'projects', projectId, 'files', fileId), fileUpdate);

    const newVersion = serverProject.version + 1;
    const projUpdate: Record<string, unknown> = {
      version: newVersion,
      storageBytes: allFilesTotalBytes,
      updatedAt: serverTimestamp(),
    };
    if (editorMeta) {
      projUpdate.lastEditedByUid = editorMeta.uid;
      projUpdate.lastEditedByName = editorMeta.name.slice(0, 80);
    }
    await updateDoc(projRef, projUpdate);
    return { conflict: false, serverVersion: newVersion, newVersion };
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `projects/${projectId}/files/${fileId}`);
  }
}

export async function forceOverwriteProjectFile(
  projectId: string,
  fileId: string,
  content: string,
  serverVersion: number,
  allFilesTotalBytes: number,
  editorMeta?: { uid: string; name: string },
): Promise<number> {
  try {
    const projSnap = await getDoc(doc(db, 'projects', projectId));
    const currentProj = projSnap.data() as Project | undefined;
    const baseVersion = Math.max(serverVersion, currentProj?.version ?? 1);
    const newVersion = Math.min(10000, baseVersion + 1);
    const safeBytes = Math.max(0, Math.min(5_000_000, Math.round(allFilesTotalBytes)));

    const filePatch: Record<string, unknown> = {
      content: truncateToUtf8Bytes(content, 145_000),
      updatedAt: serverTimestamp(),
    };
    if (editorMeta) {
      filePatch.lastEditedByUid = editorMeta.uid;
      filePatch.lastEditedByName = truncateToUtf8Bytes((editorMeta.name || '').trim() || 'Developer', 80);
    }
    await updateDoc(doc(db, 'projects', projectId, 'files', fileId), filePatch);
    const projPatch: Record<string, unknown> = {
      version: newVersion,
      storageBytes: safeBytes,
      updatedAt: serverTimestamp(),
    };
    if (editorMeta) {
      projPatch.lastEditedByUid = editorMeta.uid;
      projPatch.lastEditedByName = truncateToUtf8Bytes((editorMeta.name || '').trim() || 'Developer', 80);
    }
    await updateDoc(doc(db, 'projects', projectId), projPatch);
    return newVersion;
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `projects/${projectId}/files/${fileId}`);
  }
}

export async function addProjectFile(
  uid: string,
  projectId: string,
  file: { name: string; folder: string; language: string; content: string; visibility: 'private' | 'public' },
): Promise<ProjectFile> {
  const fileId = `file_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const ref = doc(db, 'projects', projectId, 'files', fileId);
  try {
    const projSnap = await getDoc(doc(db, 'projects', projectId));
    const proj = projSnap.data() as Project | undefined;
    const ownerId = proj?.ownerId || uid;
    const payload = sanitizeForFirestore<Record<string, unknown>>({
      id: fileId,
      projectId,
      ownerId,
      name: truncateToUtf8Bytes(file.name.trim() || 'file.txt', 120),
      folder: truncateToUtf8Bytes(file.folder.trim(), 120),
      language: truncateToUtf8Bytes(file.language.trim() || 'javascript', 32),
      visibility: file.visibility,
      content: truncateToUtf8Bytes(file.content, 145_000),
      collaboratorIds: proj?.collaboratorIds && proj.collaboratorIds.length > 0 ? proj.collaboratorIds : undefined,
      lastEditedByUid: uid,
      updatedAt: serverTimestamp(),
    });
    await setDoc(ref, payload);
    const snap = await getDoc(ref);
    return snap.data() as ProjectFile;
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `projects/${projectId}/files/${fileId}`);
  }
}

export async function mergeImportedFilesIntoProject(
  uid: string,
  editorName: string,
  projectId: string,
  existingFiles: ProjectFile[],
  incomingFiles: { name: string; folder: string; language: string; content: string }[],
): Promise<{
  files: ProjectFile[];
  addedCount: number;
  updatedCount: number;
  skippedForLimitCount: number;
}> {
  try {
    const projSnap = await getDoc(doc(db, 'projects', projectId));
    const proj = projSnap.data() as Project | undefined;
    if (!proj) {
      throw new Error('Selected project could not be found.');
    }

    const getRelPath = (f: { folder?: string; name: string }) => {
      const cleanFolder = (f.folder || '').replace(/^\/+|\/+$/g, '');
      return cleanFolder ? `${cleanFolder}/${f.name}` : f.name;
    };

    const byPath = new Map<string, ProjectFile>();
    for (const f of existingFiles) {
      byPath.set(getRelPath(f), f);
    }

    let runningBytes = existingFiles.reduce((s, f) => s + utf8ByteLength(f.content || ''), 0);
    let currentFileCount = existingFiles.length;
    let addedCount = 0;
    let updatedCount = 0;
    let skippedForLimitCount = 0;
    const safeEditorName = truncateToUtf8Bytes((editorName || '').trim() || 'Developer', 80) || 'Developer';

    for (let i = 0; i < incomingFiles.length; i++) {
      const item = incomingFiles[i];
      const safeName = truncateToUtf8Bytes((item.name || 'file.txt').trim() || 'file.txt', 120);
      const safeFolder = truncateToUtf8Bytes((item.folder || '').trim(), 120);
      const safeLang = truncateToUtf8Bytes((item.language || 'javascript').trim() || 'javascript', 32);
      const safeContent = truncateToUtf8Bytes(item.content || '', 145_000);
      const rel = safeFolder ? `${safeFolder}/${safeName}` : safeName;
      const existing = byPath.get(rel);
      const nextBytes = utf8ByteLength(safeContent);

      if (existing) {
        const delta = nextBytes - utf8ByteLength(existing.content || '');
        if (runningBytes + delta > 4_800_000) {
          skippedForLimitCount++;
          continue;
        }
        await updateDoc(doc(db, 'projects', projectId, 'files', existing.id), {
          content: safeContent,
          language: safeLang,
          lastEditedByUid: uid,
          lastEditedByName: safeEditorName,
          updatedAt: serverTimestamp(),
        });
        runningBytes += delta;
        updatedCount++;
      } else {
        if (currentFileCount >= 90 || runningBytes + nextBytes > 4_800_000) {
          skippedForLimitCount++;
          continue;
        }
        const fileId = `file_${Date.now()}_${i}_${Math.random().toString(36).slice(2, 6)}`;
        const payload = sanitizeForFirestore<Record<string, unknown>>({
          id: fileId,
          projectId,
          ownerId: proj.ownerId,
          name: safeName,
          folder: safeFolder,
          language: safeLang,
          visibility: proj.visibility,
          content: safeContent,
          collaboratorIds:
            proj.collaboratorIds && proj.collaboratorIds.length > 0 ? proj.collaboratorIds : undefined,
          lastEditedByUid: uid,
          lastEditedByName: safeEditorName,
          updatedAt: serverTimestamp(),
        });
        await setDoc(doc(db, 'projects', projectId, 'files', fileId), payload);
        runningBytes += nextBytes;
        currentFileCount++;
        addedCount++;
      }
    }

    const freshFiles = await getProjectFiles(projectId);
    const totalBytes = Math.min(
      5_000_000,
      freshFiles.reduce((s, f) => s + utf8ByteLength(f.content || ''), 0),
    );
    const nextVersion = Math.min(10000, (proj.version || 1) + 1);

    await updateDoc(doc(db, 'projects', projectId), {
      version: nextVersion,
      storageBytes: totalBytes,
      lastEditedByUid: uid,
      lastEditedByName: safeEditorName,
      updatedAt: serverTimestamp(),
    });

    await recordDeveloperActivity(uid, {
      category: 'project',
      action: `Imported ${addedCount + updatedCount} file(s) into "${proj.title}"`,
      language: proj.language,
      aiAssisted: false,
      projectId,
    });

    return { files: freshFiles, addedCount, updatedCount, skippedForLimitCount };
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `projects/${projectId}/files`);
  }
}

export async function renameProjectFile(
  projectId: string,
  fileId: string,
  newName: string,
  nextFolder?: string,
): Promise<void> {
  try {
    const patch: Record<string, unknown> = {
      name: newName.trim().slice(0, 120),
      updatedAt: serverTimestamp(),
    };
    if (nextFolder !== undefined) {
      patch.folder = nextFolder.trim().slice(0, 120);
    }
    await updateDoc(doc(db, 'projects', projectId, 'files', fileId), patch);
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `projects/${projectId}/files/${fileId}`);
  }
}

export async function deleteProjectFile(projectId: string, fileId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'projects', projectId, 'files', fileId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `projects/${projectId}/files/${fileId}`);
  }
}

export async function updateProjectMeta(
  projectId: string,
  patch: Partial<
    Pick<
      Project,
      'title' | 'description' | 'visibility' | 'isPortfolio' | 'milestonesCompleted' | 'status' | 'architectureId'
    >
  >,
  filesForVisibilitySync?: ProjectFile[],
): Promise<void> {
  try {
    await updateDoc(doc(db, 'projects', projectId), {
      ...patch,
      updatedAt: serverTimestamp(),
    });
    if (patch.visibility && filesForVisibilitySync) {
      for (const f of filesForVisibilitySync) {
        await updateDoc(doc(db, 'projects', projectId, 'files', f.id), {
          visibility: patch.visibility,
          updatedAt: serverTimestamp(),
        });
      }
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `projects/${projectId}`);
  }
}

export async function createProjectVersionSnapshot(
  uid: string,
  projectId: string,
  versionNumber: number,
  label: string,
  files: ProjectFile[],
  options?: {
    ownerId?: string;
    authorName?: string;
    description?: string;
    changeType?: VersionChangeType;
    aiOperation?: string;
    changedFiles?: string[];
    parentVersionId?: string;
    collaboratorIds?: string[];
  },
): Promise<ProjectVersion> {
  const versionId = `ver_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const ref = doc(db, 'projects', projectId, 'versions', versionId);
  try {
    const snapshot = buildBoundedVersionSnapshot(files);
    const safeVersionNum = Math.max(1, Math.min(10000, Math.round(versionNumber)));
    const payload = sanitizeForFirestore<Record<string, unknown>>({
      id: versionId,
      projectId,
      ownerId: options?.ownerId || uid,
      versionNumber: safeVersionNum,
      label: truncateToUtf8Bytes(label.trim() || `Snapshot v${safeVersionNum}`, 120) || `Snapshot v${safeVersionNum}`,
      description: options?.description?.trim()
        ? truncateToUtf8Bytes(options.description.trim(), 500)
        : undefined,
      authorId: uid,
      authorName: options?.authorName ? truncateToUtf8Bytes(options.authorName, 80) : undefined,
      changeType: options?.changeType || 'manual',
      aiOperation: options?.aiOperation ? truncateToUtf8Bytes(options.aiOperation, 240) : undefined,
      changedFiles: options?.changedFiles?.slice(0, 50) || undefined,
      parentVersionId: options?.parentVersionId?.slice(0, 128) || undefined,
      collaboratorIds:
        options?.collaboratorIds && options.collaboratorIds.length > 0
          ? options.collaboratorIds
          : undefined,
      filesCount: Math.min(100, files.length),
      snapshot,
      createdAt: serverTimestamp(),
    });
    await setDoc(ref, payload);
    await recordDeveloperActivity(uid, {
      category: 'version',
      action: `Created snapshot "${truncateToUtf8Bytes(label.trim(), 60)}"`,
      aiAssisted: options?.changeType === 'ai_build' || options?.changeType === 'ai_fix',
      projectId,
    });
    const snap = await getDoc(ref);
    return snap.data() as ProjectVersion;
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `projects/${projectId}/versions/${versionId}`);
  }
}

export async function listProjectVersions(projectId: string): Promise<ProjectVersion[]> {
  try {
    const uid = auth.currentUser?.uid;
    if (!uid) return [];
    const versionsCol = collection(db, 'projects', projectId, 'versions');
    const [ownedSnap, collabSnap] = await Promise.all([
      getDocs(query(versionsCol, where('ownerId', '==', uid))),
      getDocs(query(versionsCol, where('collaboratorIds', 'array-contains', uid))),
    ]);
    const byId = new Map<string, ProjectVersion>();
    for (const d of ownedSnap.docs) byId.set(d.id, d.data() as ProjectVersion);
    for (const d of collabSnap.docs) byId.set(d.id, d.data() as ProjectVersion);
    return Array.from(byId.values()).sort((a, b) => (b.versionNumber || 0) - (a.versionNumber || 0));
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, `projects/${projectId}/versions`);
  }
}

export async function restoreProjectVersionSnapshot(
  uid: string,
  projectId: string,
  version: ProjectVersion,
  currentFiles: ProjectFile[],
  options?: {
    preserveCurrentState?: boolean;
    selectedPaths?: string[];
    authorName?: string;
  },
): Promise<ProjectFile[]> {
  try {
    const projSnap = await getDoc(doc(db, 'projects', projectId));
    const proj = projSnap.data() as Project | undefined;
    const visibility = proj?.visibility ?? 'private';
    const ownerId = proj?.ownerId || uid;
    const collaboratorIds = proj?.collaboratorIds;
    const currentVersionNum = proj?.version ?? 1;

    // Auto-preserve current state before destructive restore
    if (options?.preserveCurrentState !== false && currentFiles.length > 0) {
      await createProjectVersionSnapshot(
        uid,
        projectId,
        currentVersionNum,
        `Pre-restore backup (before v${version.versionNumber})`,
        currentFiles,
        {
          ownerId,
          authorName: options?.authorName,
          changeType: 'autosave',
          description: `Automatic safety snapshot created before restoring "${version.label}".`,
          collaboratorIds,
        },
      );
    }

    const getPath = (f: { folder?: string; name: string }) => (f.folder ? `${f.folder}/${f.name}` : f.name);
    const selectiveSet = options?.selectedPaths && options.selectedPaths.length > 0
      ? new Set(options.selectedPaths)
      : null;

    if (selectiveSet) {
      // Partial / file-level restore: replace only selected file paths
      for (const item of version.snapshot) {
        const p = getPath(item);
        if (!selectiveSet.has(p)) continue;
        const existingMatch = currentFiles.find((f) => getPath(f) === p);
        if (existingMatch) {
          await updateDoc(doc(db, 'projects', projectId, 'files', existingMatch.id), {
            content: item.content,
            language: item.language,
            lastEditedByUid: uid,
            lastEditedByName: options?.authorName || 'Restore',
            updatedAt: serverTimestamp(),
          });
        } else {
          const fileId = `restored_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
          await setDoc(
            doc(db, 'projects', projectId, 'files', fileId),
            sanitizeForFirestore({
              id: fileId,
              projectId,
              ownerId,
              name: item.name,
              folder: item.folder,
              language: item.language,
              visibility,
              content: item.content,
              collaboratorIds: collaboratorIds && collaboratorIds.length > 0 ? collaboratorIds : undefined,
              lastEditedByUid: uid,
              lastEditedByName: options?.authorName,
              updatedAt: serverTimestamp(),
            }),
          );
        }
      }
    } else {
      // Full snapshot restore
      for (const f of currentFiles) {
        await deleteDoc(doc(db, 'projects', projectId, 'files', f.id));
      }
      for (let i = 0; i < version.snapshot.length; i++) {
        const item = version.snapshot[i];
        const fileId = `restored_${Date.now()}_${i}`;
        await setDoc(
          doc(db, 'projects', projectId, 'files', fileId),
          sanitizeForFirestore({
            id: fileId,
            projectId,
            ownerId,
            name: item.name,
            folder: item.folder,
            language: item.language,
            visibility,
            content: item.content,
            collaboratorIds: collaboratorIds && collaboratorIds.length > 0 ? collaboratorIds : undefined,
            lastEditedByUid: uid,
            lastEditedByName: options?.authorName,
            updatedAt: serverTimestamp(),
          }),
        );
      }
    }

    const freshFiles = await getProjectFiles(projectId);
    const totalBytes = Math.min(
      5_000_000,
      freshFiles.reduce((s, f) => s + utf8ByteLength(f.content || ''), 0),
    );
    const nextVersion = Math.min(10000, currentVersionNum + 1);
    const safeAuthorName = truncateToUtf8Bytes((options?.authorName || '').trim() || 'Restore', 80) || 'Restore';

    await updateDoc(doc(db, 'projects', projectId), {
      version: nextVersion,
      storageBytes: totalBytes,
      lastEditedByUid: uid,
      lastEditedByName: safeAuthorName,
      updatedAt: serverTimestamp(),
    });

    await createProjectVersionSnapshot(
      uid,
      projectId,
      nextVersion,
      truncateToUtf8Bytes(`Restored from v${version.versionNumber}: ${version.label}`, 120),
      freshFiles,
      {
        ownerId,
        authorName: safeAuthorName,
        changeType: 'restore',
        parentVersionId: version.id,
        changedFiles: selectiveSet ? Array.from(selectiveSet) : freshFiles.map(getPath),
        collaboratorIds,
      },
    );

    return freshFiles;
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `projects/${projectId}/versions`);
  }
}

// ---------------------------------------------------------------------------
// Playgrounds
// ---------------------------------------------------------------------------
export async function listUserPlaygrounds(uid: string): Promise<PlaygroundItem[]> {
  try {
    const q = query(collection(db, 'playgrounds'), where('ownerId', '==', uid));
    const snap = await getDocs(q);
    return snap.docs.map((d) => d.data() as PlaygroundItem);
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, 'playgrounds');
  }
}

export async function listPublicPlaygrounds(): Promise<PlaygroundItem[]> {
  try {
    const q = query(collection(db, 'playgrounds'), where('visibility', '==', 'public'), limit(20));
    const snap = await getDocs(q);
    return snap.docs.map((d) => d.data() as PlaygroundItem);
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, 'playgrounds');
  }
}

export async function savePlayground(
  uid: string,
  ownerName: string,
  input: {
    id?: string;
    title: string;
    templateId: string;
    html: string;
    css: string;
    js: string;
    visibility: 'private' | 'public';
    forkedFrom?: string;
  },
): Promise<PlaygroundItem> {
  const id = input.id || `pg_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const ref = doc(db, 'playgrounds', id);
  try {
    const snap = await getDoc(ref);
    if (snap.exists()) {
      await updateDoc(ref, {
        title: input.title.trim().slice(0, 120),
        html: input.html.slice(0, 100000),
        css: input.css.slice(0, 100000),
        js: input.js.slice(0, 100000),
        visibility: input.visibility,
        updatedAt: serverTimestamp(),
      });
    } else {
      const payload: Record<string, unknown> = {
        id,
        ownerId: uid,
        ownerName: ownerName.slice(0, 80),
        title: input.title.trim().slice(0, 120),
        templateId: input.templateId.slice(0, 64),
        html: input.html.slice(0, 100000),
        css: input.css.slice(0, 100000),
        js: input.js.slice(0, 100000),
        visibility: input.visibility,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      if (input.forkedFrom) payload.forkedFrom = input.forkedFrom.slice(0, 128);
      await setDoc(ref, payload);
    }
    const fresh = await getDoc(ref);
    return fresh.data() as PlaygroundItem;
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `playgrounds/${id}`);
  }
}

// ---------------------------------------------------------------------------
// Challenges
// ---------------------------------------------------------------------------
export async function saveChallengeAttempt(
  uid: string,
  attempt: Omit<ChallengeAttempt, 'id' | 'userId' | 'createdAt'>,
): Promise<ChallengeAttempt> {
  const id = `att_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const ref = doc(db, 'challengeAttempts', id);
  try {
    await setDoc(ref, {
      id,
      userId: uid,
      challengeId: attempt.challengeId,
      language: attempt.language,
      code: attempt.code.slice(0, 50000),
      passed: attempt.passed,
      passedCount: attempt.passedCount,
      totalCount: attempt.totalCount,
      executionMs: attempt.executionMs,
      createdAt: serverTimestamp(),
    });
    const fresh = await getDoc(ref);
    return fresh.data() as ChallengeAttempt;
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `challengeAttempts/${id}`);
  }
}

export async function listChallengeAttempts(uid: string): Promise<ChallengeAttempt[]> {
  try {
    const q = query(collection(db, 'challengeAttempts'), where('userId', '==', uid), limit(50));
    const snap = await getDocs(q);
    return snap.docs.map((d) => d.data() as ChallengeAttempt);
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, 'challengeAttempts');
  }
}

// ---------------------------------------------------------------------------
// Community & Moderation
// ---------------------------------------------------------------------------
export async function listCommunityPosts(): Promise<CommunityPost[]> {
  try {
    const q = query(collection(db, 'communityPosts'), where('visibility', '==', 'public'), limit(40));
    const snap = await getDocs(q);
    return snap.docs.map((d) => d.data() as CommunityPost);
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, 'communityPosts');
  }
}

export async function createCommunityPost(
  uid: string,
  authorName: string,
  input: {
    title: string;
    body: string;
    category: CommunityPost['category'];
    tags: string[];
    codeSnippet?: string;
    authorRole?: UserRole;
    imageUrls?: string[];
    videoUrl?: string;
    videoName?: string;
    videoMimeType?: string;
    videoSizeBytes?: number;
  },
): Promise<CommunityPost> {
  const id = `post_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const ref = doc(db, 'communityPosts', id);
  try {
    const payload: Record<string, unknown> = {
      id,
      authorId: uid,
      authorName: authorName.slice(0, 80),
      title: input.title.trim().slice(0, 180),
      body: input.body.trim().slice(0, 12000),
      category: input.category,
      tags: input.tags.slice(0, 8),
      visibility: 'public',
      likesCount: 0,
      commentsCount: 0,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    if (input.authorRole) {
      payload.authorRole = input.authorRole;
    }
    if (input.codeSnippet?.trim()) {
      payload.codeSnippet = input.codeSnippet.slice(0, 8000);
    }
    const cleanImages = (input.imageUrls || [])
      .filter((u): u is string => typeof u === 'string' && u.trim().length > 0)
      .map((u) => u.trim().slice(0, 300))
      .slice(0, 6);
    if (cleanImages.length > 0) {
      payload.imageUrls = cleanImages;
    }
    if (input.videoUrl?.trim()) {
      payload.videoUrl = input.videoUrl.trim().slice(0, 300);
      if (input.videoName?.trim()) {
        payload.videoName = input.videoName.trim().slice(0, 160);
      }
      if (input.videoMimeType?.trim()) {
        payload.videoMimeType = input.videoMimeType.trim().slice(0, 80);
      }
      if (
        typeof input.videoSizeBytes === 'number' &&
        Number.isFinite(input.videoSizeBytes) &&
        input.videoSizeBytes >= 1_000_000 &&
        input.videoSizeBytes <= 83_886_080
      ) {
        payload.videoSizeBytes = Math.round(input.videoSizeBytes);
      }
    }
    await setDoc(ref, sanitizeForFirestore(payload));
    const snap = await getDoc(ref);
    return snap.data() as CommunityPost;
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `communityPosts/${id}`);
  }
}

export async function likeCommunityPost(postId: string, currentLikes: number): Promise<void> {
  try {
    await updateDoc(doc(db, 'communityPosts', postId), {
      likesCount: currentLikes + 1,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `communityPosts/${postId}`);
  }
}

export async function listPostComments(postId: string): Promise<CommunityComment[]> {
  try {
    const q = query(collection(db, 'communityPosts', postId, 'comments'), where('postId', '==', postId));
    const snap = await getDocs(q);
    return snap.docs.map((d) => d.data() as CommunityComment);
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, `communityPosts/${postId}/comments`);
  }
}

export async function addPostComment(
  uid: string,
  authorName: string,
  postId: string,
  body: string,
  currentCommentsCount: number,
  authorRole?: UserRole,
): Promise<CommunityComment> {
  const commentId = `cmt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const commentRef = doc(db, 'communityPosts', postId, 'comments', commentId);
  try {
    const commentDoc: Record<string, unknown> = {
      id: commentId,
      postId,
      authorId: uid,
      authorName: authorName.slice(0, 80),
      body: body.trim().slice(0, 4000),
      createdAt: serverTimestamp(),
    };
    if (authorRole) {
      commentDoc.authorRole = authorRole;
    }
    await setDoc(commentRef, sanitizeForFirestore(commentDoc));
    await updateDoc(doc(db, 'communityPosts', postId), {
      commentsCount: currentCommentsCount + 1,
      updatedAt: serverTimestamp(),
    });
    const snap = await getDoc(commentRef);
    return snap.data() as CommunityComment;
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `communityPosts/${postId}/comments/${commentId}`);
  }
}

export async function submitModerationReport(
  uid: string,
  targetType: 'post' | 'comment' | 'user',
  targetId: string,
  reason: ModerationReport['reason'],
  details: string,
): Promise<void> {
  const id = `rep_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  try {
    await setDoc(doc(db, 'reports', id), {
      id,
      reporterId: uid,
      targetType,
      targetId: targetId.slice(0, 128),
      reason,
      details: details.trim().slice(0, 1000),
      status: 'open',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `reports/${id}`);
  }
}

// ---------------------------------------------------------------------------
// Career Progress, AI Conversations, Notifications, Admin
// ---------------------------------------------------------------------------
export async function getCareerProgress(uid: string): Promise<{
  selectedPathId: string;
  completedSkillIds: string[];
  completedProjectIds: string[];
} | null> {
  try {
    const snap = await getDoc(doc(db, 'userCareerProgress', uid));
    return snap.exists()
      ? (snap.data() as { selectedPathId: string; completedSkillIds: string[]; completedProjectIds: string[] })
      : null;
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, `userCareerProgress/${uid}`);
  }
}

export async function saveCareerProgress(
  uid: string,
  data: { selectedPathId: string; completedSkillIds: string[]; completedProjectIds: string[] },
): Promise<void> {
  const ref = doc(db, 'userCareerProgress', uid);
  try {
    const snap = await getDoc(ref);
    if (snap.exists()) {
      await updateDoc(ref, {
        selectedPathId: data.selectedPathId,
        completedSkillIds: data.completedSkillIds.slice(0, 100),
        completedProjectIds: data.completedProjectIds.slice(0, 100),
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(ref, {
        userId: uid,
        selectedPathId: data.selectedPathId,
        completedSkillIds: data.completedSkillIds.slice(0, 100),
        completedProjectIds: data.completedProjectIds.slice(0, 100),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `userCareerProgress/${uid}`);
  }
}

export async function listAiConversations(uid: string): Promise<AiConversation[]> {
  try {
    const q = query(collection(db, 'aiConversations'), where('userId', '==', uid), limit(25));
    const snap = await getDocs(q);
    return snap.docs.map((d) => d.data() as AiConversation);
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, 'aiConversations');
  }
}

export async function saveAiConversation(
  uid: string,
  conv: Omit<AiConversation, 'userId' | 'createdAt' | 'updatedAt'>,
): Promise<void> {
  const convId = String(conv.id || `conv_${Date.now()}`).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 120);
  const ref = doc(db, 'aiConversations', convId);
  const validModes = ['learn', 'debug', 'explain', 'practice', 'build', 'review'] as const;
  const safeMode = validModes.includes(conv.mode) ? conv.mode : 'learn';
  const sanitizedMessages = (conv.messages || []).map((m) => {
    const msg: Record<string, unknown> = {
      id: m.id || `m_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: typeof m.content === 'string' ? m.content : String(m.content || ''),
      createdAt: m.createdAt || new Date().toISOString(),
    };
    if (m.proposedCode && typeof m.proposedCode === 'object') {
      const pc = m.proposedCode as { filename?: string; language?: string; code?: string };
      msg.proposedCode = {
        filename: typeof pc.filename === 'string' && pc.filename ? pc.filename : 'solution.js',
        language: typeof pc.language === 'string' && pc.language ? pc.language : 'javascript',
        code: typeof pc.code === 'string' ? pc.code : String(pc.code || ''),
      };
    }
    return msg;
  });

  const payload = sanitizeForFirestore<Record<string, unknown>>({
    id: convId,
    userId: uid,
    title: (conv.title || 'AI Chat').trim().slice(0, 140) || 'AI Chat',
    mode: safeMode,
    messages: sanitizedMessages.slice(-100),
    updatedAt: serverTimestamp(),
  });

  try {
    const snap = await getDoc(ref);
    if (snap.exists()) {
      await updateDoc(ref, {
        title: payload.title,
        mode: payload.mode,
        messages: payload.messages,
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(ref, {
        ...payload,
        createdAt: serverTimestamp(),
      });
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `aiConversations/${convId}`);
  }
}

export async function deleteAiConversation(conversationId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'aiConversations', conversationId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `aiConversations/${conversationId}`);
  }
}

export async function listNotifications(uid: string): Promise<NotificationItem[]> {
  try {
    const q = query(collection(db, 'notifications'), where('userId', '==', uid), limit(25));
    const snap = await getDocs(q);
    return snap.docs.map((d) => d.data() as NotificationItem);
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, 'notifications');
  }
}

export async function markNotificationRead(id: string): Promise<void> {
  try {
    await updateDoc(doc(db, 'notifications', id), { read: true });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `notifications/${id}`);
  }
}

// Admin operations (protected by Firestore rules isAdmin())
export async function adminListUsers(): Promise<UserProfile[]> {
  try {
    const q = query(collection(db, 'users'), limit(200));
    const snap = await getDocs(q);
    const toMs = (val: unknown): number => {
      if (!val) return 0;
      if (typeof val === 'object' && val !== null && 'toMillis' in val && typeof (val as { toMillis: () => number }).toMillis === 'function') {
        return (val as { toMillis: () => number }).toMillis();
      }
      if (typeof val === 'string' || typeof val === 'number') {
        const parsed = new Date(val).getTime();
        return Number.isFinite(parsed) ? parsed : 0;
      }
      return 0;
    };
    return snap.docs
      .map((d) => d.data() as UserProfile)
      .sort((a, b) => (toMs(b.updatedAt) || toMs(b.createdAt)) - (toMs(a.updatedAt) || toMs(a.createdAt)));
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, 'users');
  }
}

export async function adminListReports(): Promise<ModerationReport[]> {
  try {
    const q = query(collection(db, 'reports'), limit(50));
    const snap = await getDocs(q);
    return snap.docs.map((d) => d.data() as ModerationReport);
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, 'reports');
  }
}

export async function adminResolveReport(
  adminId: string,
  reportId: string,
  status: ModerationReport['status'],
  hideTargetPostId?: string,
): Promise<void> {
  try {
    await updateDoc(doc(db, 'reports', reportId), {
      status,
      updatedAt: serverTimestamp(),
    });
    if (hideTargetPostId) {
      await updateDoc(doc(db, 'communityPosts', hideTargetPostId), {
        visibility: 'hidden',
        updatedAt: serverTimestamp(),
      });
    }
    const logId = `audit_${Date.now()}`;
    await setDoc(doc(db, 'adminAuditLogs', logId), {
      id: logId,
      adminId,
      action: `report_${status}`,
      targetPath: `reports/${reportId}`,
      createdAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `reports/${reportId}`);
  }
}

export async function adminSendCommunityAnnouncement(
  adminId: string,
  authorName: string,
  input: {
    title: string;
    body: string;
    category?: CommunityPost['category'];
    tags?: string[];
    codeSnippet?: string;
    imageUrls?: string[];
    videoUrl?: string;
    videoName?: string;
    videoMimeType?: string;
    videoSizeBytes?: number;
  },
): Promise<CommunityPost> {
  const post = await createCommunityPost(adminId, authorName || 'MideoCode Admin', {
    title: input.title,
    body: input.body,
    category: input.category || 'announcement',
    tags: input.tags && input.tags.length > 0 ? input.tags : ['announcement', 'official'],
    codeSnippet: input.codeSnippet,
    authorRole: 'admin',
    imageUrls: input.imageUrls,
    videoUrl: input.videoUrl,
    videoName: input.videoName,
    videoMimeType: input.videoMimeType,
    videoSizeBytes: input.videoSizeBytes,
  });
  try {
    const logId = `audit_announce_${Date.now()}`;
    await setDoc(doc(db, 'adminAuditLogs', logId), {
      id: logId,
      adminId,
      action: input.category && input.category !== 'announcement' ? `community_post_${input.category}` : 'community_announcement',
      targetPath: `communityPosts/${post.id}`,
      createdAt: serverTimestamp(),
    });
  } catch {
    // Non-blocking audit log write
  }
  return post;
}
