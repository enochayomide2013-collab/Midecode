/**
 * MideoCode Firestore Rules Verification Suite (Phase 0 TDD)
 * Covers the Dirty Dozen security invariants against firestore.rules.
 */
export interface SecurityTestCase {
  id: string;
  name: string;
  collectionPath: string;
  operation: 'get' | 'list' | 'create' | 'update' | 'delete';
  expected: 'PERMISSION_DENIED' | 'ALLOWED';
  rationale: string;
}

export const DIRTY_DOZEN_SPECS: SecurityTestCase[] = [
  {
    id: 'DD-01',
    name: 'Unauthenticated Profile Read',
    collectionPath: 'users/user_1',
    operation: 'get',
    expected: 'PERMISSION_DENIED',
    rationale: 'request.auth == null fails isOwner(userId) and isAdmin().',
  },
  {
    id: 'DD-02',
    name: 'Cross-User PII Read',
    collectionPath: 'users/user_1',
    operation: 'get',
    expected: 'PERMISSION_DENIED',
    rationale: 'user_2 != user_1 and user_2 is not admin.',
  },
  {
    id: 'DD-03',
    name: 'Self-Admin Privilege Escalation',
    collectionPath: 'users/user_1',
    operation: 'create',
    expected: 'PERMISSION_DENIED',
    rationale: 'Create enforces incoming().role == "member".',
  },
  {
    id: 'DD-04',
    name: 'Shadow Field Injection',
    collectionPath: 'projects/proj_1',
    operation: 'create',
    expected: 'PERMISSION_DENIED',
    rationale: 'isValidProject enforces data.keys().hasOnly([...]).',
  },
  {
    id: 'DD-05',
    name: 'Fake Email Admin Spoof',
    collectionPath: 'adminAuditLogs/log_1',
    operation: 'create',
    expected: 'PERMISSION_DENIED',
    rationale: 'isAdmin() requires request.auth.token.email_verified == true.',
  },
  {
    id: 'DD-06',
    name: 'List Scraping Without Owner Filter',
    collectionPath: 'notes',
    operation: 'list',
    expected: 'PERMISSION_DENIED',
    rationale: 'allow list enforces resource.data.userId == request.auth.uid.',
  },
  {
    id: 'DD-07',
    name: 'Private Project Exfiltration',
    collectionPath: 'projects/private_proj_1/files/file_1',
    operation: 'get',
    expected: 'PERMISSION_DENIED',
    rationale: 'Master gate get() checks parent visibility == public or ownerId == uid.',
  },
  {
    id: 'DD-08',
    name: 'ID Poisoning',
    collectionPath: 'bookmarks/' + 'a'.repeat(500),
    operation: 'create',
    expected: 'PERMISSION_DENIED',
    rationale: 'isValidId enforces id.size() <= 128 and regex ^[a-zA-Z0-9_\\-]+$.',
  },
  {
    id: 'DD-09',
    name: 'Client Timestamp Forgery',
    collectionPath: 'notes/note_1',
    operation: 'create',
    expected: 'PERMISSION_DENIED',
    rationale: 'Create enforces incoming().createdAt == request.time.',
  },
  {
    id: 'DD-10',
    name: 'Owner Hijack on Update',
    collectionPath: 'projects/proj_1',
    operation: 'update',
    expected: 'PERMISSION_DENIED',
    rationale: 'Update enforces incoming().ownerId == existing().ownerId and affectedKeys().hasOnly.',
  },
  {
    id: 'DD-11',
    name: 'XP Exploitation',
    collectionPath: 'xpTransactions/tx_99',
    operation: 'create',
    expected: 'PERMISSION_DENIED',
    rationale: 'isValidXpTransaction enforces amount >= 5 && amount <= 250.',
  },
  {
    id: 'DD-12',
    name: 'Comment on Non-Existent Post',
    collectionPath: 'communityPosts/ghost_post/comments/c_1',
    operation: 'create',
    expected: 'PERMISSION_DENIED',
    rationale: 'Create enforces exists(/databases/$(database)/documents/communityPosts/$(postId)).',
  },
  {
    id: 'DD-13',
    name: 'Non-Admin Mission Publishing',
    collectionPath: 'missions/mission_1',
    operation: 'create',
    expected: 'PERMISSION_DENIED',
    rationale: 'missions write rules require isAdmin().',
  },
  {
    id: 'DD-14',
    name: 'Immutable Mission Evaluation Tampering',
    collectionPath: 'missionEvaluations/eval_1',
    operation: 'update',
    expected: 'PERMISSION_DENIED',
    rationale: 'missionEvaluations update is unconditionally denied.',
  },
  {
    id: 'DD-15',
    name: 'Completed Mission Attempt Rewind',
    collectionPath: 'missionAttempts/att_1',
    operation: 'update',
    expected: 'PERMISSION_DENIED',
    rationale: 'Terminal completed status prevents transitioning back to in_progress.',
  },
];
